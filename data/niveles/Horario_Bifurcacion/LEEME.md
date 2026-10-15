# Horario_Bifurcacion

Producto ADITIVO (no modifica ningún otro producto del agente).

Cada hoja de niveles CONAGUA procesada por `src/niveles_horas_cloud.py` alimenta
`src/extraer_niveles_horarios_bifurcacion.js`, que acumula los niveles horarios de:
Malpaso y Peñitas (embalse, msnm), Platanar, Samaria, El Macayo (margen izquierda/derecha) y González.

- `niveles_horarios_bifurcacion.json` / `.csv`: histórico deduplicado por fecha_hora + estación.
- `diagnostico_ultimo.json`: encabezados detectados, desfase x y celdas asignadas de la última hoja.

Uso: calibrar en el Modelo Hidrológico Histórico el tiempo de tránsito Peñitas -> Samaria / Carrizal.
Si falla, sólo se imprime un aviso; la operación normal de niveles continúa.
