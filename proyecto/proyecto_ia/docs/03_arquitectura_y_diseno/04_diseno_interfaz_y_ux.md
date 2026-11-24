# Diseño de Interfaz de Usuario y Experiencia PWA (UI / UX)

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Modalidad Tecnológica:** Progressive Web App (PWA) Multiplataforma (Web, Escritorio y Móvil) Offline-First  
**Documento:** `docs/03_arquitectura_y_diseno/04_diseno_interfaz_y_ux.md`  

---

## 1. Filosofía de Diseño UX para Entornos de Campo y Escritorio

El diseño de la interfaz responde a las exigencias operativas de dos perfiles clave de usuario:
1. **Auditor o Inspector en Campo (Uso Móvil / Tablet):**
   - **Operación táctil con una sola mano y guantes:** Elementos táctiles principales de tamaño ampliado ($\ge 48 \times 48\text{ dp}$) situados preferentemente en la mitad inferior de la pantalla (*Thumb Zone*).
   - **Contraste dinámico exterior:** Colores con alto ratio de contraste visual y fondos oscuros profundos (`#020617` / `#0f172a`) en los rótulos para garantizar legibilidad bajo luz solar cenital.
   - **Feedback inmediato y háptico:** Toda captura y estampado responde de forma instantánea mediante respuestas hápticas (*vibration feedback*) y animaciones fluidas sin congelar la interfaz.
2. **Auditor / Revisor en Oficina (Uso en PC / Laptop de Escritorio):**
   - **Modo Pantalla Ancha Expandido (`desktop-expanded`):** Mediante un botón toggle en el encabezado, la interfaz aprovecha al 100% monitores anchos (cuadrícula de 4 columnas de evidencias, barras laterales de herramientas y visualización sin scroll excesivo).

---

## 2. Experiencia PWA e Instalación Multiplataforma

```
+-------------------------------------------------------------+
| [GeoPhoto AI] [Modo Ancho] [Online/Offline]  [📥 Instalar App]|
+-------------------------------------------------------------+
| 💡 ¿Deseas instalar GeoPhoto AI en tu dispositivo?          |
|    Instálala para usarla sin conexión y pantalla completa.  |
|    [ Cerrar ]                          [ Instalar Ahora ]   |
+-------------------------------------------------------------+
```

### Componentes de Instalabilidad PWA:
1. **Botón Dinámico de Instalación (`#btn-install-pwa`):** Se activa automáticamente al detectar el evento del navegador `beforeinstallprompt` (en Microsoft Edge, Chrome y navegadores Android).
2. **Banner Flotante de Bienvenida (`#pwa-install-banner`):** Ofrece instalación inmediata con un clic; puede cerrarse de forma no intrusiva y recuerda la preferencia en la sesión.
3. **Modal Guiado para iOS Safari (`#pwa-ios-modal`):** Para iPhones y iPads donde la API `beforeinstallprompt` no está estandarizada, se despliega una ventana modal ilustrada que enseña al usuario a tocar el botón *Compartir* de Safari y seleccionar *"Añadir a pantalla de inicio"*.
4. **Ejecución Standalone:** Una vez instalada, la aplicación se abre en su propia ventana sin marcos de navegador, barras de URL ni botones de navegación del explorador.

---

## 3. Pantalla 1: Visor de Cámara y Estampado en Vivo (Estilo TimeMark Mejorado)

```
+-------------------------------------------------------------+
| [⚡ Flash]     [⚙ Config Estampado]       [📍 GPS: UTM 18N] |
|                                                             |
|                                                             |
|                    VISOR DE CÁMARA (LIVESTREAM)             |
|                                                             |
|  +-------------------------------------------------------+  |
|  | [Logo]  PROYECTO: LÍNEA SUBESTACIÓN SUR - TORRE 24    |  |
|  |         FECHA: 09/OCT/2026 14:32:10                   |  |
|  | [Mapa]  COORD: N 04°36'35.0" W 74°04'54.3" (UTM 18N)  |  |
|  |         E: 598432.12  N: 509214.35  ALT: 2640 m       |  |
|  |         NOTA: Fisura en zapatilla de anclaje          |  |
|  +-------------------------------------------------------+  |
|   (Caja de fondo con transparencia ajustable: 0% a 100%)    |
|                                                             |
|   [ 🖼 Galería ]         ( 🔘 DISPARADOR )       [ 📝 Nota ] |
+-------------------------------------------------------------+
```

### Reglas de Estampado:
- **Fotos tomadas desde la App:** Se les estampa la marca de agua únicamente si el usuario tiene encendido el interruptor maestro (`cfg-master-toggle`).
- **Fotos cargadas desde la Galería:** Se importan **estrictamente limpias**, sin textos superpuestos arbitrarios, respetando su contenido fotográfico original.

---

## 4. Pantalla 2: Panel de Configuración Modular de Estampado

```
+-------------------------------------------------------------+
|  <- Configuración de Estampado                 [Guardar Perfil] |
+-------------------------------------------------------------+
|  SELECCIÓN DE PROYECTO:                                     |
|  [ Proyecto Subestación Eléctrica Sur v ]                   |
|  MODO DE ETIQUETADO EN LA TOMA:                             |
|  [x] Activar Sobreimpresión de Metadatos (Switch On/Off)   |
|                                                             |
|  CAMPOS MODULARES CONFIGURABLES (Activar los que requiera): |
|  [x] Fecha y Hora:    [ DD/MM/AAAA 24H                      v]|
|  [x] GPS:             [ UTM Métrico (Zona 18N)              v]|
|  [x] Mini-Mapa:       [ Satelital / Vectorial               v]|
|  [x] Logo Empresa:    [ Activado (Panel desplegado)         v]|
|                                                             |
|  PERSONALIZACIÓN AVANZADA DEL LOGO:                         |
|  [ [Logo Previa] ] [ 📂 Cargar Imagen (PNG/JPG/SVG) ]       |
|  Ubicación:           [ Superior Derecha (Recomendada)      v]|
|                       Opciones: Sup. Der, Sup. Izq, Sup. Cen, |
|                                 Cintillo Der, Cintillo Izq,   |
|                                 Inferior Der (Flotante)       |
|  Tamaño del Logo:     [----------o--] 44 px (24px a 96px)   |
|  Opacidad del Logo:   [-------------o] 90% (10% a 100%)      |
|  🛡️ Garantía: Textos protegidos contra solapamiento.        |
|                                                             |
|  [x] Nota de Campo:   [ "Torre 24 - Base de anclaje"        ] |
|  Opacidad del Rótulo: [----------o--] 65%                   |
+-------------------------------------------------------------+
```

### Reglas de Posicionamiento y Exclusión de Solapamiento:
1. **Posiciones Superiores (`top-right`, `top-left`, `top-center`):** El logo se ubica en su propia capa en la parte superior de la imagen con un fondo sutil translúcido, manteniendo más del 80% de distancia vertical respecto al cintillo inferior de datos. Cero solapamiento garantizado.
2. **Posición Cintillo Inferior Derecha (`banner-right`):** El logo se ancla en el extremo derecho del cintillo inferior. Los textos (proyecto, fecha, GPS, nota) calculan dinámicamente su ancho máximo (`maxTextW`) para truncarse con puntos suspensivos (`...`) antes de alcanzar el recuadro del logo.
3. **Posición Cintillo Inferior Izquierda (`banner-left`):** El logo se coloca inmediatamente después del mini-mapa, y la columna de textos inicia estrictamente a la derecha del logo (`textStartX = logoX + logoW + padding`).
4. **Persistencia Total:** La imagen cargada por el usuario (DataURL), su tamaño, transparencia y posición se almacenan en IndexedDB y se aplican fielmente tanto en el visor de cámara en vivo como en los documentos generados (`.docx` / `.xlsx`).

---

## 5. Pantalla 3: Mesa de Trabajo Interactiva (Reorganización, Paginación y Edición)

```
+-------------------------------------------------------------+
|  <- Mesa de Trabajo                          [P1] [P2] [P3] |
|  14 Fotos | 4 Pág (Viendo P1)           [ ➕ Agregar Fotos ] |
+-------------------------------------------------------------+
|  +---------------------------+  +---------------------------+  |
|  | Foto #1 (Doble clic: Zoom)|  | Foto #2                   |  |
|  | [ Miniatura Imagen ]      |  | [ Miniatura Imagen ]      |  |
|  | [🔍 Zoom] [⟲ 90°] [✂] [Mover] [🗑]                        |  |
|  +---------------------------+  +---------------------------+  |
|  +---------------------------+  +---------------------------+  |
|  | Foto #3                   |  | Foto #4                   |  |
|  | [ Miniatura Imagen ]      |  | [ Miniatura Imagen ]      |  |
|  | [🔍 Zoom] [⟲ 90°] [✂] [Mover] [🗑]                        |  |
|  +---------------------------+  +---------------------------+  |
+-------------------------------------------------------------+
|  Paginación Compacta: [ < ] [ P1 ] [ P2 ] [ P3 ] [ > ]      |
+-------------------------------------------------------------+
```

### Funcionalidades de la Mesa de Trabajo:
- **Doble Clic / Doble Toque (Lightbox Hi-Res):** Al hacer doble clic sobre cualquier tarjeta o imagen, se despliega instantáneamente un visor a pantalla completa de alta resolución para inspección técnica minuciosa. Al hacer un clic en el fondo o en el botón de cerrar, se regresa de inmediato a la mesa.
- **Paginación Compacta (`P1`, `P2`, `P3`):** Sustituye las etiquetas largas por identificadores compactos para optimizar el espacio en pantallas de teléfonos y tablets.
- **Movimiento entre Hojas (Modal y Drag):** Botón de acceso directo en cada tarjeta para transferir una foto a otra página mediante selector modal, además del arrastre directo (*Drag & Drop*) sobre las píldoras de paginación.
- **Rotación 90° Persistente:** Rota la imagen 90° en la interfaz e inyecta la rotación física real al exportar el documento final.
- **Ajuste de Encuadre y Tamaño:** Modal con control de zoom, escala (70% a 150%) y modos de ajuste (*Ajustar / Rellenar*).

---

## 6. Diálogo Modal de Exportación con Personalización de Nombre

```
+-------------------------------------------------------------+
|  Exportar Reporte Diligenciado                    [ Cerrar ] |
+-------------------------------------------------------------+
|  Nombre del Archivo a Exportar:                             |
|  [ INFORME_FOTOGRAFICO_SUBESTACION_SUR_20261011           ] |
|  (El usuario puede modificar libremente el nombre aquí)     |
|                                                             |
|  FORMATO DE SALIDA:                                         |
|  [ 📄 Documento Word (.docx) ]                              |
|  [ 📊 Planilla Excel (.xlsx) ]                              |
|  [ 📑 Documento PDF (.pdf)   ]                              |
|                                                             |
|  NUBE CORPORATIVA:                                          |
|  [ OneDrive / SharePoint ]   [ Google Drive ]               |
|                                                             |
|  [ 📤 Compartir por WhatsApp ]                              |
+-------------------------------------------------------------+
```
- **Renombrado en Caliente:** El usuario puede especificar el nombre del archivo final antes de la descarga, asegurando cumplimiento de códigos contractuales y directrices de auditoría.
- **Inyección Transparente sin Alterar Membretes:** Los logos preexistentes de encabezados y pies de página se mantienen estrictamente intactos.
