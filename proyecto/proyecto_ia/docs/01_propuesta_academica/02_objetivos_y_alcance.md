# Objetivos y Alcance del Proyecto

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Documento:** `docs/01_propuesta_academica/02_objetivos_y_alcance.md`  

---

## 1. Objetivo General

Desarrollar un sistema de software inteligente compuesto por una aplicación móvil con soporte sin conexión (*offline-first*) y un módulo de Inteligencia Artificial para el reconocimiento automático de la estructura de plantillas empresariales (Word y Excel), permitiendo la captura georreferenciada de evidencias, el estampado dinámico de metadatos, la reorganización interactiva de imágenes y la inyección automatizada con paginación continua y sincronización en la nube.

---

## 2. Objetivos Específicos

1. **Diseñar e implementar un módulo de captura y estampado fotográfico móvil configurable:**
   - Permitir la captura directa desde la cámara del dispositivo o la importación desde la galería.
   - Proveer un motor de sobreimpresión gráfica (*watermarking engine*) en tiempo real para fecha/hora, coordenadas GPS en múltiples formatos (grados decimales, sexagesimales, UTM), mini-mapa estático de localización, notas de texto corto, transparencias ajustables y logotipos corporativos personalizados.
   - Posibilitar la activación/desactivación opcional de la georreferenciación GPS.

2. **Desarrollar el componente de Inteligencia Artificial para Document Layout Analysis (DLA):**
   - Entrenar/afinar y evaluar un modelo de Visión por Computadora (YOLOv8-Doc / LayoutLM) capaz de detectar con precisión las regiones objetivo (*placeholders* de fotografías, celdas de leyendas y cabeceras) en páginas renderizadas de formatos `.docx` y `.xlsx`.
   - Implementar un algoritmo de alineación espacial que conecte las cajas delimitadoras (*bounding boxes*) de la IA con los elementos estructurales nativos del árbol OpenXML (tablas, celdas combinadas y contenedores).

3. **Construir el motor de inyección dinámica, ajuste dimensional y paginación inteligente:**
   - Detectar la capacidad de imágenes por página/sección y clonar de manera idéntica la estructura de la plantilla cuando la cantidad de fotos seleccionadas supere la capacidad de la hoja original.
   - Normalizar y ajustar automáticamente las dimensiones y relación de aspecto de las fotos al recuadro receptor sin distorsión geométrica.
   - Desarrollar la lógica de inspección de estado previo, permitiendo cargar un archivo previamente iniciado, identificar qué recuadros ya contienen imágenes y reanudar el llenado a partir del primer espacio disponible.

4. **Desarrollar una mesa de trabajo interactiva de organización y edición ágil:**
   - Implementar un panel visual tipo galería (*canvas / lightroom ligero*) para reordenar fotografías de forma intuitiva mediante arrastrar y soltar (*drag-and-drop*), tanto de manera individual como en bloque (*batch*).
   - Incluir herramientas de edición rápida: rotación (90°, 180°, 270°), recorte (*crop*) y eliminación de imágenes.

5. **Implementar la arquitectura de persistencia offline y sincronización multicanal:**
   - Garantizar el funcionamiento pleno en campo sin conexión a internet mediante una base de datos local embebida (SQLite).
   - Diseñar un despachador de tareas en segundo plano (*sync worker*) que ejecute la sincronización automática una vez se restablezca la conectividad.
   - Integrar conectores de almacenamiento en la nube (Microsoft OneDrive, SharePoint y Google Drive) y capacidades de compartición directa a través de canales estándar (WhatsApp, Telegram, Correo Electrónico).

---

## 3. Alcance del Proyecto

### 3.1. Qué incluye el proyecto (In-Scope)

| Módulo | Funcionalidades Incluidas en el Alcance |
| :--- | :--- |
| **Cámara & Estampado** | - Captura nativa de cámara y selector de galería.<br>- Parámetros de estampado configurables por el usuario (estilo TimeMark).<br>- Soporte de GPS opcional.<br>- Descarga/renderizado de mapa estático (cacheable para offline).<br>- Selector de logo personalizado y ajuste de opacidad/transparencia.<br>- Agrupación de fotos bajo la entidad "Proyecto". |
| **Plantillas & IA** | - Soporte para plantillas en formato Word (`.docx`) y Excel (`.xlsx`).<br>- Detección automática por IA de zonas para fotos y pies de foto.<br>- Replicación / clonado dinámico de hojas o secciones para excedentes de fotos.<br>- Reconocimiento de plantillas semidiligenciadas (reanudación del cargue sin sobreescritura).<br>- Ajuste y centrado automático de relación de aspecto (*aspect ratio fit/crop*). |
| **Edición & Mesa de Trabajo** | - Reorganización por Drag & Drop de fotos (individual y masiva).<br>- Edición rápida: rotar (90°), recortar (proporción libre/fija), eliminar. |
| **Salida & Conectividad** | - Exportación de archivos diligenciados nativos (`.docx`, `.xlsx`) y exportación a `.pdf`.<br>- Nomenclatura configurable de archivo (patrones por proyecto, fecha, código).<br>- Compartición nativa del sistema operativo (WhatsApp, Telegram, Email).<br>- Sincronización con OneDrive, SharePoint y Google Drive vía OAuth2 / APIs oficiales.<br>- Modo Offline total en captura y edición; sincronización automática al detectar red. |
| **Modelo de Usuario** | - Modelo Mono-usuario enfocado en un inspector/auditor profesional independiente. |

---

### 3.2. Qué NO incluye el proyecto (Out-of-Scope para el MVP de Grado)

- Soporte para formatos legacy binarios cerrados como Word 97-2003 (`.doc`) o Excel 97-2003 (`.xls`) que no admitan OpenXML de forma nativa (se recomendará al usuario convertir previamente a `.docx` / `.xlsx` o se implementará un conversor estándar de paso previo).
- Módulo multi-inquilino (*multi-tenant*) corporativo con roles complejos (administrador, gerente de proyecto, inspector júnior) con flujos de aprobación jerárquica en tiempo real (queda planteado como trabajo futuro).
- Edición fotográfica avanzada (filtros artísticos, retoque de colorimetría o eliminación de objetos por IA tipo Magic Eraser).
- Facturación, pasarelas de pago o suscripciones comerciales in-app.

---

## 4. Supuestos y Restricciones

### Supuestos:
1. El dispositivo móvil del usuario cuenta con sensores de GPS y cámara con resolución mínima de 8 Megapíxeles.
2. Las plantillas empresariales poseen una coherencia visual mínima (tablas con bordes identificables, recuadros rectangulares o textos guía tipo "Inserte foto aquí").
3. El usuario cuenta con cuentas activas de almacenamiento en la nube (Microsoft 365 o Google Workspace) si desea hacer uso de la sincronización remota.

### Restricciones:
1. **Límites de hardware móvil:** Para preservar la autonomía de batería en campo, la inferencia pesada de IA para detección de plantillas puede ejecutarse en un backend ligero o mediante un modelo ONNX cuantizado en el dispositivo si la memoria RAM lo permite.
2. **Offline Maps:** Sin conexión a internet, el mini-mapa mostrará la última tesela almacenada en caché local o coordenadas en cuadrícula gráfica si la zona nunca fue precargada.
3. **Tiempo de desarrollo académico:** El proyecto se estructura para ser implementado, probado y validado en un horizonte de 16 a 24 semanas dentro del calendario académico de la especialización.
