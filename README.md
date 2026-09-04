# Agente Hidrometeorológico Cloud

Repositorio para la versión en nube del agente hidrometeorológico.

## Objetivo inicial

Ejecutar en paralelo, sin modificar ni desactivar el agente que actualmente funciona en la PC, la recolección de los dos boletines Carbonio que alimentan el análisis hidrometeorológico diario.

## Seguridad

- No almacenar contraseñas, tokens, XML de credenciales ni claves en el repositorio.
- Las credenciales se configurarán exclusivamente como GitHub Actions Secrets.
- Durante la etapa de prueba, la versión cloud no eliminará ni modificará archivos generados por el agente de la PC.
