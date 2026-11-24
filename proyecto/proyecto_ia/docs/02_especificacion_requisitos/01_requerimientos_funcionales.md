# Especificación de Requerimientos Funcionales (RF)

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Documento:** `docs/02_especificacion_requisitos/01_requerimientos_funcionales.md`  

---

## 1. Matriz Resumen de Requerimientos Funcionales

| Código | Módulo | Nombre del Requerimiento | Prioridad |
| :--- | :--- | :--- | :---: |
| **RF-01** | Proyectos | Gestión de Proyectos de Inspección | Alta |
| **RF-02** | Captura | Captura de Fotografía en Campo e Importación | Alta |
| **RF-03** | Estampado | Motor de Estampado de Metadatos Configurable (Tipo TimeMark) | Alta |
| **RF-04** | Geolocalización | Adquisición y Formato de Coordenadas GPS Opcionales | Alta |
| **RF-05** | Cartografía | Renderizado de Mini-Mapa Estático | Media |
| **RF-06** | Plantillas | Carga de Plantillas Empresariales (.docx y .xlsx) | Alta |
| **RF-07** | Inteligencia Artificial | Detección Automática de Cajas Fotográficas y Pies de Foto | Alta |
| **RF-08** | Inyección & Paginación | Inyección Masiva, Ajuste Dimensional y Clonación Dinámica | Alta |
| **RF-09** | Reanudación | Detección de Estado Previo en Formatos Iniciados | Alta |
| **RF-10** | Mesa de Trabajo | Reorganización Interactiva de Fotos (Drag & Drop) | Alta |
| **RF-11** | Edición Rápida | Herramientas de Rotación, Recorte y Eliminación de Fotos | Alta |
| **RF-12** | Exportación | Nomenclatura Personalizada y Exportación (.docx, .xlsx, .pdf) | Alta |
| **RF-13** | Conectividad Cloud | Sincronización con OneDrive, SharePoint y Google Drive | Media |
| **RF-14** | Compartición | Compartición Directa a Canales Externos (WhatsApp, Telegram, Correo) | Alta |
| **RF-15** | Modo Offline | Operación Completa Sin Conexión a Internet | Alta |

---

## 2. Detalle de Requerimientos Funcionales

### RF-01: Gestión de Proyectos de Inspección
- **Descripción:** El sistema debe permitir al usuario crear, listar, editar y seleccionar proyectos o frentes de obra. Todas las fotografías y reportes generados deberán quedar vinculados a un proyecto específico.
- **Campos del Proyecto:** Nombre del proyecto, código/contrato, cliente/empresa, fecha de creación, notas generales y logo predeterminado del proyecto.
- **Salida:** Identificador único de proyecto y contexto activo en la aplicación.

---

### RF-02: Captura de Fotografía en Campo e Importación
- **Descripción:** El sistema debe proveer una interfaz de cámara integrada y la opción de importar una o múltiples fotografías desde la galería del dispositivo móvil.
- **Entradas:** Disparo de cámara nativa o selección múltiple de archivos de imagen (.jpg, .jpeg, .png).
- **Procesamiento:** Extracción de metadatos EXIF originales (si provienen de galería) o lectura de sensores en tiempo real (si es captura en vivo).
- **Salida:** Imagen cruda almacenada en almacenamiento local seguro y registro en la base de datos local.

---

### RF-03: Motor de Etiquetado y Estampado en Vivo (Opcional, Agrupado y Modular)
- **Descripción:** El etiquetado se realiza en tiempo real **al momento de la toma** de la fotografía. **Esta opción NO es obligatoria**: el usuario decide libremente qué elementos sobreimprimir o si prefiere capturar la fotografía completamente limpia sin ningún estampado.
- **Módulos Configurables Independientes (Switches On/Off):**
  1. **Fecha y Hora (Opcional):** Selector de formatos comerciales más utilizados:
     - `DD/MM/AAAA` (Estándar comercial Latinoamérica / Europa, ej. `09/10/2026`).
     - `DD/MM/AAAA HH:mm:ss` (Formato 24 horas con segundos, ej. `09/10/2026 14:32:10`).
     - `DD/MM/AAAA hh:mm:ss a` (Formato 12 horas con AM/PM, ej. `09/10/2026 02:32:10 PM`).
     - `AAAA-MM-DD` (Estándar internacional ISO 8601, ej. `2026-10-09`).
     - `DD de [Mes] de AAAA` (Formato verbal corporativo, ej. `09 de Octubre de 2026`).
  2. **Ubicación y Posición Geográfica (Opcional):** Soporte de sistemas mundiales y **sistemas oficiales de Colombia**:
     - **MAGNA-SIRGAS CTM12 (EPSG:9377):** Sistema oficial de coordenadas planas de Colombia con Origen Nacional Único ($\phi_0=4^\circ\text{ N}, \lambda_0=73^\circ\text{ W}, k_0=0.9992, X_0=5.000.000\text{ m}, Y_0=2.000.000\text{ m}$).
     - **MAGNA-SIRGAS Origen Bogotá (EPSG:3116):** Sistema oficial para la zona central de Colombia ($\phi_0=4^\circ 35' 46.32''\text{ N}, \lambda_0=74^\circ 04' 39.03''\text{ W}, k_0=1.0, X_0=1.000.000\text{ m}, Y_0=1.000.000\text{ m}$).
     - **Sistema UTM (Universal Transverse Mercator):** Estándar comercial en obras civiles, topografía y minería (ej. `Zona 18N, E: 598432 m, N: 509214 m`).
     - **Grados Decimales (DD / WGS84):** Estándar de smartphones y navegadores (ej. `Lat: 4.60971°, Lon: -74.08175°`).
     - **Grados, Minutos y Segundos (DMS):** Estándar tradicional topográfico (ej. `04°36'35.0" N, 74°04'54.3" W`).
     - **Grados y Minutos Decimales (DDM):** Estándar de navegación (ej. `04°36.583' N, 74°04.905' W`).
     - **Dirección Urbana / Nomenclatura:** Dirección física o sector urbano geocodificado.
  3. **Identificación de Municipio y Departamento (Opcional):**
     - Detección automática en campo mediante sensores GPS y algoritmo de vecino espacial más cercano contra base de datos geográfica offline de Colombia (cero consumo de internet).
     - Visualización explícita del Municipio y Departamento tanto en el visor de cámara como en la estampa final y columna de Excel.
     - Posibilidad de edición manual o corrección rápida por parte del usuario.
  4. **Mini-mapa de Ubicación con Escala y Zoom Ajustable (Opcional):**
     - Recuadro gráfico interactivo con visualización cartográfica y punto rojo con aro blanco en la posición exacta.
     - **Control de Zoom y Escala de Detalle:** Slider y botones $+/-$ con rango de zoom 12 a 19 (12: Región Macro, 16: Detalle Obra, 19: Detalle Predial), operable desde el panel de ajustes y directamente sobre el mini-mapa en el visor de cámara.
  5. **Estilos de Texto y Rótulo de Estampado Agrupado:**
     - **Tipografía (Tipo de letra):** Sans-Serif (Moderna/Inter), Monospace (Técnica/GPS), Condensada (Ingeniería/DIN) y Serif (Informe formal).
     - **Tamaño de Letra:** Pequeño (compacto), Normal (estándar) y Grande (alta legibilidad).
     - **Color de Texto y Paleta:** Blanco, Amarillo, Cian, Verde, Naranja y selector hexadecimal personalizado.
     - **Opacidad del Texto:** Ajuste gradual del 30% al 100% independiente del fondo.
     - **Ubicación Agrupada del Rótulo:** Obligatoriedad de **mantener los textos agrupados** en un bloque unificado, con 5 opciones de ubicación: `Inferior Completo (Cintillo)`, `Inferior Izquierda (Tarjeta)`, `Inferior Derecha (Tarjeta)`, `Superior Izquierda (Tarjeta)` y `Superior Derecha (Tarjeta)`.
  6. **Texto Corto / Notas de Campo (Opcional):** Campo alfanumérico para describir el elemento inspeccionado (ej. "Zapata Torre 24").
  7. **Logo Corporativo (Opcional):** Inclusión o exclusión del logo institucional con ajuste de tamaño ($24\text{ px}$ a $96\text{ px}$), opacidad ($10\%$ a $100\%$) y algoritmo anti-solapamiento estricto.
  8. **Caja de Fondo y Transparencia:** Control deslizante de opacidad de fondo de la tarjeta/cintillo (de 0% totalmente transparente a 100% sólido).
- **Salida:** Imagen procesada con los elementos agrupados que el usuario haya decidido activar al momento del disparo.

---

### RF-04: Gestión de Geodesia, Proyecciones Colombianas y Detección de Municipio
- **Descripción:** La captura de la posición GPS es totalmente opcional. Si el usuario la activa, el sistema realiza de forma instantánea y local (sin requerir internet) el cálculo geodésico exacto sobre el elipsoide GRS80 para las proyecciones oficiales de Colombia (**CTM12 - EPSG:9377** y **MAGNA-SIRGAS Bogotá - EPSG:3116**), así como la resolución espacial del Municipio y Departamento respectivo.

---

### RF-05: Renderizado de Mini-Mapa Estático con Escala Dinámica
- **Descripción:** Cuando el usuario active la opción de mini-mapa, el sistema renderizará un recuadro gráfico con una vista de mapa centrado en el punto GPS, aplicando la escala de zoom seleccionada (12 a 19).
- **Comportamiento Offline:** En modo online se descargan los tiles OpenStreetMap a la escala solicitada y se guardan en el Service Worker. En modo offline se renderiza el mosaico en caché o una representación geodésica esquemática con cuadrícula, rumbo y punto de localización.

---

### RF-06: Carga de Plantillas Empresariales (.docx y .xlsx)
- **Descripción:** El usuario podrá cargar archivos de plantilla en formatos Microsoft Word (`.docx`) y Microsoft Excel (`.xlsx`) desde el almacenamiento local del teléfono o desde servicios de nube vinculados.
- **Validación:** El sistema verificará la integridad del archivo OpenXML y generará una representación intermedia para análisis.

---

### RF-07: Reconocimiento Automático de Plantillas y Omisión de Logos con IA
- **Descripción:** El sistema debe analizar automáticamente la plantilla empresarial para identificar:
  1. **Delimitación del Espacio de Trabajo:** Diferenciar la zona de encabezado/membrete institucional del cuerpo de evidencias fotográficas.
  2. **Omisión Estricta de Logos:** Identificar y proteger los recuadros que ya contienen logos de la empresa o clientes para que **nunca sean reemplazados ni sobreescritos**.
  3. Ubicación y dimensiones de los recuadros destinados a albergar fotografías de inspección (`photo_evidence_slots`).
  4. Celdas asociadas destinadas a pies de foto, descripciones o numeración (`caption_slots`).
  5. Capacidad de fotografías por hoja (ej. plantilla de 2, 4 o 6 fotos por página).
- **Técnica:** Renderizado de página + Modelo de Visión por Computadora (YOLOv8-Doc / LayoutLM) + Mapeo cruzado a nodos de OpenXML.

---

### RF-08: Inyección Masiva, Ajuste Dinámico al Formato y Paginación Continua
- **Descripción:** 
  - El usuario selecciona un conjunto de fotografías (ej. 15 fotos) y confirma el cargue a la plantilla reconocida.
  - **Ajuste Dinámico al Contenedor Existente (Inmutabilidad del Formato):**
    1. **Cero Alteración del Formato:** El sistema **no impone tamaños fijos** (no aplica medidas arbitrarias). En su lugar, lee las dimensiones exactas de ancho y alto de cada celda o recuadro tal como fueron diseñadas en la plantilla original compartida por la empresa (`.docx` o `.xlsx`).
    2. **Ajuste Proporcional sin Deformación:** Cada imagen se adapta dinámicamente al contenedor existente mediante ajuste inteligente (*Aspect Ratio Fit / Center Crop*), asegurando que ninguna fotografía deforme las filas, columnas, márgenes ni bordes de la tabla.
    3. **Uniformidad Natural:** Todas las imágenes que ocupen celdas de la misma plantilla adoptan exactamente la geometría de dicho formato, garantizando uniformidad estética sin alterar ni un solo milímetro la maquetación institucional del cliente.
  - **Paginación Continua:** Si la plantilla original tiene capacidad para 4 fotos por hoja y el usuario inyecta 15 fotos, el sistema debe replicar automáticamente la estructura de la página 3 veces más, creando las páginas necesarias en Word o las secciones necesarias en Excel de forma idéntica al diseño base.

---

### RF-09: Detección de Estado Previo y Reanudación con Edición Completa
- **Descripción:** Si el usuario carga un archivo que ya contiene fotografías (por ejemplo, un formato que comenzó a diligenciar a mano en su oficina o en una jornada previa):
  - **Discriminación Inteligente:** La IA discrimina los logotipos corporativos (inmutables) de las fotografías de inspección previamente incrustadas.
  - **Protección contra Sobreescritura Automática:** El sistema detecta los recuadros ocupados y posiciona el cursor de inyección en el primer espacio libre disponible para no sobreescribir el trabajo previo accidentalmente.
  - **Flexibilidad y Control Total del Usuario:** Aunque las imágenes iniciales se preservan por defecto, se integran plenamente a la **Mesa de Trabajo**, donde el usuario tiene la libertad de:
    1. **Reordenarlas:** Intercambiar de posición fotos preexistentes con fotos nuevas mediante *Drag & Drop*.
    2. **Ajustarlas:** Rotarlas 90°, recortarlas o reescalarlas según convenga.
    3. **Eliminarlas:** Borrar cualquiera de las fotografías iniciales si ya no son requeridas, reorganizando los espacios restantes automáticamente.

---

### RF-10: Mesa de Trabajo Interactiva (Drag & Drop y Modo Proxy de Calidad)
- **Descripción:** El sistema proveerá una vista previa de la maqueta del documento donde el usuario podrá reorganizar las fotografías de forma ágil, fluida y visual.
- **Capacidades:**
  - **Reducción Temporal de Calidad (Modo Proxy):** Durante la interacción en la mesa de trabajo, el sistema utiliza miniaturas/proxies optimizados en memoria para que el usuario pueda mover, intercambiar y desplazar decenas de fotos sin que la interfaz se congele ni consuma la memoria RAM del teléfono.
  - **Arrastrar y Soltar (Drag & Drop):** Intercambiar la posición de fotos de manera individual o seleccionar un lote de varias fotos para moverlas a otra página.
  - **Restauración a Alta Calidad al Exportar:** Una vez confirmada la maquetación y al generar el reporte definitivo, el motor inyecta automáticamente los archivos originales en **máxima resolución y calidad fotográfica**.

---

### RF-11: Herramientas de Edición Rápida (Rotar, Recortar, Eliminar)
- **Descripción:** En la misma mesa de trabajo, el usuario podrá:
  - Rotar la fotografía en pasos de 90° (horario y antihorario).
  - Recortar la fotografía con selector de proporción libre o bloqueado a la relación de aspecto del recuadro de la plantilla.
  - Eliminar fotografías del informe con reacomodación automática de las fotos restantes.

---

### RF-12: Nomenclatura Personalizada y Exportación Multiformato
- **Descripción:**
  - El sistema debe permitir al usuario nombrar el archivo final mediante una máscara o plantilla de nombres (ejemplo: `{PROYECTO}_{FECHA}_{INFORME_NUM}.docx`).
  - El archivo final generado debe poder exportarse en el formato original diligenciado (`.docx` o `.xlsx`) y opcionalmente exportarse/convertirse a formato `.pdf`.

---

### RF-13: Conectividad Cloud y Sincronización Automática
- **Descripción:** Integración con servicios en la nube: Microsoft OneDrive, SharePoint y Google Drive.
- **Funcionamiento:** El usuario vincula su cuenta una única vez (OAuth 2.0). El sistema permite seleccionar una carpeta remota de destino y subir automáticamente el reporte generado y/o las fotos originales.

---

### RF-14: Compartición Directa a Canales Externos
- **Descripción:** El sistema debe invocar la hoja de compartir nativa del sistema operativo para enviar el reporte diligenciado (.docx/.xlsx/.pdf) de forma directa a aplicaciones de mensajería (WhatsApp, Telegram), clientes de correo electrónico o almacenamiento bluetooth.

---

### RF-15: Modo Offline (Trabajo sin Conexión)
- **Descripción:** Todas las funciones de captura, estampado gráfico, almacenamiento local en SQLite, edición de fotos y generación local de documentos deben operar sin requerir conexión a internet activa.
- **Sincronización posterior:** Al restablecerse la conexión de datos o WiFi, el despachador de sincronización detecta la conectividad y ejecuta las cargas pendientes hacia la nube sin bloquear al usuario.
