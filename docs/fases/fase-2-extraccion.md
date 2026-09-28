# Fase 2 · Extracción de datos con IA

Arranca dentro del mismo procesamiento de la Fase 1: al separar un archivo en documentos, cada documento contable se extrae a continuación, de forma automática.

## Flujo
1. **Separar** (Fase 1, paso 4): páginas por lotes de 8 → tipo, cortes y lectura preliminar (`documentos.lectura`).
2. **Extraer**: cada documento con **todas sus páginas juntas** (una factura de 3 páginas se lee entera) → tabla `extracciones`.
3. **Revisar (determinista, sin IA)** → motivos de revisión del documento:
   - `DESCUADRE`: Σ bases + Σ cuotas + R.E. − retención ≠ total (tolerancia 0,05 €).
   - `LECTURA_DISCREPANTE`: el total extraído no coincide con el leído al separar (detecta la coma decimal tomada por miles).
   - `BAJA_CONFIANZA`: alguna confianza por debajo de 0,80.
   - `NO_CORRESPONDE_EMPRESA`: el NIF del cliente no es ni emisor ni receptor (solo si la factura trae receptor; los tickets no).
   - `SEPARACION_INCIERTA`: el extractor dice que esas páginas contienen más de un documento.
   - `SIN_EXTRAER`: la extracción falló (se puede reprocesar).

Un documento queda `LISTO` si es factura, ticket o rectificativa y no tiene ningún motivo.

## Cómo se lee cada página
- **PDF electrónico** (capa de texto con ≥ 200 caracteres): su texto exacto (pypdf, modo layout) + una imagen de apoyo a 60 ppp. Cifras exactas y menos tokens.
- **Escaneo o foto**: imagen a 110 ppp.
- **Factura estructurada** (Facturae, UBL o CII en XML, o XML dentro del PDF tipo Factur-X): se registra `FACTURA_ESTRUCTURADA` para medir cuántas llegan; su lectura sin IA queda pendiente.
- El modelo recibe quién es el cliente del despacho (nombre, NIF, recibidas/emitidas): sin esto confundía emisor y receptor en los tickets.

## Datos extraídos (`extracciones.datos`)
Tipo, emisor y receptor (nombre, NIF, dirección, CP), número, fechas (emisión, operación, vencimiento), periodo facturado, moneda, factura rectificada, líneas de IVA agrupadas por tipo (base, tipo, cuota, tipo y cuota de R.E.), retención, total, mención de exención, dirección de suministro, forma de pago, IBAN, productos (descripción, cantidad, precio, IVA, importe) y confianzas por grupo. Esquema: `ESQUEMA_EXTRAER` en `gcp-bandeja-contable/app/clasificador.py`.

`extracciones` no se modifica nunca. Lo que confirme el asesor irá a `confirmaciones`; la comparación de las dos mide el acierto de cada modelo campo a campo.

## Modelo
Activo: **Gemini 2.5 Flash** (Vertex AI, regiones de la UE por orden: europe-southwest1, europe-west1, europe-west4; si una devuelve 429 se reintenta en la siguiente).

Prueba con "15 FACTURAS VARIAS.pdf" (19 páginas escaneadas, 28/09):

| Modelo | Documentos | Errores | Coste | Tiempo |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 15–16 (varía) | junta facturas seguidas; 371,59 → 371591 | 0,011 USD | ~2 min |
| Gemini 2.5 Flash | 17 (correcto) | ninguno de importes; 3 a revisión por motivos reales | 0,055 USD | ~1,5 min |
| Claude Haiku 4.5 | — | pendiente de cuota en `eu` | — | — |

## Pendiente
- Cuota de Claude Haiku 4.5 y comparación con todas las muestras.
- Lectura sin IA de las facturas estructuradas (XML).
- Tabla `confirmaciones` y pantalla de confirmación del asesor.
- Cuentas contables (plan del cliente en Sage), reglas y skills en el prompt de extracción.
