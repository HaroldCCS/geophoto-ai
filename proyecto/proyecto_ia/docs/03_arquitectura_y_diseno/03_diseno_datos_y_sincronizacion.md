# Diseño de Datos, Persistencia Local Offline y Sincronización Cloud

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Modalidad Tecnológica:** Progressive Web App (PWA) Multiplataforma Offline-First  
**Documento:** `docs/03_arquitectura_y_diseno/03_diseno_datos_y_sincronizacion.md`  

---

## 1. Estrategia de Persistencia Dual Offline-First

Para soportar el funcionamiento 100% autónomo sin conexión a internet en Web, Escritorio y Móvil, el sistema implementa una arquitectura de almacenamiento persistente en capas:

```mermaid
flowchart TD
    subgraph ClientStorage ["Almacenamiento del Cliente PWA"]
        subgraph IndexedDB ["IndexedDB (GeoPhotoAI_OfflineDB)"]
            OS1["app_state (Config, Proyecto, Paginación)"]
            OS2["photos (Evidencias, Rotación, Escala, Miniaturas)"]
            OS3["template_data (Metadatos y rawBuffer de Word/Excel)"]
            OS4["sync_queue (Cola Outbox de Tareas Cloud)"]
        end
        
        subgraph CacheStorage ["Cache Storage (Service Worker sw.js)"]
            CS1["Precache: App Shell (index.html, styles.css, app.js, manifest.json)"]
            CS2["Runtime Cache: Librerías y CDNs (Tailwind, Phosphor, Leaflet, JSZip)"]
        end
    end

    subgraph NativeMobileStorage ["Almacenamiento Nativo (SQLite / File System)"]
        SQLiteDB[("SQLite Database: PROYECTOS, FOTOS, SLOTS, OUTBOX")]
        FileBlob[("Almacenamiento Local Seguro en Disco")]
    end
```

---

## 2. Esquema de Datos en IndexedDB (`GeoPhotoAI_OfflineDB`)

IndexedDB es el motor de persistencia estándar de la PWA. Permite almacenar grandes volúmenes de datos binarios estructurados (`ArrayBuffer`, `Blob`, `DataURL`) que exceden ampliamente las capacidades y límites de `localStorage` (5 MB):

### 2.1. Object Stores de la PWA

| Object Store | Clave Primaria (`keyPath`) | Tipo de Contenido | Propósito |
| :--- | :--- | :--- | :--- |
| `app_state` | `key` (`string`) | Objeto JSON | Guarda parámetros globales: configuración de estampado (`config`), metadatos del proyecto activo (`currentProject`) y página actual (`currentPage`). |
| `photos` | `id` (`string`, ej: `'FOTO-001'`) | Objeto Foto Completo | Guarda cada fotografía con su imagen base64/blob, título correlativo, nota, rotación (0°, 90°, 180°, 270°), escala de encuadre, coordenadas GPS y procedencia. |
| `template_data` | `id` (`string`, ej: `'active_template'`) | Objeto Binario y Metadatos | Guarda el buffer binario original de la plantilla (`rawBuffer: ArrayBuffer`), nombre, tipo (`word`/`excel`), número de fotos por página y título detectado. |
| `sync_queue` | `id` (`autoIncrement` o UUID) | Tarea de Sincronización | Encola peticiones de subida a nubes corporativas que se generaron sin conexión a internet. |

### 2.2. Flujo de Auto-Guardado Reactivo (`scheduleOfflineSave`)
Para evitar sobrecarga de I/O en operaciones rápidas (como arrastrar fotos o rotar imágenes consecutivamente), la PWA implementa un mecanismo con técnica *debounce* (400 ms):
```javascript
let offlineSaveTimer = null;
function scheduleOfflineSave() {
  clearTimeout(offlineSaveTimer);
  offlineSaveTimer = setTimeout(() => {
    OfflineStore.saveState(state).catch(err => console.warn(err));
  }, 400);
}
```
Este método se invoca automáticamente ante cualquier mutación de estado: captura de foto, importación de galería, recorte, rotación, reordenamiento por arrastre, eliminación, movimiento entre hojas y carga de una nueva plantilla.

---

## 3. Esquema Relacional de Base de Datos Local (SQLite para Despliegues Nativos)

Para compilaciones móviles nativas empaquetadas (Capacitor / React Native / Flutter), la persistencia utiliza SQLite:

```mermaid
erDiagram
    PROJECTS ||--o{ PHOTOS : "contiene"
    PROJECTS ||--o{ TEMPLATES : "utiliza"
    STAMP_PROFILES ||--o{ PHOTOS : "aplica formato"
    TEMPLATES ||--o{ TEMPLATE_SLOTS : "define"
    PHOTOS ||--o{ REPORT_ITEMS : "inyectada en"
    TEMPLATE_SLOTS ||--o{ REPORT_ITEMS : "ocupa"
    PROJECTS ||--o{ SYNC_QUEUE : "genera eventos"

    PROJECTS {
        string id PK
        string name
        string code
        string client
        string description
        string logo_path
        datetime created_at
        datetime updated_at
    }

    STAMP_PROFILES {
        string id PK
        string name
        boolean show_date
        string date_format
        boolean show_gps
        string gps_format
        boolean show_map
        int map_zoom
        boolean show_logo
        string logo_path
        float overlay_opacity
        string overlay_position
        string default_note
    }

    PHOTOS {
        string id PK
        string project_id FK
        string raw_file_path
        string stamped_file_path
        string thumbnail_path
        datetime captured_at
        float latitude
        float longitude
        float altitude
        string utm_zone
        float utm_easting
        float utm_northing
        string note_text
        int rotation_degrees
        string crop_coordinates
        string sync_status
    }

    TEMPLATES {
        string id PK
        string project_id FK
        string name
        string file_type
        string original_file_path
        int slots_per_page
        int total_pages
        datetime analyzed_at
    }

    TEMPLATE_SLOTS {
        string id PK
        string template_id FK
        int page_number
        int slot_order
        string xml_node_path
        float box_x1
        float box_y1
        float box_x2
        float box_y2
        boolean is_occupied_initially
    }

    REPORT_ITEMS {
        string id PK
        string photo_id FK
        string slot_id FK
        int page_assigned
        int order_assigned
    }

    SYNC_QUEUE {
        string id PK
        string entity_type
        string entity_id
        string action_type
        string cloud_provider
        string target_remote_path
        int attempt_count
        string status
        string error_message
        datetime created_at
        datetime last_attempt_at
    }
```

---

## 4. Arquitectura del Motor de Sincronización (Offline-to-Online)

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant App as App PWA / UI
    participant DB as IndexedDB / SQLite Local
    participant SW as Service Worker / Sync Dispatcher
    participant Cloud as Microsoft Graph / Google Drive

    Usuario->>App: Captura foto / Genera reporte en zona rural sin cobertura
    App->>DB: Guarda evidencia local y encola en sync_queue (status='PENDING')
    App-->>Usuario: Feedback instantáneo: "Guardado localmente en modo Offline"
    
    Note over SW: Dispositivo detecta reconexión a Internet (window.online)
    SW->>DB: Consulta tareas encoladas con status='PENDING'
    DB-->>SW: Retorna lista de subidas pendientes
    
    loop Para cada reporte pendiente
        SW->>Cloud: Solicita Upload Session (Chunked Upload)
        Cloud-->>SW: URL de subida de fragmentos
        SW->>Cloud: Envía bytes del archivo por bloques de 3.2 MB
        alt Subida Exitosa
            Cloud-->>SW: HTTP 201 Created (ID de archivo en nube)
            SW->>DB: Actualiza status='COMPLETED'
        else Error de Red / Timeout
            SW->>DB: Incrementa attempt_count, aplica Exponential Backoff
        end
    end
    SW-->>App: Notificación visual: "Sincronización finalizada con éxito"
```

---

## 5. Conectores e Integración Cloud

### 5.1. Microsoft OneDrive y SharePoint (Microsoft Graph API)
- **Autenticación:** OAuth 2.0 PKCE.
- **Alcances requeridos:** `Files.ReadWrite`, `offline_access`.
- **Estrategia de Carga:**
  - Archivos menores a 4 MB: Endpoint directo `PUT /me/drive/items/{parent-id}:/{filename}:/content`.
  - Archivos grandes (> 4 MB): Sesión de carga fragmentada `POST /me/drive/items/{parent-id}:/{filename}:/createUploadSession` con envío por bloques de 3.2 MB, permitiendo reanudar la carga ante pérdidas de señal celular.

### 5.2. Google Drive (Google Drive API v3)
- **Autenticación:** Google Sign-In SDK con alcance `https://www.googleapis.com/auth/drive.file`.
- **Estrategia de Carga:** *Resumable Upload* con cabeceras `X-Upload-Content-Type` y lectura de respuesta `308 Resume Incomplete` para tolerar interrupciones de conectividad en carretera o campo.
