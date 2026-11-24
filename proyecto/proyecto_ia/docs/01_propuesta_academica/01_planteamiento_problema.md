# Planteamiento del Problema y Justificación

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Documento:** `docs/01_propuesta_academica/01_planteamiento_problema.md`  

---

## 1. Contexto y Antecedentes

En múltiples sectores productivos —tales como la construcción, la supervisión de obras civiles, el tendido de redes de telecomunicaciones, la minería, la auditoría ambiental, los peritajes de aseguradoras y el mantenimiento industrial— la generación de **reportes fotográficos de evidencia** constituye una obligación contractual, técnica y legal de carácter prioritario.

Cada jornada laboral en campo genera decenas o cientos de fotografías que deben cumplir dos condiciones esenciales:
1. **Verificabilidad y Trazabilidad:** Las imágenes deben contener marcas indelebles de fecha, hora exacta, georreferenciación (coordenadas GPS en formatos decimales o sexagesimales/UTM), referencias cartográficas (mini-mapas), descripciones técnicas del ítem inspeccionado y la imagen corporativa (logo institucional).
2. **Estandarización Corporativa:** Las evidencias no se entregan como archivos sueltos, sino estructuradas dentro de **plantillas oficiales** de la empresa contratante o fiscalizadora. Estas plantillas están comúnmente diseñadas en procesadores de texto (**Microsoft Word - `.docx`**) o libros de cálculo (**Microsoft Excel - `.xlsx`**), estableciendo esquemas rígidos de presentación: encabezados de proyecto, tablas con número predeterminado de fotos por hoja (habitualmente 2, 4 o 6 fotos por página), casillas de descripción, numeración consecutiva y firmas de responsabilidad.

---

## 2. Descripción de la Problemática

A pesar de los avances en digitalización móvil, el flujo de trabajo actual en las organizaciones presenta una **profunda brecha de automatización y una alta fragmentación operativa**:

### A. Fragmentación de herramientas
Los inspectores de campo recurren a aplicaciones móviles como [*TimeMark*](https://www.timemark.com) o [*Timestamp Camera*](file:///c:/Users/omar/Desktop/proyecto_ia/docs/01_propuesta_academica/05_analisis_benchmark_timemark_timestamp.md) (Bian Di) para sobreimprimir coordenadas y marcas temporales. Sin embargo, estas aplicaciones finalizan su alcance una vez guardada la imagen en la galería del teléfono, dejando completamente desconectada la fase de reporte documental. (Ver análisis a fondo en [`05_analisis_benchmark_timemark_timestamp.md`](file:///c:/Users/omar/Desktop/proyecto_ia/docs/01_propuesta_academica/05_analisis_benchmark_timemark_timestamp.md)).

### B. Proceso manual intensivo y repetitivo
Una vez recolectadas las fotografías, el profesional debe:
- Transferir las imágenes del dispositivo móvil a una computadora de escritorio (vía cable, mensajería instantánea o correo, perdiendo en ocasiones calidad o metadatos EXIF).
- Abrir la plantilla institucional de la empresa.
- Insertar, redimensionar, recortar y alinear manualmente cada fotografía dentro de las celdas de las tablas o cuadros de Word/Excel.
- Si la plantilla fue diseñada para 4 fotos por hoja y el reporte contiene 28 fotos, el usuario debe copiar, pegar y maquetar 6 páginas adicionales manualmente, cuidando no alterar márgenes ni encabezados.
- Transcribir o reescribir los textos descriptivos.

> [!WARNING]
> **Costo de Oportunidad y Pérdida de Productividad:**
> Diversos estudios de eficiencia operativa estiman que un inspector o ingeniero residente invierte entre **1.5 y 3 horas diarias** exclusivamente en labores de ensamblaje manual de reportes fotográficos. Esto genera fatiga operativa, retrasos en la entrega de reportes diarios de obra y un alto costo administrativo indirecto.

### C. Heterogeneidad inmanejable mediante programación tradicional
Cada empresa cliente o contratista cuenta con su propia plantilla:
- Algunas utilizan tablas de 1 columna con 2 filas (foto arriba, descripción abajo).
- Otras emplean tablas de 2 columnas con recuadros para 4 o 6 fotografías por hoja.
- En Excel, el diseño involucra celdas combinadas (*merged cells*) con bordes de tamaño variable.
- Desarrollar un script tradicional mediante reglas fijas (*hard-coded rules*) resulta insostenible, ya que cualquier cambio en una celda, margen o versión de plantilla invalida el script.

### D. Conectividad intermitente en campo
Las actividades de supervisión suelen ejecutarse en zonas rurales, túneles, sótanos o áreas con nula cobertura celular, lo cual exige que la captura, el cálculo geográfico y el almacenamiento local funcionen al 100% en modo **desconectado (offline)**, con mecanismos robustos de sincronización posterior.

---

## 3. Formulación del Problema

### Pregunta Principal de Investigación:
> *¿Cómo diseñar e implementar un sistema inteligente móvil y de backend que integre Visión por Computadora y Análisis Estructural de Documentos (Document Layout Analysis) para reconocer de manera automática la disposición espacial y semántica de plantillas empresariales (.docx y .xlsx), automatizando el estampado georreferenciado, la inyección masiva de fotos y la replicación dinámica de páginas con capacidades offline y sincronización en la nube?*

### Preguntas Específicas:
1. ¿Qué arquitectura de visión por computadora y análisis de layout es la más adecuada para detectar con alta precisión (*IoU > 0.85*) los recuadros destinados a fotografías y sus respectivos rótulos en formatos heterogéneos de Word y Excel?
2. ¿Cómo sincronizar la detección visual de los recuadros con el árbol de etiquetas OpenXML subyacente para inyectar imágenes sin corromper el diseño ni la maquetación original del documento?
3. ¿Cuál es el mecanismo algorítmico óptimo para identificar la unidad mínima repetitiva (patrón de página/sección) y clonarla dinámicamente según la cantidad arbitraria de fotografías seleccionadas por el usuario?
4. ¿Cómo estructurar un pipeline de captura móvil con bajo consumo energético que permita estampar metadatos geoespaciales, mapas estáticos y logos en tiempo real sin conexión a internet?

---

## 4. Justificación del Proyecto

### 4.1. Justificación Académica y Científica (Especialización en IA)
El proyecto se enmarca en la disciplina de **Document Layout Analysis (DLA)** y **Comprensión Semántica de Documentos Multimodales**. Supera los métodos tradicionales de extracción basada en OCR mediante el uso de redes neuronales convolucionales o arquitecturas Transformer de visión aplicadas a la inferencia espacial de plantillas administrativas. Representa una aplicación concreta de IA aplicada para resolver problemas del mundo real donde los datos de entrada (documentos Office) no cuentan con esquemas predefinidos estandarizados.

### 4.2. Justificación Técnica
La propuesta fusiona tecnologías modernas de desarrollo multiplataforma móvil (offline-first con persistencia local en SQLite), servicios de visión artificial en backend o edge, y manipulación directa de estándares abiertos de documentos (ISO/IEC 29500 - Office Open XML), integrando además servicios de almacenamiento en la nube (Microsoft Graph API, Google Drive API).

### 4.3. Justificación Económica y Operativa
La automatización del proceso de armado de reportes reduce el tiempo invertido por reporte de **~120 minutos a menos de 3 minutos** (un ahorro superior al 95%). Esto permite a las empresas:
- Entregar informes el mismo día de la inspección.
- Evitar disputas contractuales por falta de evidencia oportuna.
- Reducir el estrés y la carga administrativa del personal técnico.

---

## 5. Alcance Preliminar del Usuario

Para efectos del presente proyecto de grado de especialización, el sistema estará enfocado inicialmente en un modelo **mono-usuario profesional**, optimizando al máximo la experiencia de un auditor/inspector individual en campo antes de escalar a esquemas multi-tenant corporativos.
