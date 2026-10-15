// Despachador de GitHub Actions para Agente-Hidrometeorologico-Cloud.
//
// Por qué existe: el cron de GitHub Actions retrasa o pierde corridas bajo carga
// (en pruebas llegó ~8 % de las corridas de WeatherLink). Este Worker se activa cada
// minuto desde Cloudflare y lanza (workflow_dispatch) los workflows que le toquen.
//
// Secreto requerido (Settings > Variables and Secrets > tipo "Secret"):
//   GH_TOKEN  = token fino de GitHub, solo este repositorio, permiso "Actions: Read and write"
//               y "Contents: Read" (este último solo para la verificación de frescura).
// Variables opcionales (tipo "Text"):
//   DRY_RUN = 1   registra qué lanzaría, sin lanzar nada (úsalo en la primera prueba)
//   PAUSED  = 1   detiene todo sin redesplegar
//
// Horarios en UTC. Tabasco es UTC-6 todo el año (México ya no usa horario de verano).

const OWNER = "SISTEMAPCTAB";
const REPO = "Agente-Hidrometeorologico-Cloud";
const BRANCH = "main";
const API = "https://api.github.com";

const JOBS = [
  // Niveles hidrométricos (boletines por Gmail): 06:45 a 18:45 locales y refuerzos.
  { workflow: "gmail-backup-cloud.yml", crons: [
    "45 12,14,16,18,20,22,0 * * *", "15,45 13 * * *", "15 14 * * *", "15 1 * * *"] },
  // Análisis integral de las 11:05 hora de Tabasco.
  { workflow: "analysis-word.yml", crons: ["5 17 * * *"] },
  { workflow: "smn-cloud-fast.yml", crons: ["10,40 16 * * *", "10 17,19 * * *"] },
  { workflow: "acumulados-4872.yml", crons: ["45 12-23,0-3 * * *"] },
  { workflow: "fuentes-publicas-cloud.yml", crons: ["0 16,18,20,0,2 * * *"] },
  // SIH publica el PDF de lluvia de 24 h entre ~13:30 y ~16:30 hora de Tabasco (visto 13:38, 14:47 y 16:33
  // en tres días). Revisiones a las 14:00, 15:30 y 17:00 locales; las de 09:30, 11:00 y 22:00 nunca hallaron dato nuevo.
  { workflow: "sih-lluvia-conagua.yml", crons: ["0 20 * * *", "30 21 * * *", "0 23 * * *"] },
  { workflow: "alto-usumacinta-hidro.yml", crons: ["10 16,18,20,0,2 * * *"] },
  { workflow: "gastos-modelo.yml", crons: ["45 15 * * *", "30 17 * * *"] },
  // FUENTE1 (boletín de CONAGUA): llega entre 09:45 y 11:33 (mediana 10:01, medido en 32 días).
  // Se prueba varias veces alrededor de esa hora, pero solo mientras el boletín del día no esté
  // guardado en data/latest/FUENTE1.txt. Si no se puede leer, queda el horario de respaldo de 11:00.
  { workflow: "carbonio-cloud.yml",
    crons: ["55 15 * * *", "5,15,30,45 16 * * *", "0,30 17 * * *", "0 18 * * *"],
    gate: { kind: "bulletin", file: "data/latest/FUENTE1.txt", fallbackCron: "0 17 * * *" } },
  // WeatherLink: se revisa cada 10 min y solo se lanza si el último corte tiene más de
  // 20 min (misma regla que el propio workflow, pero sin gastar minutos de Actions).
  { workflow: "weatherlink-30m-estable.yml", crons: ["*/10 * * * *"], gate: {
    files: ["data/weatherlink/Estado_WeatherLink_Cloud.json", "data/weatherlink/extra_latest.json"],
    field: "run_utc", maxAgeMin: 20 } },
];

// ---- cron de 5 campos (listas, rangos y pasos), evaluado en UTC ----
function parseField(spec, min, max) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) { [lo, hi] = range.split("-").map(Number); }
    else { lo = Number(range); hi = stepStr ? max : lo; }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function cronMatches(expr, d) {
  const [mi, ho, dom, mo, dow] = expr.trim().split(/\s+/);
  const okDom = parseField(dom, 1, 31).has(d.getUTCDate());
  const okDow = new Set([...parseField(dow, 0, 7)].map((v) => v % 7)).has(d.getUTCDay());
  const dayOk = dom !== "*" && dow !== "*" ? okDom || okDow : okDom && okDow;
  return parseField(mi, 0, 59).has(d.getUTCMinutes())
    && parseField(ho, 0, 23).has(d.getUTCHours())
    && parseField(mo, 1, 12).has(d.getUTCMonth() + 1)
    && dayOk;
}

// ---- GitHub ----
function headers(env, accept = "application/vnd.github+json") {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "cf-worker-dispatcher", // GitHub rechaza peticiones sin User-Agent
  };
}

async function dispatch(workflow, env) {
  const url = `${API}/repos/${OWNER}/${REPO}/actions/workflows/${workflow}/dispatches`;
  const init = { method: "POST", headers: headers(env), body: JSON.stringify({ ref: BRANCH }) };
  let res = await fetch(url, init).catch(() => null);
  if (!res || res.status >= 500) {            // un reintento ante fallo de red o 5xx
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(url, init);
  }
  if (res.status !== 204) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status;
}

// Sitio público de Pages: sirve los mismos JSON sin token. Respaldo de la lectura por API.
const PAGES = "https://sistemapctab.github.io/Agente-Hidrometeorologico-Cloud";

async function readRunTime(url, init, field) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const iso = String((await res.json())[field] || "").replace(/(\.\d{3})\d+/, "$1");
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error("fecha ilegible");
  return t;
}

// Devuelve { age (minutos, o null si ninguna fuente respondió), via, err }.
async function ageMinutes(path, field, env, now) {
  const errs = [];
  try {
    const t = await readRunTime(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: headers(env, "application/vnd.github.raw+json") }, field);
    return { age: (now.getTime() - t) / 60000, via: "api" };
  } catch (e) { errs.push(`api: ${e.message}`); }
  try {
    const t = await readRunTime(`${PAGES}/${path}?t=${now.getTime()}`, {}, field);   // t= evita caché
    return { age: (now.getTime() - t) / 60000, via: "pages", err: errs[0] };
  } catch (e) { errs.push(`pages: ${e.message}`); }
  return { age: null, via: "ninguna", err: errs.join("; ") };
}

async function readText(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Boletín diario: "falta" mientras la fecha del mensaje guardado no sea la de hoy (hora de Tabasco).
async function checkBulletin(gate, env, now) {
  const hoy = new Date(now.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  const errs = [];
  let head = null, via = "";
  try {
    head = (await readText(`${API}/repos/${OWNER}/${REPO}/contents/${gate.file}?ref=${BRANCH}`,
      { headers: headers(env, "application/vnd.github.raw+json") })).slice(0, 1200);
    via = "api";
  } catch (e) { errs.push(`api: ${e.message}`); }
  if (head === null) {
    try { head = (await readText(`${PAGES}/${gate.file}?t=${now.getTime()}`, {})).slice(0, 1200); via = "pages"; }
    catch (e) { errs.push(`pages: ${e.message}`); }
  }
  const m = head && head.match(/FECHA\/HORA MENSAJE:\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    const lanza = cronMatches(gate.fallbackCron, now);
    return { stale: lanza, detail: `no se pudo leer la fecha del boletín (${errs.join("; ") || "formato inesperado"}); ${lanza ? "lanza por horario de respaldo" : "espera el horario de respaldo"}` };
  }
  const guardado = m[1] === hoy;
  return { stale: !guardado, detail: `boletín guardado: ${m[1]}, hoy: ${hoy} [vía ${via}] -> ${guardado ? "ya está" : "falta"}` };
}

async function checkGate(gate, env, now) {
  if (gate.kind === "bulletin") return checkBulletin(gate, env, now);
  const rs = await Promise.all(gate.files.map((f) => ageMinutes(f, gate.field, env, now)));
  const via = [...new Set(rs.map((r) => r.via))].join("+");
  const errs = rs.map((r) => r.err).filter(Boolean).join(" | ");
  if (rs.some((r) => r.age === null)) {
    // No se pudo medir la edad: antes se trataba como atrasado y se lanzaba cada 10 min.
    // Ahora solo se lanza en :00 y :30 (cadencia de 30 min) hasta que la lectura vuelva.
    const lanza = now.getUTCMinutes() % 30 === 0;
    return { stale: lanza, detail: `edad desconocida (${errs}); ${lanza ? "lanza por cadencia de 30 min" : "espera a :00/:30"}` };
  }
  const worst = Math.max(...rs.map((r) => r.age));
  return { stale: worst > gate.maxAgeMin,
    detail: `antigüedad máx ${worst.toFixed(1)} min (límite ${gate.maxAgeMin}) [vía ${via}${errs ? "; " + errs : ""}]` };
}

export default {
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime);
    if (env.PAUSED === "1") { console.log("[pausado]"); return; }
    if (!env.GH_TOKEN) { console.log("[error] falta el secreto GH_TOKEN"); return; }
    const due = JOBS.filter((j) => j.crons.some((c) => cronMatches(c, now)));
    await Promise.allSettled(due.map(async (j) => {
      try {
        if (j.gate) {
          const g = await checkGate(j.gate, env, now);
          console.log(`[${g.stale ? "atrasado" : "vigente"}] ${j.workflow}: ${g.detail}`);
          if (!g.stale) return;
        }
        if (env.DRY_RUN === "1") { console.log(`[dry-run] lanzaría ${j.workflow}`); return; }
        console.log(`[lanzado] ${j.workflow} -> HTTP ${await dispatch(j.workflow, env)}`);
      } catch (e) { console.log(`[error] ${j.workflow}: ${e.message}`); }
    }));
  },
};
