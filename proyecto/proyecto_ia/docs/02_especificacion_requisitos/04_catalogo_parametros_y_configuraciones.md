# Catálogo Completo de Parámetros y Configuraciones del Sistema

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Documento:** `docs/02_especificacion_requisitos/04_catalogo_parametros_y_configuraciones.md`  

---

## 1. Introducción al Catálogo de Parámetros

Para que la aplicación sea verdaderamente profesional, robusta y adaptable a las exigencias de diferentes tipos de empresas (interventorías, constructoras, eléctricas, aseguradoras), es necesario estructurar todos los parámetros configurables que pueden intervenir en el ciclo de vida de la aplicación.

Este documento consolida los parámetros ya contemplados e identifica **parámetros adicionales de alto valor operativo** clasificados en 6 dimensiones.

---

## 2. Dimensión 1: Parámetros de Cámara y Captura en Campo

| Parámetro | Opciones / Rango | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Resolución de Captura** | - Alta (4K / 12-48 MP)<br>- Media (1080p Full HD)<br>- Económica (720p) | Media (1080p) | En inspecciones de 200+ fotos diarias, 1080p ahorra batería y espacio sin perder nitidez en la plantilla. |
| **Guardar Copia Original Limpia** | Sí / No | Sí | Guarda una versión "virgen" sin estampado en la galería por si un peritaje exige la foto cruda sin sobreimpresión. |
| **Disparo con Botón Físico** | Botón Volumen Arriba / Abajo | Activo | Permite capturar fácilmente con una sola mano o usando guantes industriales de seguridad. |
| **Guías en Pantalla** | - Cuadrícula 3x3<br>- Nivel de Horizonte / Inclinómetro | Inclinómetro | Ayuda al inspector a nivelar la cámara para que las fotos de estructuras o taludes no queden torcidas. |
| **Sonido y Vibración Háptica** | Encendido / Silencioso / Vibrar | Vibrar | En ambientes ruidosos de obra o maquinaria pesada, la vibración confirma el disparo. |

---

## 3. Dimensión 2: Parámetros del Motor de Estampado (Etiquetado en Vivo Opcional)

> [!NOTE]
> **El etiquetado se realiza al momento de la toma y NO es obligatorio.** El usuario tiene interruptores individuales para encender o apagar cualquier campo según lo requiera, o tomar fotos completamente limpias.

| Parámetro | Opciones Comerciales Soportadas | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Activación de Etiquetado** | - Etiquetado Activo (con elementos seleccionados)<br>- Desactivado (Foto limpia sin sobreimpresión) | Activo | Libertad total del usuario al momento de la captura. |
| **Formatos de Fecha y Hora** | 1. `DD/MM/AAAA` (Comercial Latam/Europa: `09/10/2026`)<br>2. `DD/MM/AAAA HH:mm:ss` (24 horas: `09/10/2026 14:32:10`)<br>3. `DD/MM/AAAA hh:mm:ss a` (12 horas AM/PM: `09/10/2026 02:32:10 PM`)<br>4. `AAAA-MM-DD` (ISO 8601 Internacional: `2026-10-09`)<br>5. `DD de [Mes] de AAAA` (Verbal: `09 de Octubre de 2026`) | `DD/MM/AAAA HH:mm:ss` | Permite ajustarse al formato de fecha exigido por el cliente o país. |
| **Sistemas de Coordenadas de Posición** | 1. **CTM12 Coordenadas Planas Colombia (EPSG:9377):** Origen Único Nacional IGAC ($\phi_0=4^\circ\text{ N}, \lambda_0=-73^\circ\text{ W}, k_0=0.9992, X_0=5\text{M}, Y_0=2\text{M}$)<br>2. **MAGNA-SIRGAS Origen Bogotá (EPSG:3116):** Origen Central Colombia ($\phi_0=4^\circ 35' 46.32''\text{ N}, \lambda_0=-74^\circ 04' 39.03''\text{ W}, k_0=1.0, X_0=1\text{M}, Y_0=1\text{M}$)<br>3. **Sistema UTM (Zona 18N):** $E: 598432\text{ m}, N: 509214\text{ m}$<br>4. **Grados Decimales (DD / WGS84):** $4.609710, -74.081750$<br>5. **Grados, Minutos, Segundos (DMS):** $04^\circ 36' 35.0''\text{N } 74^\circ 04' 54.3''\text{W}$<br>6. **Grados y Minutos Decimales (DDM):** $04^\circ 36.583'\text{N } 74^\circ 04.905'\text{W}$<br>7. **Dirección Urbana:** Sector Urbano y Nomenclatura | CTM12 Nacional | CTM12 y EPSG:3116 son obligatorios para interventoría, infraestructura y catastro en Colombia. |
| **Identificación de Municipio y Departamento** | - Detección automática mediante GPS y dataset geográfico offline de Colombia<br>- Edición manual de Departamento y Municipio | Antioquia / Medellín | Cumple la exigencia legal y contractual de especificar ubicación territorial en reportes de interventoría. |
| **Escala / Zoom del Mini-Mapa** | Rango continuo de $12$ a $19$ (12: Región Macro, 16: Detalle Obra, 19: Detalle Predio) con slider y botones $+/-$ | $16$ (Detalle Obra) | Permite alternar entre contexto geográfico amplio y alta precisión predial según la escala de la infraestructura. |
| **Tipografía (Tipo de Letra)** | - Sans-Serif (Moderna / Inter / Arial)<br>- Monospace (Técnica / Consolas / Estilo GPS)<br>- Condensada (Compacta de Ingeniería / DIN)<br>- Serif (Formal / Georgia / Estilo Informe) | Sans-Serif | Adapta la identidad tipográfica a la sobriedad técnica del documento. |
| **Tamaño de Letra** | - Pequeño ($9.5\text{ px}$ en visor / $0.85\times$ en canvas)<br>- Normal ($11\text{ px}$ en visor / $1.0\times$ en canvas)<br>- Grande ($12.5\text{ px}$ en visor / $1.15\times$ en canvas) | Normal | Garantiza legibilidad en pantallas de campo y celdas reducidas de Word/Excel. |
| **Color y Paleta de Texto Unificada** | Blanco (`#FFFFFF`), Amarillo (`#FACC15`), Cian (`#38BDF8`), Verde (`#4ADE80`), Naranja (`#FB923C`) y selector Hex personalizado | Blanco (`#FFFFFF`) | **Unifica todos los textos del estampado** (Proyecto, Ubicación, Municipio/Departamento, Coordenadas, Fecha y Nota de referencia) en un solo color homogéneo con máximo contraste técnico. |
| **Opacidad de Textos** | Control continuo de $30\%$ (discreto) a $100\%$ (sólido brillante) | $100\%$ | Regula la prominencia visual de los textos sobre la fotografía. |
| **Ubicación Agrupada del Rótulo** | 1. `Inferior Completo` (Cintillo horizontal extendido)<br>2. `Inferior Izquierda` (Tarjeta agrupada compacta)<br>3. `Inferior Derecha` (Tarjeta agrupada compacta)<br>4. `Superior Izquierda` (Tarjeta agrupada compacta)<br>5. `Superior Derecha` (Tarjeta agrupada compacta) | `Inferior Completo` | **Garantiza que todos los textos permanezcan agrupados en un solo bloque coherente**, evitando dispersión de datos. |
| **Filtro de Precisión GPS** | Umbral mínimo (ej. $< 5\text{ m}$, $< 10\text{ m}$, Omitir filtro) | $< 15\text{ m}$ | Advierte al usuario si la señal de satélite es deficiente para evitar coordenadas erróneas. |
| **Caja de Fondo y Opacidad del Rótulo** | Control deslizante de 0% (transparente) a 100% (sólido) | 65% Negro | Equilibrio óptimo entre legibilidad de texto y no tapar la evidencia fotográfica. |
| **Mini-Mapa Geográfico Dual Resiliente** | - Activar / Desactivar (Switch On/Off)<br>- Motor Cartográfico Dual: Canvas Vectorial Topográfico Inmediato (100% Offline con curvas de nivel, malla vial dinámica, río, brújula N y escala métrica) + Mosaicos CartoDB Voyager / OSM cuando hay conexión.<br>- Escala / Zoom dinámico (12 a 19)<br>- Marcador GPS central con aro de precisión blanco | Activo / Z16 | Proporciona contexto espacial garantizado tanto en campo sin internet como con conectividad. |
| **Logotipo del Proyecto / Empresa** | - Activar / Desactivar permanente dentro de la casilla de carga<br>- Controles persistentes que no desaparecen al apagar el logo | Activo | Identificación institucional inmediata con acceso garantizado para encender o apagar. |
| **Carga de Archivo de Logo Propio** | Carga de archivo de imagen del usuario (PNG con transparencia, JPG, SVG o WebP) persistido en IndexedDB | Logo demo | Permite personalizar el reporte con la imagen o imagotipo real de la empresa auditora o cliente. |
| **Ubicación del Logo en la Fotografía** | 1. `Superior Derecha` (Esquina recomendada)<br>2. `Superior Izquierda`<br>3. `Superior Centro`<br>4. `Cintillo Inferior (Derecha)`<br>5. `Cintillo Inferior (Izquierda)`<br>6. `Inferior Derecha (Flotante)` | `Superior Derecha` | Flexibilidad para no obstruir detalles visuales clave de la evidencia. |
| **Tamaño del Logo** | Rango continuo de $24\text{ px}$ a $96\text{ px}$ de altura (con escalado vectorial proporcional) | $44\text{ px}$ | Permite balancear la visibilidad de marcas corporativas grandes o discretas. |
| **Transparencia / Opacidad del Logo** | Control deslizante de $10\%$ (marca de agua tenue) a $100\%$ (sólido) | $90\%$ | Ajusta el impacto visual del logo sobre el fondo de la fotografía. |
| **Garantía Anti-Solapamiento con Textos** | Algoritmo geométrico de exclusión mutua | Activo (Automático) | Asegura matemáticamente que el logo **nunca se sobreponga ni colisione** con los textos agrupados ni con el mini-mapa. |
| **Perfiles de Estampado Guardables** | Guardar ajustes con nombre (ej. "Perfil Ecopetrol", "Perfil Claro") | "Predeterminado" | Permite al auditor cambiar todas las reglas de estampado con un solo toque según el cliente del día. |

---

## 4. Dimensión 3: Parámetros de la Inteligencia Artificial y Plantillas

| Parámetro | Opciones / Rango | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Modo de Ajuste Fotográfico** | - *Smart Fit* (Ajuste proporcional al contenedor sin deformar)<br>- *Center Crop* (Llena el espacio exacto de la celda) | Smart Fit | Adapta la foto a las dimensiones exactas que tenga la celda en el formato del usuario, preservando inalterada la tabla. |
| **Secuencia de Lectura de Celdas** | - En Z (Izquierda a Derecha, Arriba a Abajo)<br>- En N (Por Columnas verticales) | En Z | Respeta el orden de lectura natural de la plantilla de cada empresa. |
| **Umbral de Confianza de Detección** | Valor $0.50$ a $0.90$ | $0.65$ | Sensibilidad del modelo YOLOv8 para identificar recuadros válidos. |
| **Omisión de Logos y Membretes** | Activado / Desactivado | Activado | Protege los encabezados institucionales para que la IA no los confunda con fotos de obra. |

---

## 5. Dimensión 4: Parámetros del Formato de Salida y Paginación

| Parámetro | Opciones / Rango | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Máscara de Nombre de Archivo** | `{PROYECTO}_{FECHA}_{INFORME_NUM}` | Dinámica | Estandarización automática de nombres para evitar sobreescritura accidental. |
| **Texto de Pie de Foto Automático** | Patrón: `"Foto N° {NUM}: {NOTA} - {FECHA}"` | Consecutivo + Nota | Genera automáticamente la descripción debajo de cada foto en la celda de Word/Excel. |
| **Manejo de Celdas Sobrantes** | - Dejar vacías<br>- Escribir *"Sin registro"* | Dejar vacías | Define qué hacer en la última página si sobran recuadros (ej. 3 fotos en plantilla de 4). |
| **Clonación de Encabezados** | Sí / No | Sí | Duplica el membrete oficial de la empresa en cada página generada automáticamente. |
| **Límite de Tamaño del Archivo Final** | Compresión automática si supera 20 MB | Activo | Asegura que el reporte de 50 fotos se pueda adjuntar por correo o WhatsApp sin rebotar. |

---

## 6. Dimensión 5: Parámetros de Sincronización y Red

| Parámetro | Opciones / Rango | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Política de Conexión para Subida** | - Solo Wi-Fi<br>- Wi-Fi + Datos Móviles | Wi-Fi + Datos | Permite a usuarios con planes de datos limitados postergar la subida pesada hasta llegar al hotel/oficina. |
| **Reintentos de Sincronización** | Número de intentos (1 a 5) con retraso exponencial | 3 reintentos | Evita descargar la batería del celular si la señal celular es inestable. |
| **Destino Cloud Predeterminado** | OneDrive / SharePoint / Google Drive | OneDrive | Ruta remota donde se depositan automáticamente las carpetas de los proyectos. |
| **Limpieza de Caché Local** | - Inmediata tras exportar<br>- Mantener 15 / 30 días | Mantener 30 días | Libera espacio en el teléfono pero permite reexportar si el cliente pide correcciones días después. |

---

## 7. Dimensión 6: Parámetros de Seguridad e Identificación del Auditor

| Parámetro | Opciones / Rango | Valor por Defecto | Justificación Operativa |
| :--- | :--- | :---: | :--- |
| **Datos del Inspector Responsable** | Nombre, Matrícula Profesional, Cargo | Opcional | Permite estampar o incluir en el pie de página la firma de responsabilidad técnica. |
| **Código de Integridad Hash (SHA-256)** | Incluir hash de metadatos en documento | Opcional | Otorga validez probatoria ante disputas legales o peritajes de aseguradoras. |
