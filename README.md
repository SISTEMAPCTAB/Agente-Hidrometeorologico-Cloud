# Agente Hidrometeorológico Cloud

Versión en nube del recolector que alimenta el análisis hidrometeorológico diario de las 11:00 h.

## Objetivo inicial

Ejecutar en paralelo, sin modificar ni desactivar el agente que actualmente funciona en la PC, la recolección de los dos boletines Carbonio.

La versión cloud:

- se autentica en Carbonio mediante GitHub Actions Secrets;
- localiza FUENTE1 y FUENTE2;
- descarga y valida los PDF;
- extrae su texto;
- publica `data/latest/FUENTE1.txt`, `data/latest/FUENTE2.txt` y `data/Estado_Cloud.json` dentro de este repositorio privado;
- conserva los PDF de cada ejecución únicamente como artifact temporal de GitHub Actions durante 7 días;
- mantiene un archivo de texto por fecha en `data/archive/` para comparaciones posteriores.

## Horarios

La acción intenta ejecutarse diariamente a las 09:30, 10:15 y 10:45 h de Tabasco/México durante 2026, además de permitir ejecución manual.

## Seguridad

- No almacenar contraseñas, tokens, XML de credenciales ni claves en el repositorio.
- Las credenciales se configuran exclusivamente como GitHub Actions Secrets `CARBONIO_USER` y `CARBONIO_PASSWORD`.
- El repositorio debe permanecer privado.
- Durante la etapa de prueba, la versión cloud no elimina ni modifica archivos generados por el agente de la PC ni escribe sobre la carpeta `Boletines_Carbonio` de Google Drive.

## Prueba manual

En GitHub: `Actions` → `Carbonio Cloud - boletines diarios` → `Run workflow` → `Run workflow`.

Después de una ejecución correcta deben aparecer archivos dentro de `data/latest/` y `data/Estado_Cloud.json`.
