// Extractor ADITIVO y no bloqueante: niveles HORARIOS (01:00-24:00) de la hoja de niveles CONAGUA para
// Malpaso y Peñitas (embalses), Platanar, Samaria, El Macayo (margen izquierda/derecha) y González.
// Propósito: calibrar el tiempo de tránsito Peñitas -> Samaria / Carrizal en el Modelo Hidrológico.
// No modifica ningún producto existente: sólo escribe data/niveles/Horario_Bifurcacion/.
const fs = require('fs');
const path = require('path');

function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
const pdfPath = arg('--pdf'), subject = arg('--subject', ''), messageId = arg('--message-id', ''), base = arg('--base');
if (!pdfPath || !base) { console.error('Faltan --pdf o --base'); process.exit(2); }

// Columnas buscadas por su encabezado y rango físico plausible del nivel (m) para descartar celdas ajenas.
const COLUMNAS = [
  { clave: 'Malpaso', patrones: ['MALPASO'], tipo: 'embalse', min: 120, max: 200 },
  { clave: 'Peñitas', patrones: ['PENITAS'], tipo: 'embalse', min: 60, max: 100 },
  { clave: 'Platanar', patrones: ['PLATANAR'], tipo: 'rio', min: 15, max: 50 },
  { clave: 'Samaria', patrones: ['SAMARIA'], tipo: 'rio', min: 5, max: 25 },
  { clave: 'Macayo margen izquierda', patrones: ['IZQUIERDA'], tipo: 'rio', min: 5, max: 30 },
  { clave: 'Macayo margen derecha', patrones: ['DERECHA'], tipo: 'rio', min: 5, max: 30 },
  { clave: 'González', patrones: ['GONZALEZ'], tipo: 'rio', min: 0, max: 15 },
];

function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function isNumeric(s) { return /^-?\d+(?:[.,]\d+)?$/.test(String(s).trim()); }
function toNum(s) { let t = String(s).trim(); if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.'); else t = t.replace(/,/g, ''); const v = Number(t); return Number.isFinite(v) ? v : null; }
function median(a) { a = [...a].sort((x, y) => x - y); if (!a.length) return null; return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; }
function parseDate(text) {
  const t = norm(text), m = t.match(/(?:A|DEL)\s+(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);
  if (!m) return null;
  const mo = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 }[m[2]];
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
async function extract(pdf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)), disableWorker: true }).promise;
  const page = await doc.getPage(1), tc = await page.getTextContent();
  return tc.items.map(it => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), w: Number(it.width || 0) })).filter(it => it.str);
}
function load(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }

(async () => {
  const outDir = path.join(base, 'Horario_Bifurcacion');
  fs.mkdirSync(outDir, { recursive: true });
  const items = await extract(pdfPath), date = parseDate(items.map(x => x.str).join(' '));
  const diag = { generado_utc: new Date().toISOString(), archivo: path.basename(pdfPath), asunto: subject, message_id: messageId, fecha: date, encabezados: {}, desfase_x: null, filas: [] };
  if (!date) throw new Error('Sin fecha en la hoja');

  // 1) Encabezados: posición x de cada columna (la zona de encabezados está arriba de la fila 01:00).
  const horas = items.filter(it => /^\d{1,2}:00$/.test(it.str));
  if (!horas.length) throw new Error('Sin filas horarias');
  const yTop = Math.max(...horas.map(h => h.y));
  const headerX = {};
  for (const c of COLUMNAS) {
    // pdf.js puede fusionar encabezados contiguos en un solo item ("PLATANAR SAMARIA"): se interpola la x por la posición del texto.
    const xsHit = [];
    for (const it of items) {
      if (!(it.y > yTop + 2)) continue;
      const t = norm(it.str);
      for (const p of c.patrones) { const i = t.indexOf(p); if (i >= 0) { xsHit.push(it.x + (t.length > p.length ? it.w * i / t.length : 0)); break; } }
    }
    if (xsHit.length) headerX[c.clave] = median(xsHit);
  }
  diag.encabezados = headerX;
  const claves = Object.keys(headerX);
  if (claves.length < 3) throw new Error('Encabezados insuficientes: ' + JSON.stringify(headerX));
  const xs = claves.map(k => headerX[k]).sort((a, b) => a - b);
  const sep = Math.min(...xs.slice(1).map((x, i) => x - xs[i]).filter(d => d > 3));

  // 2) Filas horarias: celdas numéricas a la derecha de la etiqueta de hora.
  const filas = horas.map(h => ({ hour: Number(h.str.split(':')[0]), cells: items.filter(it => Math.abs(it.y - h.y) <= 2.8 && it.x > h.x + 5 && isNumeric(it.str)) }));

  // 3) Desfase x entre texto vertical del encabezado y valores: se elige el que minimiza la distancia total.
  let best = { off: 0, cost: Infinity };
  for (let off = -16; off <= 6; off += 0.5) {
    let cost = 0;
    for (const f of filas) for (const cell of f.cells) {
      const d = Math.min(...claves.map(k => Math.abs(cell.x - (headerX[k] + off))));
      if (d < sep * 0.6) cost += d; else cost += sep * 0.6;
    }
    if (cost < best.cost) best = { off, cost };
  }
  diag.desfase_x = best.off;

  // 4) Asignación columna -> valor con tolerancia y rango físico.
  const rows = [];
  for (const f of filas) {
    if (f.hour < 0 || f.hour > 24) continue;
    // 24:00 se registra como 00:00 del día siguiente.
    const d0 = f.hour === 24 ? new Date(Date.parse(date + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10) : date;
    const stamp = `${d0}T${String(f.hour % 24).padStart(2, '0')}:00:00-06:00`;
    const got = {};
    for (const cell of f.cells) {
      let k = null, d = Infinity;
      for (const kk of claves) { const dd = Math.abs(cell.x - (headerX[kk] + best.off)); if (dd < d) { d = dd; k = kk; } }
      if (!k || d > sep * 0.45) continue;
      const col = COLUMNAS.find(c => c.clave === k), v = toNum(cell.str);
      if (v == null || v < col.min || v > col.max) continue;
      if (got[k] == null) got[k] = v;
    }
    for (const [k, v] of Object.entries(got)) {
      rows.push({ fecha_hora: stamp, estacion: k, tipo: COLUMNAS.find(c => c.clave === k).tipo, nivel_m: v, fuente: path.basename(pdfPath), asunto: subject, message_id: messageId });
    }
    diag.filas.push({ hora: f.hour, celdas: f.cells.length, asignadas: Object.keys(got).length });
  }

  // 5) Archivo histórico acumulado (deduplicado por fecha_hora + estación; el último boletín prevalece).
  const histFile = path.join(outDir, 'niveles_horarios_bifurcacion.json');
  const map = new Map(load(histFile, []).map(r => [`${r.fecha_hora}|${r.estacion}`, r]));
  let nuevos = 0;
  for (const r of rows) { const k = `${r.fecha_hora}|${r.estacion}`; if (!map.has(k)) nuevos++; map.set(k, r); }
  const hist = [...map.values()].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora) || a.estacion.localeCompare(b.estacion, 'es'));
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 1));
  const cols = ['fecha_hora', 'estacion', 'tipo', 'nivel_m', 'fuente', 'message_id'];
  fs.writeFileSync(path.join(outDir, 'niveles_horarios_bifurcacion.csv'), cols.join(',') + '\n' + hist.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'));
  diag.registros_boletin = rows.length; diag.nuevos = nuevos; diag.total_historico = hist.length;
  fs.writeFileSync(path.join(outDir, 'diagnostico_ultimo.json'), JSON.stringify(diag, null, 1));
  console.log(`Horario bifurcación: ${rows.length} lecturas en el boletín, ${nuevos} nuevas, ${hist.length} en histórico; desfase x ${best.off}`);
})().catch(e => { console.error('Horario bifurcación no disponible: ' + e.message); process.exit(1); });
