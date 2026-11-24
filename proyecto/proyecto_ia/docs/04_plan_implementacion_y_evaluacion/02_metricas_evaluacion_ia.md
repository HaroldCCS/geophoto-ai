# Métricas de Evaluación del Modelo de Inteligencia Artificial y Validación Experimental

**Proyecto:** Sistema Inteligente de Gestión, Estampado Georreferenciado y Diligenciamiento Automático de Reportes Fotográficos en Plantillas Empresariales  
**Programa:** Especialización en Inteligencia Artificial  
**Documento:** `docs/04_plan_implementacion_y_evaluacion/02_metricas_evaluacion_ia.md`  

---

## 1. Justificación Académica de las Métricas

Para sustentar rigurosamente el proyecto de grado en la **Especialización en Inteligencia Artificial**, la evaluación del sistema no puede limitarse a pruebas visuales cualitativas. Se establece un protocolo formal de experimentación cuantitativa que evalúa tanto la capacidad predictiva del modelo de Visión por Computadora como la robustez del pipeline completo de inyección y clonación documental.

---

## 2. Métricas de Visión por Computadora (DLA - Document Layout Analysis)

El modelo de detección de layout (YOLOv8-Doc) se evalúa sobre un conjunto de prueba (*test set*) con anotaciones de verdad fundamental (*ground truth*).

### 2.1. Intersección sobre Unión (IoU - Intersection over Union)
Mide la exactitud espacial del solapamiento entre la caja delimitadora predicha por la IA ($B_p$) y la caja real anotada ($B_{gt}$):
$$\text{IoU} = \frac{\text{Área}(B_p \cap B_{gt})}{\text{Área}(B_p \cup B_{gt})}$$
- **Criterio de Aceptación:** Se considera una detección válida (*True Positive*) si $\text{IoU} \ge 0.70$.

---

### 2.2. Precisión, Recall y F1-Score por Clase
Para cada una de las 4 clases (`photo_placeholder`, `caption_slot`, `header_info`, `logo_slot`):
$$\text{Precisión} = \frac{TP}{TP + FP}, \quad \text{Recall} = \frac{TP}{TP + FN}, \quad F_1 = 2 \cdot \frac{\text{Precisión} \cdot \text{Recall}}{\text{Precisión} + \text{Recall}}$$

---

### 2.3. Mean Average Precision (mAP)
Se evalúa la precisión media global calculada bajo dos umbrales estándar de la comunidad científica:
- **$\text{mAP}@0.5$:** Precisión media con umbral de IoU de 0.50 (métrica estándar Pascal VOC).
- **$\text{mAP}@[0.5:0.95]$:** Precisión media promediada sobre 10 umbrales de IoU entre 0.50 y 0.95 con saltos de 0.05 (métrica estricta MS COCO).

#### Metas de Rendimiento de IA para el Proyecto:
| Métrica | Valor Mínimo Aceptable | Meta del Proyecto |
| :--- | :---: | :---: |
| $\text{mAP}@0.5$ (Global) | $\ge 0.85$ | **$\ge 0.92$** |
| $\text{mAP}@[0.5:0.95]$ (Global) | $\ge 0.60$ | **$\ge 0.72$** |
| $\text{Recall}$ en `photo_placeholder` | $\ge 0.90$ | **$\ge 0.96$** |
| $\text{F1-Score}$ en `caption_slot` | $\ge 0.85$ | **$\ge 0.91$** |

---

## 3. Métricas de Diligenciamiento y Mapeo Estructural OpenXML

Dado que el objetivo final es la correcta generación del documento físico, se definen tres métricas de ingeniería de software e IA aplicada:

### 3.1. Tasa de Asignación Correcta de Slots (Slot Assignment Accuracy - SAA)
Mide el porcentaje de celdas fotográficas que fueron correctamente vinculadas a su respectivo nodo XML sin desalinear columnas o filas:
$$\text{SAA} = \frac{\text{Número de slots correctamente asignados}}{\text{Total de slots reales en la plantilla}} \times 100\%$$
- **Meta del Proyecto:** $\text{SAA} \ge 98\%$.

---

### 3.2. Exactitud en Detección de Estado Previo (Prior State Accuracy - PSA)
Evalúa la habilidad del sistema para identificar si una celda ya contiene una foto previa en plantillas parcialmente diligenciadas:
$$\text{PSA} = \frac{TP_{\text{ocupadas}} + TN_{\text{libres}}}{\text{Total de celdas evaluadas}} \times 100\%$$
- **Meta del Proyecto:** $\text{PSA} \ge 99\%$ (cero sobreescritura de imágenes preexistentes).

---

### 3.3. Tasa de Éxito en Clonación de Páginas (Page Cloning Success Rate - PCSR)
Mide la integridad estructural de los documentos generados tras duplicar dinámicamente páginas:
$$\text{PCSR} = \frac{\text{Documentos clonados que abren sin advertencias en MS Word/Excel}}{\text{Total de documentos probados con paginación extendida}} \times 100\%$$
- **Meta del Proyecto:** $\text{PCSR} = 100\%$.

---

## 4. Métricas de Rendimiento Operativo y Eficiencia

| Métrica Operativa | Unidad | Límite Máximo Aceptable |
| :--- | :---: | :---: |
| **Tiempo de Inferencia IA por Página** | Milisegundos | $\le 2500 \text{ ms}$ (en GPU) / $\le 4000 \text{ ms}$ (en CPU) |
| **Tiempo de Estampado Gráfico por Foto** | Milisegundos | $\le 250 \text{ ms}$ |
| **Tiempo Total de Generación (30 fotos)** | Segundos | $\le 4.5 \text{ s}$ |
| **Pico de Memoria RAM en el Dispositivo** | Megabytes | $\le 350 \text{ MB}$ |

---

## 5. Protocolo de Validación Experimental

Para validar el sistema se construirá un banco de pruebas (*Benchmark Dataset*) compuesto por:
1. **50 Plantillas Reales Heterogéneas:** Recopiladas de empresas de ingeniería, construcción, telecomunicaciones y aseguradoras.
   - 25 plantillas en Microsoft Word (`.docx`) (distribuciones de 1, 2, 4 y 6 fotos/página).
   - 25 plantillas en Microsoft Excel (`.xlsx`) (celdas combinadas, tablas múltiples).
2. **Subconjunto de Plantillas Semi-diligenciadas (20 casos):** Para validar específicamente la reanudación del cargue sin pérdida de datos.
3. **Validación Cruzada en Campo:** Se ejecutarán 5 pruebas piloto en campo real con 20 a 50 capturas fotográficas consecutivas en modo offline, evaluando la sincronización posterior y la experiencia de usuario.
