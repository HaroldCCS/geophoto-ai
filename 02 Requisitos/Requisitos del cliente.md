---
tipo: requisitos
fuente: "[[Fuentes/Requisitos cliente - guardado y mesa.docx]]"
actualizado: 2026-11-23
---

# Requisitos del cliente: guardado, offline y mesa

Transcripción ordenada de `Fuentes/Requisitos cliente - guardado y mesa.docx`. Cada ítem tiene un código (`RQ-xx`) que se usa en [[Brechas]] y [[Plan de trabajo]].

## A. Módulo de guardado (Google Drive + Google Sheets)

| Código | Requisito |
|---|---|
| RQ-01 | Conectarse a Google Drive y a **una hoja de cálculo de Google** donde se guarde, organizada, la información extraída de los registros fotográficos. |
| RQ-02 | En esa hoja guardar **cada dato obtenido** y **la ruta** donde quedó el registro fotográfico de cada proyecto. |
| RQ-03 | Guardar el registro fotográfico en **una carpeta de Drive cada vez que se genera un informe**. Al crear un proyecto, el usuario elige **crear carpeta nueva o reutilizar/reemplazar una existente**. |
| RQ-04 | Al descargar el informe, guardarlo también en una carpeta de Drive elegida por el usuario. **Opcional**: si no quiere Drive, solo se descarga. |
| RQ-05 | Regenerar el informe de un proyecto existente crea **una versión nueva automáticamente** (1.0, 1.1, 2.0…), mantiene el **historial**, la registra en la hoja y guarda **la ruta de cada versión** en Drive. |
| RQ-06 | La hoja guarda metadatos del proyecto: **ID único, nombre, fecha de creación, usuario creador, estado (Borrador / En proceso / Finalizado), fecha de generación del informe, ruta de carpeta de fotos, ruta del informe, última modificación**. |

## B. Trabajo sin conexión

| Código | Requisito |
|---|---|
| RQ-07 | La app trabaja **offline** y, cuando vuelve la conexión, **sube** los proyectos y registros fotográficos trabajados. |

## C. Módulo de ajuste del registro fotográfico

| Código | Requisito |
|---|---|
| RQ-08 | Zoom |
| RQ-09 | Rotación libre |
| RQ-10 | Rotación 90° / 180° / 270° |
| RQ-11 | Espejo |
| RQ-12 | Mostrar cuadrícula |
| RQ-13 | Ajuste automático al marco |
| RQ-14 | Bloquear proporciones |
| RQ-15 | Tamaño mínimo de imagen |
| RQ-16 | Tamaño máximo de imagen |
| RQ-17 | Organizar fotos entre hojas y dentro de la misma hoja |
| RQ-18 | Adicionar nuevos registros fotográficos |
| RQ-19 | Todas las fotos del informe con **el mismo ancho y alto** (proporciones uniformes) |
| RQ-20 | Guardar los cambios para que **al exportar** se respeten las configuraciones del proyecto |

## D. Mesa de trabajo

La app tiene cuatro módulos: **Cámara, Formato, Mesa y Descarga**.

| Código | Requisito |
|---|---|
| RQ-21 | Según fotos cargadas y páginas, el usuario puede girar, encuadrar y eliminar. |
| RQ-22 | Doble clic en una imagen → ajustar zoom, desplazarse, girar, **restablecer** y **guardar**; los cambios se conservan en el formato final y al salir del módulo. |
| RQ-23 | Modo **Seleccionar** varias imágenes con opción de **retirarlas**. Retirar solo quita la foto **de la app**, nunca del dispositivo (se puede volver a cargar). |

Relacionado: [[Propuesta academica]] · [[Brechas]]
