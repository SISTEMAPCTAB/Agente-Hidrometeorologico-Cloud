# Prueba aislada: reloj externo WeatherLink
Esta rama NO activa Cloudflare ni modifica GitHub Actions, los recolectores ni los productos del mapa.

## Objetivo
Comprobar durante 24 horas si el reloj de Cloudflare consigue iniciar puntualmente el workflow existente `weatherlink-30m-estable.yml`. El Worker sólo emite `workflow_dispatch` sobre `main`; no tiene acceso al modelo ni a TIKLÁYA.

## Preparación
1. Crear un Worker en una cuenta Cloudflare autorizada y cargar los archivos de esta carpeta.
2. Configurar el secreto `GITHUB_TOKEN` con un token de GitHub de acceso específico al repositorio, permiso **Actions: Read and write**, sin permisos de código adicionales. No insertar el token en archivos ni mensajes.
3. Conservar `ENABLED=false` durante la preparación. Para iniciar la prueba cambiar `ENABLED=true` en el entorno del Worker.
4. Antes de pasar a producción, comprobar que Cloudflare registra HTTP 204 y que GitHub recibe eventos `workflow_dispatch`; medir la hora de publicación de `data/weatherlink/Estado_WeatherLink_Cloud.json` y del JSON adicional.
5. No retirar todavía el cron nativo: el workflow controla frescura de los cortes. Una vez comprobada la estabilidad en producción, desactivar el cron de GitHub en un cambio separado y vigilado.

## Límites y seguridad
- HTTP 204 significa que GitHub aceptó la solicitud, no que el job comenzó ni que publicó los datos.
- GitHub puede tener cola interna incluso con disparadores externos.
- Este Worker NO incluye cron de recuperación ni modifica archivos existentes.
- Nunca registrar credenciales.
- Si falla el disparo o la publicación, mantener el sistema anterior y no tocar niveles, Gmail, INSIVUMEH ni TIKLÁYA.
