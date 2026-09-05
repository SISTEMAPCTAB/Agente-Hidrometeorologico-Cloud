# Agente Hidrometeorológico Cloud

Sistema en nube para integrar, validar y presentar el análisis hidrometeorológico operativo diario de las 11:00 h para las cuencas Grijalva–Usumacinta.

## Arquitectura operativa final

El sistema trabaja de forma independiente de la computadora local y utiliza GitHub Cloud como fuente de verdad:

1. Recolecta y valida fuentes operativas y públicas.
2. Mantiene separados los datos actuales, heredados, rezagados y sin dato.
3. Integra niveles hidrométricos, lluvia, WeatherLink, CONAGUA/OCFS, SMN e INSIVUMEH.
4. Genera `data/analysis/latest.md` como análisis operativo vigente.
5. La PWA despliega directamente el último análisis en el apartado **Análisis 11:00 h**.
6. El Word se conserva sólo como salida complementaria opcional.

## Orden operativo de sistemas

1. **Presas–Mezcalapa–Samaria y Carrizal**
2. **Ríos Serranos–Grijalva**
3. **Tulijá–Puxcatán–Chilapa**
4. **Usumacinta**

Para Usumacinta se conserva la cadena de seguimiento:

`Chixoy/Salinas + La Pasión/El Porvenir + Usumacinta/El Tigre → Lacantún → Boca del Cerro → Balancán → Emiliano Zapata → Jonuta → Centla`

Los datos de estaciones con horas distintas no se consideran simultáneos. Los tiempos históricos de tránsito sólo se usan como contexto cuando existen observaciones compatibles y nunca de forma determinista.

## Reglas de calidad

- `sin dato` nunca equivale a cero.
- Un valor heredado o rezagado no se presenta como observación actual.
- La precipitación puntual no se suma para fabricar acumulados de cuenca.
- Los máximos BHVGM de INSIVUMEH son referencias estadísticas, no umbrales de inundación.
- Si El Tigre no aparece en el BHVGM vigente, no se fabrica ni se hereda como dato actual; el último valor anterior puede conservarse sólo como antecedente identificado.
- NAMO se usa como referencia de proximidad, no como semáforo oficial.

## PWA

La consulta operativa principal es la aplicación en `app/`.

El apartado **Análisis 11:00 h**:

- carga directamente `data/analysis/latest.md`;
- muestra fecha y hora del corte;
- identifica si el análisis es vigente o sólo antecedente;
- despliega encabezados, tablas, listas y conclusiones en móvil, tableta y PC;
- ofrece el Word actual únicamente como descarga complementaria cuando está verificado.

No es necesario mantener un historial visible de análisis en la aplicación. Los históricos técnicos que sí se conservan existen únicamente para cálculo de tendencias y control de calidad.

## Word complementario

Estado:
`data/analysis/Reportes/Estado_Word.json`

Último Word:
`data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx`

El Word no es el medio principal de consulta diaria.

## Seguridad

- No almacenar contraseñas, tokens o claves en el repositorio.
- Las credenciales se configuran exclusivamente como GitHub Actions Secrets.
- El repositorio debe permanecer privado.

## Operación cloud

Los recolectores y generadores se ejecutan mediante GitHub Actions y no requieren que la computadora local permanezca encendida.
