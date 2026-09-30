# Diseño de la interfaz (Claude Design)

Fuente: `Bandeja contable OCR de Salesforce-handoff.zip` (v2 Híbrido, versión del 30/09/2026) en la raíz del repo; no se versiona (`.gitignore`). Leer `project/Bandeja Contable v2 Hibrido.dc.html`, que sustituye como referencia a la v2 (`Bandeja Contable.dc.html`, 28/09/2026); `support.js` es el motor de Claude Design, sin lógica de negocio. El archivo conserva el nombre de la versión del 29/09, pero su contenido cambia (abajo).

## Qué cambia en la v2 Híbrido del 30/09
Solo el frontend.
- **Navegación:** "OCR" es la primera pestaña y la página se abre en el listado OCR. En el listado OCR desaparecen el rótulo "OCR · Listado documentos" y las subpestañas "Listado documentos / Listado empresa" (se agrupa con "Agrupar por empresas").
- **Tres capas** en el documento, cada una con su estado: badge "✓ Pre-validado" (fondo verde) o "⚠ N incidencias" (fondo rojo) y una línea de detalle.
  - **1 · Inteligencia contable** (antes "Extracción de datos"): Datos, Skills, Productos, Notas y Archivos, Tareas y **Correos**. Incidencias: descuadre de bases + cuotas − IRPF con el total, asiento descuadrado, cuotas que no son base × tipo y deducciones parciales sin motivo.
  - **2 · Inteligencia fiscal**: Check, Perfil fiscal, Impuesto de Sociedades, Actividades, Locales y Turismos. Incidencias: las comprobaciones con incidencia; si solo hay comprobaciones resueltas por una skill del cliente, "Incidencia validada por Skill del cliente". Se abre siempre en Check, con el filtro "Con incidencias" si hay algo que mirar.
  - **3 · Inteligencia financiera** (nueva): **Tesorería** (importe, fecha de cargo, saldo previsto, periodo medio de pago, forma de pago, mandato SEPA, previsión a 30 días) y **Análisis de gasto** (media, desviación, acumulado, evolución por meses y peso en la cuenta de resultados).
  - Desaparecen la línea de pasos (Extraído → Validado → Interpretado → Insight fiscal), "Confirmar datos y ver análisis fiscal", "Reabrir datos" y el aviso "Análisis provisional".
- **Rosetta IA** (botón de la cabecera) sustituye a la pestaña "Chat IA": el chat ocupa el sitio de las capas y las pestañas, con "Volver".
- **Pestañas:** orden Datos, Check, Skills, Perfil fiscal, Impuesto de Sociedades (antes "IS"), Productos, Notas y Archivos, Tareas, Correos, Actividades, Locales, Turismos, Tesorería, Análisis de gasto. El contador de Check suma incidencias y comprobaciones resueltas por skill.
- **Datos:** desaparece el resumen de riesgo fiscal, riesgo operativo y skills aplicadas (con él, "Riesgo económico" y "Pregunta a la IA"). Queda el desglose de IVA a todo el ancho y debajo, en dos columnas, los campos y la propuesta de asiento con el cuadre.
- **Validar con riesgo:** hay que elegir cómo se resuelve:
  - **Crear Skill para este cliente** (título e instrucción propuestos): se guarda para ese proveedor y la empresa.
  - **Aceptación puntual con aceptación del cliente**: email (para, asunto, mensaje) que se envía al validar.
  - **Otros**, con motivo obligatorio.

  El botón no se activa hasta completar la opción y la nota de Notas y archivos dice cómo se resolvió.
- **Correos** (nueva pestaña): correos enviados y recibidos del documento, con adjuntos, y "+ Nuevo correo".
- **Check:** solo los filtros "Todas" y "Con incidencias". Las comprobaciones resueltas por una skill salen en ámbar con "Skill aplicada · …" y no cuentan como incidencia. Nueva comprobación **Factura simplificada** (ticket sin NIF del destinatario: el IVA no es deducible).
- **Skill de ejemplo SK-007** (Repsol, tickets sin NIF: IVA no deducible), aplicada en el ticket de ejemplo (0 % deducible).
- **Visor:** botón "Ampliar": ve el documento al 50 % del ancho de la pantalla.
- **Cabecera:** ya no muestra el consumo de IA.

## Qué cambia de la v2 a la v2 Híbrido
Solo el frontend; el backend de Google no cambia.
- **Capas del documento** (pantalla "02 Capas del documento", entre la cabecera y las pestañas). Dos tarjetas:
  - **1 · Extracción de datos** (en el diseño, "Extracción y validación"): Datos, Skills, Productos, Notas y Archivos, Tareas.
  - **2 · Inteligencia fiscal**: Perfil fiscal, Check, IS, Chat IA, Actividades, Locales, Turismos.

  La barra de pestañas solo muestra las de la capa activa y cada capa recuerda su última pestaña. Debajo, la línea de pasos: Extraído → Validado → Interpretado → Insight fiscal. "Confirmar datos y ver análisis fiscal" marca los datos como validados y salta a la capa 2; "Reabrir datos" lo deshace. En la capa 2, sin validar, aparece el aviso "Análisis provisional" con "Validar datos".
- **Pestañas renombradas**: "Comprobaciones" pasa a "Check" y "Notas" a "Notas y Archivos". Orden: Datos, Skills, Perfil fiscal, Check, IS, Productos, Notas y Archivos, Tareas, Chat IA, Actividades, Locales, Turismos.
- **Buscador de cuentas contables** (`bandejaContableCuentas`). Se abre al pulsar la contrapartida de cada línea de IVA (grupo Gastos, o Ingresos si la cuenta empieza por 7), la cuenta de proveedor (Proveedores) y la cuenta de cada fila del asiento y de las líneas añadidas (Todas; ahí escribe solo el código). Busca por código o nombre, filtra por grupo, resalta la cuenta actual y permite "Usar «x» como cuenta nueva". Enter elige la primera y Esc cierra. Si no cabe debajo, se abre hacia arriba.
- **IS**: solo "Gastos no deducibles", cada uno con la etiqueta "Diferencia permanente · ajuste fiscal +". Desaparecen "Ajustes fiscales" y "Posibles deducciones". El contador de la pestaña es el número de no deducibles.
- **Skills**:
  - Estado Activa/Inactiva. Una inactiva exige fecha de finalización, se ve en gris ("Finalizada el …") y no se aplica: no cuenta en "Skills aplicadas" ni sale como chip.
  - **Empresas afectadas** (`bandejaContableSkillEmpresas`): pestañas Empresas y Grupos empresariales, buscador, "Seleccionar todas", chips con ×, contador de afectadas (las de los grupos incluidas) e "Incluida por grupo".
  - En la lista, el botón "N empresas · M grupos ▼" despliega las afectadas: la empresa actual en negrita y los grupos como chips oscuros.
  - Nueva skill de ejemplo SK-006 (Endesa, IVA deducible al 30 %), que sale como segundo chip en sus líneas de IVA. SK-004 pasa a inactiva.
  - **Editor en la pestaña Skills del documento**: lista a la izquierda y editor a la derecha. Lleva número, título, Activa/Inactiva, fecha de fin, empresas afectadas y texto con formato (`lightning-input-rich-text`), más Guardar, Cancelar y Eliminar. Se guarda el HTML y el texto plano, que es lo que leerá la IA.
  - En la ficha de empresa sigue la ventana, como en el diseño, con los mismos campos nuevos.

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

Estado a 30/09/2026 (v2 Híbrido del 30/09 hecha en LWC). En pantalla, lo que no es real lleva la etiqueta **"Datos de ejemplo"** o **"Ejemplo"**; en el código, cada bloque de ejemplo explica qué falta (`bandejaContableMock`).

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
| Reglas por proveedor, propuestas, validaciones | Ejemplo · en memoria; irán a Cloud SQL | `datosEmpresa` |
| Skills (texto, estado, fecha de fin) | Ejemplo · almacén único en memoria; irán a Cloud SQL y al prompt de extracción | `skillsDeEmpresa`, `guardarSkill` |
| Empresas y grupos empresariales de las skills | **Real** · Account y `Grupo_Empresarial__c` (empresas del asesor y sus grupos; todas en modo libre) | `buscarEmpresasYGrupos` |
| Plan de cuentas del buscador de cuentas | Ejemplo · el real está en Sage (clave `Contrato.C_digo_ERP__c`) | `PLAN_CUENTAS` |
| Notas, tareas, chat (Rosetta IA) | Ejemplo · en memoria; almacenamiento por decidir (Fase 5) | `notasDe`, `tareasDe`, `chatsDe` |
| Correos del documento y email al cliente para aceptar un riesgo | Ejemplo · no se envía nada, se anota en memoria; envío y email del cliente por decidir | `correosDe`, `anadirCorreo` |
| Tesorería y análisis de gasto (capa 3) | Ejemplo · cifras calculadas a partir del total de la factura; saldrán del banco, de Sage y de las confirmaciones | `datosFinancieros` |
| Skill creada al validar con riesgo | Ejemplo · almacén de skills en memoria | `guardarSkill` |
| Censo AEAT / VIES, deudores de la AEAT | Ejemplo · sin integración | comprobaciones marcadas "Ejemplo" |
| Histórico del proveedor y duplicados | Ejemplo · saldrá de las confirmaciones | `historicoProveedor`, `duplicadoDe` |
| Situación fiscal en el listado OCR | Ejemplo · la calculará el motor de comprobaciones | `situacionFiscal` |
| Riesgo fiscal no prescrito | Ejemplo · sobre confirmaciones con riesgo aceptado | `riesgos` |

Los **cálculos** (desglose de IVA, IVA no deducible, asiento y cuadre, riesgos, comprobaciones, IS, productos) son reales sobre esos datos: `bandejaContableCalculos`, con tests.

Diferencias con el prototipo de Claude Design:
- El grupo de campos del emisor se sigue llamando "Emisor" (el prototipo pone "Destinatario" a la razón social y el NIF del proveedor).
- "Ampliar": en el prototipo, una lupa que clona la página al 50 % de la pantalla. Aquí abre un panel fijo sobre la mitad izquierda, desde debajo del menú hasta el borde inferior de la pantalla, con el spinner hasta que carga y "Página completa / Ajustar al ancho". Se cierra con un clic fuera, con la × o con Esc.
- El consumo de IA del documento pasa al tooltip de "Extracción automática".
- La pantalla 04 (recuento por empresa) sigue existiendo, aunque ya no tiene pestaña (se llega por URL, `c__vista=ocrEmpresas`).
- El "Para" del email al cliente sale vacío: el prototipo lo rellena, pero el email del cliente no está en los datos de Salesforce que se leen hoy.
- El editor de la pestaña Skills conserva, en una fila compacta, el ámbito (general o proveedor por NIF), "aplica a" y la cuenta, que el diseño solo tiene en la ventana: sin ellos, una skill creada desde el documento no podría ligarse a un proveedor.
- El texto con formato usa el editor estándar de Salesforce (`lightning-input-rich-text`), no la barra de herramientas propia del prototipo.
- A la pantalla 06 (riesgo no prescrito) se entra desde la ficha de la empresa: el prototipo no tenía acceso.
- El aprendizaje de cuenta ("¿Aplicar siempre?") se dispara al cambiar la contrapartida de una línea de IVA, porque la v2 ya no tiene el campo "Cuenta de gasto".
