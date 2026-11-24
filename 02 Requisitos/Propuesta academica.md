---
tipo: requisitos
fuente: "[[Fuentes/Revision propuesta academica.docx]]"
actualizado: 2026-11-23
---

# Propuesta académica (resumen de trabajo)

**Título:** Desarrollo de un prototipo de aplicación móvil basado en inteligencia artificial para la optimización del diligenciamiento de informes técnicos en visitas de campo rurales y urbanas.
**Autores:** Omar Edisson Camargo Castellanos, Laura Valentina Ruiz González · **Directora:** Ing. PhD. María Fernanda Rivera Sanclemente · Bogotá, oct. 2026.

## Pregunta de investigación
¿Cómo estructurar un prototipo de app móvil con IA que **extraiga automáticamente datos de registros fotográficos** para agilizar el diligenciamiento de informes técnicos en visitas de campo?

## Objetivos específicos → qué implican para el software

| Objetivo | Implicación en el prototipo |
|---|---|
| **OE1** Diseñar la arquitectura integrando modelos de IA para captura, procesamiento y **extracción automática de metadatos** | Debe existir un componente de IA *real* que lea las fotos: EXIF (fecha, GPS) + **OCR** del texto estampado (fecha, coordenadas, vía, municipio, departamento). |
| **OE2** Funcionalidades de **diligenciamiento automatizado de plantillas** a partir de esos metadatos | Los datos extraídos deben llegar solos a los pies de foto del informe y a la hoja de cálculo. |
| **OE3** Validar desempeño: **precisión de la extracción** y **reducción de tiempo** | Hace falta medir: % de campos bien extraídos contra un conjunto de referencia y tiempo manual vs. automático. |

## Lo que dice el marco teórico (pistas técnicas)
- OCR (Tesseract, Smith 2007; Google Cloud Vision `TEXT_DETECTION`) para extraer texto de fotos.
- Metadatos por foto: fecha/hora, GPS, usuario, elementos detectados, **nivel de confianza**.
- Categorías de detección (construcciones, infraestructura, acceso, uso del suelo, evidencia documental): clasificación de escena. Queda como trabajo futuro, ver [[Plan de trabajo]].
- Limitación declarada: la calidad de la foto (luz, enfoque, inclinación) condiciona la extracción.

## Material de validación disponible
`proyecto/BUPA-4-*`: 19 puntos de inspección, ≈300 fotos TimeMark (feb. 2025, vía Berlín–Pamplona, Norte de Santander). Cada foto trae **EXIF con GPS** y un **sello visible** con fecha, coordenadas DMS, vía, municipio y departamento. Sirve como *ground truth* cruzado: EXIF vs. OCR.

> [!todo] Pendiente académico
> El documento tiene vacíos: *Marco Conceptual* sin contenido, falta "Gráfica x" y la referencia "UNESCO (2026)" parece dudosa. Revisar con la directora.

Relacionado: [[Requisitos del cliente]] · [[Brechas]]
