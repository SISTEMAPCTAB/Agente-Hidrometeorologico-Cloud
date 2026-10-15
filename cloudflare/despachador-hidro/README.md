# Despachador de Cloudflare (`despachador-hidro`)

Worker gratuito de Cloudflare que funciona como **reloj externo** del agente.
El cron de GitHub Actions retrasa o pierde corridas bajo carga (en octubre de 2026
llegaban unas 3 a 5 de 48 corridas diarias de WeatherLink, y el análisis de las
11:05 llegó casi 5 horas tarde). Este Worker se activa cada minuto y lanza con
`workflow_dispatch` los workflows que corresponden a esa hora.

`worker.js` es la copia de respaldo del código desplegado en Cloudflare
(Workers & Pages → `despachador-hidro`). Si se edita aquí, hay que pegarlo también
en Cloudflare y desplegar; el repositorio no lo despliega solo.

## Cómo funciona

- Cron Trigger de Cloudflare: `* * * * *` (una vez por minuto, en UTC).
- La tabla `JOBS` de `worker.js` copia los horarios `cron:` de los workflows.
  **Si se cambia un cron en `.github/workflows/`, hay que cambiarlo también en `JOBS`.**
- WeatherLink no usa horario fijo: cada 10 minutos el Worker lee la edad de
  `data/weatherlink/Estado_WeatherLink_Cloud.json` y `data/weatherlink/extra_latest.json`
  y solo lanza el workflow si el corte tiene más de 20 minutos. Así no se gastan
  minutos de Actions en corridas que no recolectan nada.

- **Boletín FUENTE1 (CONAGUA).** Llega entre 09:45 y 11:33 hora de Tabasco (mediana 10:01, medido en
  32 días con la hora real de los correos en el historial de `data/Estado_Cloud.json`). El Worker
  lanza `carbonio-cloud.yml` a las 09:55, 10:05, 10:15, 10:30, 10:45, 11:00, 11:30 y 12:00, pero solo
  mientras la fecha de `FECHA/HORA MENSAJE` en `data/latest/FUENTE1.txt` no sea la de hoy. En cuanto
  el boletín queda guardado, los intentos restantes del día se saltan. Si no puede leer el archivo
  (API y Pages), lanza solo a las 11:00. FUENTE2 la recoge `gmail-backup-cloud.yml` (llega 08:06–08:45).
- **Lectura de la edad del corte.** Primero por la API de GitHub (con `GH_TOKEN`) y, si falla,
  por el sitio público de Pages, que sirve los mismos JSON sin token. Si no se puede medir por
  ninguna vía, solo lanza en los minutos :00 y :30. Los registros indican la vía usada
  (`[vía api]` o `[vía pages; api: HTTP …]`).
- **Fuente única de horarios.** Desde el 15 de octubre de 2026 los workflows listados en `JOBS`
  ya no tienen cron de GitHub (era un duplicado que gastaba minutos). Quedan con cron propio solo
  `sih-watchdog`, `smn-watchdog` y `probar-tonala`, que funcionan como red de seguridad.

## Configuración en Cloudflare (Settings → Variables and Secrets)

| Nombre | Tipo | Uso |
|---|---|---|
| `GH_TOKEN` | Secret | Token fino de GitHub, solo este repositorio. Permisos: Actions (lectura y escritura) y Contents (solo lectura). |
| `DRY_RUN` | Text | Si vale `1`, el Worker solo registra lo que lanzaría. Debe estar ausente en operación normal. |
| `PAUSED` | Text | Si vale `1`, el Worker no hace nada. Sirve para pausar sin tocar el código. |

## Operación

- **Ver qué hace:** Cloudflare → Worker → Observability → Logs. Los mensajes son
  `[vigente]`, `[atrasado]`, `[lanzado]`, `[dry-run]` y `[error]`.
- **Renovar el token:** el token vence cada año. Crear uno nuevo en GitHub (Settings →
  Developer settings → Fine-grained tokens), reemplazar el secreto `GH_TOKEN` en
  Cloudflare y borrar el anterior. Si el token vence, el Worker deja de lanzar sin avisar
  y solo queda el cron de GitHub como respaldo.
- **Errores `HTTP 403` o `404` al lanzar:** el token no tiene los permisos indicados,
  no incluye este repositorio o el nombre del workflow en `JOBS` ya no existe.
- **Nunca guardar el token en el repositorio.**

## Costo

Plan gratuito de Cloudflare Workers: 1 de 5 Cron Triggers y unas 1,440 ejecuciones
al día frente al límite de 100,000. Los minutos de GitHub Actions que consumen los
workflows que el Worker lanza se cobran aparte, en la cuenta de GitHub.
