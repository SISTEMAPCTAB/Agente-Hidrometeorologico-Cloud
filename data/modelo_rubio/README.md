# Modelo Rubio/SegAMH

`latest.json` lo publica la PC del Modelo Hidrológico Histórico (script `exportar_modelo_agente.py`)
mediante la API de contenidos de GitHub, como máximo cada 3 h. Ningún flujo de GitHub Actions vigila
esta carpeta. El apartado "Modelo Rubio/SegAMH" del agente (`app/modelo-rubio.js`) sólo la lee.

Desde V111ac (12-nov-2026) la PC sólo publica corridas sólidas: si los niveles iniciales de la Sierra y Pueblo Nuevo tienen más de 6 h
(p. ej. la corrida de las 06:30, que partía de la lectura de las 18:00 del día anterior) no se publica y aquí queda la última corrida sólida.
`latest.json` trae `calidad_entrada` con la antigüedad de cada nivel.
