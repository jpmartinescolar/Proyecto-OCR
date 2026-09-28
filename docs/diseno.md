# Diseño de la interfaz (Claude Design)

Fuente: `Bandeja contable OCR de Salesforce.zip` (v2, 28/09/2026) en la raíz del repo; no se versiona (`.gitignore`). La v1 (`…-handoff.zip`, 25/09/2026) queda superada. Leer `Bandeja Contable.dc.html`; `support.js` es el motor de Claude Design, sin lógica de negocio.

## Qué cambia de la v1 a la v2

La v1 era una bandeja para **revisar y validar facturas**. La v2 es un **asistente fiscal por factura**: además de revisar, comprueba riesgos fiscales y operativos, los cuantifica, y deja trazado lo que decide el asesor (notas, tareas, chat con la IA).

| Pantalla | v1 | v2 |
|---|---|---|
| 00 Listado de bandejas | Igual | Igual |
| 01 Registro | Igual | Igual (estado de documento "No contabilizado" en lugar de "Cancelado") |
| 02 Documento OCR | Visor · condiciones CRM · datos extraídos | Cabecera con acciones, más visor y **pestañas**: Datos, Perfil fiscal, Comprobaciones, IS, Productos, Notas, Tareas, Chat IA, Actividades, Locales, Turismos, Skills (detalle abajo) |
| 03 Listado OCR | Filtros por estado | **Pestañas por tipo** (emitida/recibida/ticket) con recuento, **columna "Situación fiscal"** (con/sin riesgo), filtro "No contabilizados" **por motivo**, agrupación por empresa desplegable con indicador de riesgo |
| 04 OCR por empresa | Igual | Igual |
| 05 Empresa · Skills | Skills de solo lectura | **Editor de skills** (modal) |
| 06 Riesgo fiscal no prescrito | — | **Nueva**: por empresa, documentos validados con riesgo en ejercicios no prescritos (2022–2026), importes por IS, IVA e IRPF, KPIs y total |
| Modal Riesgo económico | — | **Nuevo**: cuantifica en € el riesgo de una comprobación |
| Modal Editor de skill | — | **Nuevo**: título, ámbito (general o proveedor por NIF), instrucción para la IA, cuenta contable, vista previa |

### Documento OCR (02) en la v2
- **Cabecera:**
  - Nº de factura, estado y tipo (Emitida / Recibida / Ticket).
  - Empresa, archivo, fecha de recepción y de **extracción automática**.
  - **Consumo de IA (tokens y coste)** y software contable de destino.
  - Navegación ‹ n de N ›.
- **Acciones:**
  - Guardar borrador.
  - **No contabilizar** con motivo obligatorio: duplicada, no deducible, no corresponde a la empresa, ilegible o incompleto, falta documentación, no es una factura, ya contabilizada en destino u otro. Admite comentario y "avisar al cliente". La IA puede **sugerir el motivo**.
  - **Reabrir**.
  - **Validar factura**: si hay riesgos, pide **"aceptar el riesgo"** y lo deja registrado en notas.
  - Una factura no contabilizada queda **bloqueada** hasta que se reabra.
- **Pestaña Datos:**
  - Emisor, NIF, **cuenta de proveedor**, **fecha contable**, nº de factura, CP, fecha de emisión y **fecha de devengo**.
  - **Divisa**: importe original, tipo de cambio editable y fecha.
  - **Desglose de IVA ampliado**, por línea: contrapartida (cuenta), base, tipo, cuota, **% deducible** (con motivo si no es 100 %), **cuota de recargo de equivalencia**, **tipo y cuota de retención**, **código de transacción** (operación corriente, intracomunitaria, importación, ISP, bien de inversión, no deducible, REAGP) y **skill aplicada**. Una skill puede repartir una línea en varias cuentas (p. ej. 70/30).
  - Totales con IVA deducible y no deducible (este último se suma al gasto).
  - Aprendizaje de cuenta ("¿aplicar siempre?"), propuesta de asiento y cuadre.
  - Resúmenes de riesgo fiscal, riesgo operativo y skills aplicadas.
- **Comprobaciones automáticas**, agrupadas en riesgo fiscal y operativo:
  - **Proveedor:** censo AEAT o **VIES**; **morosos** de la AEAT y **paraísos fiscales**; operación **vinculada**; **duplicados** (mismo NIF + nº de factura + importe).
  - **Requisitos de la factura:** mención de exención en líneas al 0 %; rectificativa con referencia; **tipo de IVA coherente con el concepto**.
  - **Deducibilidad:** conceptos coherentes con el **IAE**; inmueble del suministro afecto (**locales**); **vehículo turismo** (presunción del 50 % o afectación del 100 %); **gasto personal** (conceptos o fin de semana); **prorrata**.
  - **Registro y regularización:** **bien de inversión** (> 3.005,06 €); **venta de inmovilizado** (emitidas); **periodificación** (periodos que cruzan el cierre, cuentas 480/485).
  - **Operativo:** **facturas anteriores del proveedor** (media de 6 meses y desviación, con gráfico), proveedor nuevo.
  - Filtros (todas, con incidencias, fiscal, operativo) y búsqueda.
- **IS:** gastos no deducibles (con referencia legal), **ajustes fiscales** al modelo 200 y posibles deducciones o incentivos.
- **Productos:** líneas extraídas (descripción, cantidad, precio unitario, tipo de IVA, importe), resaltadas en el visor.
- **Notas** (con archivos adjuntos) y **Tareas** (asignables a "Tú", otro asesor, el cliente o la IA; con fecha y vencidas).
- **Chat IA:**
  - Asistente fiscal con el contexto de la factura, los riesgos y las skills.
  - "Pregunta a la IA" desde cada riesgo, e histórico de chats por factura.
- **Perfil fiscal, Actividades (IAE), Locales afectos y Turismos en el activo** (matrícula, alta, valor, amortización, % de afectación): datos del cliente.

## Implicaciones
- **Fase 1 (ingestión y separación):** sin cambios. Sigue siendo la base.
- **Extracción (Fase 2):** muchos más campos (ver arriba), productos, divisa, confianza por campo y **consumo de IA por documento**, que ya previmos en `procesamientos`. Se mantiene la regla de dos tablas (lo que extrae la IA frente a lo que confirma el operador).
- **Estado contable del documento** (Pendiente / Contabilizado / No contabilizado + motivo, reabrir, riesgo aceptado). Es un estado de negocio distinto del estado técnico del procesamiento (`LISTO`, `REQUIERE_REVISION`…) y va en las tablas de revisión y confirmación.
- **Módulos nuevos:**
  - motor de comprobaciones y riesgo;
  - cuantificación del riesgo (económico, IS, IVA, IRPF) y pantalla de riesgo no prescrito;
  - colaboración: notas, tareas y chat IA;
  - editor de skills (las skills alimentan los prompts de extracción);
  - envío al software contable (a3ERP) y aviso al cliente.
- **Fuentes de datos externas que hay que resolver:**
  - censo AEAT y VIES;
  - lista de deudores de la AEAT;
  - lista de paraísos fiscales (Orden HFP/115/2023);
  - datos del cliente: perfil fiscal, IAE, locales, turismos, vinculados, prorrata;
  - histórico de facturas por proveedor (sale de nuestros propios datos confirmados).

Hoja de ruta ajustada: [hoja-de-ruta.md](hoja-de-ruta.md).

## De dónde sale cada dato

Estado a 28/09/2026 (pantallas v2 hechas en LWC, pendientes de desplegar). En pantalla, lo que no es real lleva la etiqueta **"Datos de ejemplo"** o **"Ejemplo"**; en el código, cada bloque de ejemplo explica qué falta (`bandejaContableMock`).

| Dato | Origen | Dónde |
|---|---|---|
| Bandejas, archivos, empresa, asesor | **Real** · Salesforce | `BandejaContableController` |
| Archivo original (ver y descargar) | **Real** · Google Storage (URL firmada) | `listarArchivosGoogle` |
| Perfil fiscal: régimen de estimación, operador intracomunitario, situación censal, territorio, consolidación, software de facturación, código ERP | **Real** · `Contrato_Contabilidad_y_Fiscal__c` abierto | `BandejaContableClienteService` |
| Censo VIES (manual), grupo empresarial, deducción IVA vehículos (texto) | **Real** · Account | ídem |
| Obligaciones tributarias en alta | **Real** · `Impuestos__c` | ídem |
| Actividades económicas (IAE) | **Real** · `actividad_economica__c` sin fecha de baja | ídem |
| Locales afectos (dirección, ref. catastral, % afectación) | **Real** · `Actividad_Economica_Local_afecto__c` | ídem |
| Vinculados (socios y administradores) | **Real** · `Socios__c`, `Administrador__c` | ídem |
| Domicilio fiscal | **Real** · dirección de facturación de Account (sin contrastar con el censo) | ídem |
| Régimen de IVA, prorrata, criterio de caja, R.E., ROI | Ejemplo · no existe en Salesforce | `perfilSinDatos` |
| Turismos con % de afectación | Ejemplo · `Elemento_de_Transporte__c` no se enlaza con Account | `turismos` |
| Software contable de destino | Real si `Account.Software_gesti_n_Despachos__c` está relleno; si no, ejemplo | cabecera del documento |
| Documentos separados, datos extraídos, productos, confianza, consumo de IA | Ejemplo · Fases 1–2 | `PLANTILLAS` |
| Estado contable (validar, no contabilizar, reabrir, riesgo aceptado) | Ejemplo · en memoria; irá a `confirmaciones` | `cambiarEstadoDocumento` |
| Reglas por proveedor, propuestas, validaciones, skills | Ejemplo · en memoria; irán a Cloud SQL | `datosEmpresa` |
| Notas, tareas, chat IA | Ejemplo · en memoria; almacenamiento por decidir (Fase 5) | `notasDe`, `tareasDe`, `chatsDe` |
| Censo AEAT / VIES, deudores de la AEAT | Ejemplo · sin integración | comprobaciones marcadas "Ejemplo" |
| Histórico del proveedor y duplicados | Ejemplo · saldrá de las confirmaciones | `historicoProveedor`, `duplicadoDe` |
| Situación fiscal en el listado OCR | Ejemplo · la calculará el motor de comprobaciones | `situacionFiscal` |
| Riesgo fiscal no prescrito | Ejemplo · sobre confirmaciones con riesgo aceptado | `riesgos` |

Los **cálculos** (desglose de IVA, IVA no deducible, asiento y cuadre, riesgos, comprobaciones, IS, productos) son reales sobre esos datos: `bandejaContableCalculos`, con tests.

Diferencias con el prototipo de Claude Design:
- El editor de skills es el formulario del modal (título, ámbito, aplica a, NIF, instrucción, cuenta, vista previa) en la ficha de la empresa y en la pestaña Skills del documento; no el editor de texto enriquecido de la pestaña del documento.
- A la pantalla 06 (riesgo no prescrito) se entra desde la ficha de la empresa: el prototipo no tenía acceso.
- El aprendizaje de cuenta ("¿Aplicar siempre?") se dispara al cambiar la contrapartida de una línea de IVA, porque la v2 ya no tiene el campo "Cuenta de gasto".
