# Modelo Rubio/SegAMH

`latest.json` lo publica la PC del Modelo Hidrológico Histórico (script `exportar_modelo_agente.py`)
mediante la API de contenidos de GitHub, como máximo cada 3 h. Ningún flujo de GitHub Actions vigila
esta carpeta. El apartado "Modelo Rubio/SegAMH" del agente (`app/modelo-rubio.js`) sólo la lee.
