// Disparador externo aislado. No recolecta ni publica datos meteorológicos.
// GITHUB_TOKEN debe ser un secreto de Cloudflare, nunca una variable en el repositorio.
const API = "https://api.github.com/repos/SISTEMAPCTAB/Agente-Hidrometeorologico-Cloud/actions/workflows/weatherlink-30m-estable.yml/dispatches";
export default {
  async scheduled(controller, env) {
    if (env.ENABLED !== "true") {
      console.log(JSON.stringify({event:"disabled", at:new Date().toISOString()}));
      return;
    }
    if (!env.GITHUB_TOKEN) throw new Error("Falta secreto GITHUB_TOKEN");
    const started = new Date().toISOString();
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ipcet-weatherlink-trigger"
      },
      body: JSON.stringify({ref:"main", inputs:{}})
    });
    const body = await response.text();
    console.log(JSON.stringify({event:"dispatch", at:started, status:response.status, ok:response.status===204, response:body.slice(0,200)}));
    if (response.status !== 204) throw new Error(`GitHub dispatch: HTTP ${response.status}`);
  }
};
