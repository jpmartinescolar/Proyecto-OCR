import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';
import getInicioRapido from '@salesforce/apex/AreaContableFiscalController.getInicioRapido';
import getResumen from '@salesforce/apex/AreaContableFiscalController.getResumen';
import getMisTareas from '@salesforce/apex/AreaContableFiscalController.getMisTareas';
import getMisTareasProximas from '@salesforce/apex/AreaContableFiscalController.getMisTareasProximas';
import getTareasTodas from '@salesforce/apex/AreaContableFiscalController.getTareasTodas';
import getSenalamientosLegales from '@salesforce/apex/AreaContableFiscalController.getSenalamientosLegales';
import getAusenciasEquipo from '@salesforce/apex/AreaContableFiscalController.getAusenciasEquipo';
import getTeletrabajo from '@salesforce/apex/AreaContableFiscalController.getTeletrabajo';
import getOportunidadesPanel from '@salesforce/apex/AreaContableFiscalController.getOportunidadesPanel';
import getCasosAbiertos from '@salesforce/apex/AreaContableFiscalController.getCasosAbiertos';
import getLeadsAbiertos from '@salesforce/apex/AreaContableFiscalController.getLeadsAbiertos';
import getContabilidadesAbiertas from '@salesforce/apex/AreaContableFiscalController.getContabilidadesAbiertas';
import getPrecierresAbiertos from '@salesforce/apex/AreaContableFiscalController.getPrecierresAbiertos';
import getCierresAbiertos from '@salesforce/apex/AreaContableFiscalController.getCierresAbiertos';
import getLibrosAbiertos from '@salesforce/apex/AreaContableFiscalController.getLibrosAbiertos';
import getCuentasAbiertas from '@salesforce/apex/AreaContableFiscalController.getCuentasAbiertas';

import getRentasAbiertas from '@salesforce/apex/AreaContableFiscalController.getRentasAbiertas';
import getExpedientesAbiertos from '@salesforce/apex/AreaContableFiscalController.getExpedientesAbiertos';
import getVencimientosLegales from '@salesforce/apex/AreaContableFiscalController.getVencimientosLegales';
import getVencimientosLegalesLista from '@salesforce/apex/AreaContableFiscalController.getVencimientosLegalesLista';
import getContratosCF from '@salesforce/apex/AreaContableFiscalController.getContratosCF';
import getContratosCFMeses from '@salesforce/apex/AreaContableFiscalController.getContratosCFMeses';
import getBuzonContable from '@salesforce/apex/AreaContableFiscalController.getBuzonContable';
import getObligacionesTributarias from '@salesforce/apex/AreaContableFiscalController.getObligacionesTributarias';
import getOpcionesObligacion from '@salesforce/apex/AreaContableFiscalController.getOpcionesObligacion';
import getCargaTrabajo from '@salesforce/apex/AreaContableFiscalController.getCargaTrabajo';
import getTareasLegalesUsuario from '@salesforce/apex/AreaContableFiscalController.getTareasLegalesUsuario';
import getMovimientosContables12m from '@salesforce/apex/AreaContableFiscalController.getMovimientosContables12m';
import getMovimientosContablesDetalle from '@salesforce/apex/AreaContableFiscalController.getMovimientosContablesDetalle';
import crearObligacionTributaria from '@salesforce/apex/AreaContableFiscalController.crearObligacionTributaria';
import actualizarObligacionTributaria from '@salesforce/apex/AreaContableFiscalController.actualizarObligacionTributaria';
import guardarCatalogoHtml from '@salesforce/apex/AreaContableFiscalController.guardarCatalogoHtml';
import guardarHtmlPdf from '@salesforce/apex/AreaContableFiscalController.guardarHtmlPdf';
import getPanelRRHH from '@salesforce/apex/AreaRRHHController.getPanelRRHH';
import getAccesoRRHH from '@salesforce/apex/AreaRRHHController.getAccesoRRHH';
import getImputacionesPendientes from '@salesforce/apex/AreaRRHHController.getImputacionesPendientes';
import getAusenciasMes from '@salesforce/apex/AreaRRHHController.getAusenciasMes';
import getAusenciasListado from '@salesforce/apex/AreaRRHHController.getAusenciasListado';
import enviarRecordatorioImputacion from '@salesforce/apex/AreaRRHHController.enviarRecordatorioImputacion';
import getIncidenciasImputaciones from '@salesforce/apex/AreaRRHHController.getIncidenciasImputaciones';
import actualizarEstadoImputacion from '@salesforce/apex/AreaRRHHController.actualizarEstadoImputacion';
import borrarRegistroHorario from '@salesforce/apex/AreaRRHHController.borrarRegistroHorario';

// Columnas de recuento del listado de contratos contables y fiscales
const COLS_CC = ['contabilidades', 'precierres', 'cierres', 'libros', 'cuentas', 'rentas', 'expedientes', 'casos', 'tareas'];
// Contadores de vencidos de cada línea de contrato (van en pequeño bajo el número)
const COLS_CC_VENC = ['contabVencidas', 'precVencidos', 'cierVencidos', 'librosVencidos', 'cuentasVencidas'];

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Orden de flujo de los estados de cuentas anuales para las cajas dinámicas
const ORDEN_ESTADOS_CUENTAS = ['Cierre pendiente', 'Preparar Certif.', 'Revisar Certif.', 'Enviada Certif.',
    'Preparar cuentas', 'Presentar', 'Incidencias', 'Presentado'];

// Estados de renta: cajas fijas en orden de flujo
const ESTADOS_RENTA = ['Sin formulario', 'Descargar datos', 'Asignar', 'Presupuestar',
    'Presupuestado', 'Aceptado', 'En Curso'];

// Orden de flujo de los estados del buzón contable para las cajas dinámicas
// (Contabilizado no aparece: el listado solo trae pendientes)
const ORDEN_ESTADOS_BUZON = ['Sin clasificar', 'Sin periodo abierto', 'Clasificado'];

// Periodicidades de contabilidad: [orden dentro del año, mes efectivo de vencimiento].
// Los trimestres van tras su último mes y vencen con él (Primer Trimestre = marzo...)
const PERIODOS_CONTAB = {
    'Enero': [1, 1], 'Febrero': [2, 2], 'Marzo': [3, 3], 'Primer Trimestre': [3.5, 3],
    'Abril': [4, 4], 'Mayo': [5, 5], 'Junio': [6, 6], 'Segundo Trimestre': [6.5, 6],
    'Julio': [7, 7], 'Agosto': [8, 8], 'Septiembre': [9, 9], 'Tercer Trimestre': [9.5, 9],
    'Octubre': [10, 10], 'Noviembre': [11, 11], 'Diciembre': [12, 12], 'Cuarto Trimestre': [12.5, 12]
};

// Accesos rápidos de Mi panel, en dos filas de seis. Las URLs relativas son
// páginas de la Experience Cloud; las absolutas se abren en pestaña nueva.
const MIS_ACCESOS = [
    { key: 'formacion', label: 'Mi formación', icono: 'utility:education', chip: '', url: '/formacion' },
    { key: 'imputar', label: 'Mis imputaciones de horas', icono: 'utility:clock', chip: '', url: '/imputacin-de-horas-hoy' },
    { key: 'gastos', label: 'Mis notas de gastos', icono: 'utility:note', chip: '', url: '/viajes-y-otros-gastos' },
    { key: 'ausencias', label: 'Mis ausencias', icono: 'utility:event', chip: '', url: '/ausencias-y-vacaciones' },
    { key: 'registro', label: 'Mi registro horario', icono: 'utility:clock', chip: '', url: '/registro-horario' },
    { key: 'fichaje', tipo: 'timer' },
    { key: 'academia', label: 'Academia', icono: 'utility:education', chip: 'azul', url: 'https://club.innovaciondespachos.com/' },
    { key: 'conocimiento', label: 'Zona de Conocimiento', icono: 'utility:knowledge_base', chip: 'teal', url: '/article/centro-de-ayuda' },
    { key: 'blog', label: 'Blog', icono: 'utility:edit', chip: 'celeste', url: '/noticias' },
    { key: 'companeros', label: 'Usuarios despachos', icono: 'utility:groups', chip: 'verde', url: '/equipo-de-trabajo' },
    { key: 'notificaciones', label: 'Notificaciones', icono: 'utility:notification', chip: 'rosa', url: '/notificaciones-electronicas/Notificaciones_electronicas__c/00BP5000004VfkXMAS' },
    { key: 'incidencia', label: 'Incidencia informática', icono: 'utility:bug', chip: 'naranja', url: '/auditor-a/Auditor_a__c/Default' }
];

// Grupos de color del calendario de ausencias del equipo, por tipo de ausencia.
// Los tipos que no encajan en ningún grupo caen en "otros".
const AUS_GRUPOS = [
    { key: 'vacaciones', label: 'Vacaciones', tipos: ['Vacaciones'] },
    { key: 'baja', label: 'Baja / enfermedad', tipos: [
        'Enfermedad o Médico propia',
        'Enfermedad grave, accidente o fallecimiento  de un familiar'] },
    { key: 'permiso', label: 'Permiso / asuntos propios', tipos: [
        'Asunto personal urgente', 'Banco, Notaría o Administraciones Públicas',
        'Permisos retribuidos', 'Mudanza', 'Matrimonio', 'Colegio de niños'] },
    { key: 'maternidad', label: 'Maternidad / paternidad', tipos: ['Maternidad o Paternidad', 'Lactancia'] },
    { key: 'otros', label: 'Exámenes / otros', tipos: ['Exámenes', 'Deberes públicos', 'Función sindical'] }
];

const SIN_EMPRESA = 'Sin empresa titular';
const SIN_DEPARTAMENTO = 'Sin departamento';
const SIN_ASESOR = 'Sin asesor';

// Filtros por defecto de la Visión general (los restaura el botón Limpiar)
const VIS_EMPRESAS_DEFECTO = [
    'Centro de Innovación de Despachos y Pymes, S.L',
    'Castellana Consultores, S.L',
    'S16 Asesores Tributarios, S.L',
    'GM Consulting Empresarial, S.L'
];
const VIS_DEPARTAMENTOS_DEFECTO = ['Administración', 'Fiscal y Contable'];

// Matriz de Obligaciones tributarias: bandas de modelos con su color, en el
// orden de la maqueta. Cada columna lleva la etiqueta corta y los valores del
// picklist Modelos__c que la encienden (Intrastat se abrevia)
const OBL_BANDAS = [
    { nombre: 'Renta', cls: 'obl-band obl-band-renta',
      modelos: ['100', '130', '131', '184', '345', '720'] },
    { nombre: 'Sociedades', cls: 'obl-band obl-band-soc',
      modelos: ['200', '202', '203', '220', '222', '223', '22A', '232', 'S90', 'S91'] },
    { nombre: 'Retenciones', cls: 'obl-band obl-band-ret',
      modelos: ['110', '111', '115', '123', '180', '190', '193', '216', '296',
                '716', '759', '760'] },
    { nombre: 'IVA', cls: 'obl-band obl-band-iva',
      modelos: ['303', '309', '320', '322', '330', '347', '349', '353', '369', '390',
                '410', '415', '417', '420', '425', 'F66', 'F69', 'SII'] },
    { nombre: 'Intrastat', cls: 'obl-band obl-band-intra',
      modelos: ['IC', 'IV'] },
    { nombre: 'Otros', cls: 'obl-band obl-band-terr',
      modelos: ['583', '848'] }
];
// Valores del picklist que enciende cada columna abreviada
const OBL_ALIAS = {
    'IC': ['Intrastat Compra'],
    'IV': ['Intrastat Venta']
};
// Descripción de cada modelo para la ficha censal
// Modelos de retenciones (111/190 trabajo y profesionales, 216/296 no residentes): su fila
// de la ficha de obligaciones va con fondo gris claro para distinguirlos de un vistazo
const OBL_MODELOS_GRIS = ['111', '190', '216', '296'];
// Columnas de la matriz que el despacho quiere ver de un vistazo (retenciones de
// trabajo y profesionales 110/111/190, no residentes 216/296 y el 345): toda la
// columna va en verde claro, cabecera y totales incluidos, en las dos matrices
const OBL_MODELOS_VERDES = ['110', '111', '190', '345', '216', '296'];
const oblColVerdeCls = (modelo) => (OBL_MODELOS_VERDES.includes(modelo) ? ' obl-col-verde' : '');
// Impuesto sobre Sociedades y pago fraccionado en todos los territorios: 200 y 202 (común,
// Canarias y Álava), 203 (pago fraccionado de Bizkaia y Guipúzcoa), S90 y S91 (Navarra)
const OBL_MODELOS_SOCIEDAD = ['200', '202', '203', 'S90', 'S91'];
// Pagos a cuenta de un solo plazo (forales y Navarra): su chip es 1x en vez de 3x
const OBL_PAGO_UNICO = ['203', '223', 'S91'];
// Oportunidades: tramos de antigüedad (días desde la creación) del gráfico de acumulados de la
// columna izquierda; a partir de 11 días se considera retraso y el tramo va en rojo
const OPO_TRAMOS = [
    { key: 'a10', label: 'De 0 a 10 días', rojo: false },
    { key: 'a30', label: 'De 11 a 30 días', rojo: true },
    { key: 'a60', label: 'De 31 a 60 días', rojo: true },
    { key: 'a60m', label: 'Más de 60 días', rojo: true }
];

const OBL_DESCRIPCIONES = {
    '100': 'IRPF anual', '110': 'Retenciones trabajo (antiguo)', '111': 'Retenciones trabajo y actividades',
    '115': 'Retenciones alquileres', '123': 'Retenciones capital mobiliario',
    '130': 'Pago fracc. estimación directa', '131': 'Pago fracc. módulos',
    '180': 'Resumen anual alquileres', '184': 'Entidades en atribución de rentas',
    '190': 'Resumen anual retenciones', '193': 'Resumen anual capital mobiliario',
    '200': 'Impuesto de Sociedades individual', '202': 'Pago fraccionado Sociedades individual',
    '203': 'Pago fraccionado Sociedades individual', '216': 'Retenciones no residentes',
    '220': 'Impuesto de Sociedades consolidado', '222': 'Pago fraccionado consolidado', '223': 'Pago fraccionado consolidado', '22A': 'Anexo Pago fraccionado consolidado',
    '232': 'Operaciones vinculadas', '296': 'Resumen anual no residentes',
    '303': 'IVA individual sin grupo', '309': 'IVA no periódico', '320': 'IVA individual sin grupo', '330': 'IVA mensual Bizkaia y Guipúzcoa (SII)',
    '322': 'IVA individual con grupo', '345': 'Planes de pensiones', '347': 'Operaciones con terceros',
    '349': 'Operaciones intracomunitarias', '353': 'IVA grupo',
    '369': 'IVA ventanilla única', '390': 'Resumen anual IVA',
    '410': 'IGIC para grandes empresas', '415': 'IGIC operaciones con terceros',
    '417': 'IGIC', '420': 'IGIC', '425': 'IGIC resumen anual',
    '583': 'Impuesto producción energía', '716': 'Retenciones capital mobiliario',
    '720': 'Bienes en el extranjero', '759': 'Retenciones alquileres',
    '760': 'Retenciones alquileres', '848': 'IAE',
    'F66': 'IVA individual sin grupo', 'F69': 'IVA individual sin grupo',
    'S90': 'Impuesto de Sociedades individual', 'S91': 'Pago fraccionado Sociedades individual',
    'Intrastat Compra': 'Intrastat compra', 'Intrastat Venta': 'Intrastat venta',
    'IC': 'Intrastat compra', 'IV': 'Intrastat venta',
    'SII': 'Suministro Inmediato de Información'
};

// Calendario "bruto" por modelo (sin registros): fechas de vencimiento no
// mensuales (mismo criterio que la fórmula Vencimientos__c de Impuestos)
const OBL_VENC_FECHAS = {
    '110': '20/04;20/07;20/10;20/01', '111': '20/04;20/07;20/10;20/01',
    '115': '20/04;20/07;20/10;20/01', '123': '20/04;20/07;20/10;20/01',
    '216': '20/04;20/07;20/10;20/01',
    '130': '20/04;20/07;20/10;30/01', '131': '20/04;20/07;20/10;30/01',
    '303': '20/04;20/07;20/10;30/01', '309': '20/04;20/07;20/10;30/01',
    '349': '20/04;20/07;20/10;30/01',
    '202': '20/04;20/10;20/12', '222': '20/04;20/10;20/12', '22A': '20/04;20/10;20/12',
    'S90': '25/07', 'S91': '20/10',
    '716': '20/04;20/07;20/10;31/01', '759': '20/04;20/07;20/10;31/01',
    '760': '20/04;20/07;20/10;31/01',
    '320': '25/04;25/07;25/10',
    // F69 (Navarra): el del segundo trimestre se amplía hasta el 5 de agosto
    '420': '20/04;20/07;20/10;31/01', 'F69': '20/04;5/08;20/10;31/01',
    '410': '31/01', '415': '28/02', '425': '31/01', '390': '30/01',
    '180': '31/01', '184': '31/01', '190': '31/01', '193': '31/01',
    '296': '31/01', '345': '31/01',
    '347': '28/02', '720': '31/03', '848': '14/02',
    '100': '30/06', '150': '30/06',
    '200': '25/07', '203': '25/10', '223': '25/10', '220': '25/07',
    '232': '30/11',
    '583': '20/02;20/05;20/09;20/11',
    'SII': '4 días háb.'
};
const OBL_MESES_NOMBRES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Territorio habitual de cada modelo del calendario (el resto, territorio común)
const OBL_TERRITORIO_MODELO = {
    '410': 'Canarias', '415': 'Canarias', '417': 'Canarias', '420': 'Canarias',
    '425': 'Canarias', 'F66': 'Navarra', 'F69': 'Navarra',
    'S90': 'Navarra', 'S91': 'Navarra',
    '716': 'Navarra', '759': 'Navarra', '760': 'Navarra',
    '203': 'Guipúzcoa', '223': 'Guipúzcoa', '320': 'Guipúzcoa', '330': 'Guipúzcoa'
};
// Territorios en los que el modelo también se presenta con LOS MISMOS plazos que en su
// territorio principal: en el catálogo salen como chips junto a él, sobre las mismas líneas
// (los territorios con plazos distintos van en OBL_VENC_FORAL, con sus propias líneas)
const OBL_TERRITORIOS_MISMOS_PLAZOS = {
    '180': ['Guipúzcoa'],
    '193': ['Guipúzcoa'],
    '200': ['Guipúzcoa', 'Bizkaia', 'Álava'],
    '203': ['Bizkaia', 'Álava'],
    '220': ['Guipúzcoa', 'Bizkaia', 'Álava', 'Navarra'],
    '223': ['Bizkaia'],
    '232': ['Guipúzcoa', 'Bizkaia', 'Álava', 'Navarra'],
    '303': ['Bizkaia', 'Álava'],
    '309': ['Bizkaia', 'Álava'],
    '322': ['Navarra'],
    '330': ['Bizkaia'],
    '349': ['Navarra'],
    '848': ['Guipúzcoa', 'Bizkaia', 'Álava', 'Navarra'],
    '22A': ['Bizkaia'],
    'SII': ['Guipúzcoa', 'Bizkaia', 'Álava', 'Navarra', 'Canarias']
};

// Periodicidades que el catálogo fuerza aunque el picklist dependiente admita más: el 417
// (IGIC de grandes empresas) es solo mensual
const OBL_PER_FORZADA = { '417': ['Mensual'] };
// Modelos que ya no existen y no salen en el catálogo (siguen en la matriz por las
// obligaciones antiguas que aún los tengan): el 410 se sustituyó por el 417 y el 420
const OBL_CAT_EXCLUIDOS = ['410'];
// Periodicidades de los modelos sin dependencia configurada en el picklist,
// para que el calendario les pinte sus líneas igualmente
const OBL_PER_SIN_PICKLIST = {
    '848': ['Anual'],
    '223': ['Pago a cuenta'],
    '330': ['Mensual'],
    '716': ['Mensual', 'Trimestral'],
    '759': ['Trimestral'],
    '760': ['Mensual', 'Trimestral']
};

// Vencimientos forales que difieren del territorio común: líneas extra del
// calendario por modelo, con su etiqueta de territorio, texto y fechas
// Guipúzcoa: día 25 de cada mes, salvo enero, que es el 31
const OBL_FORAL_GUI_MENSUAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    .map(m => ({ mes: m, dia: m === 1 ? 31 : 25 }));
// Modelos que viven en territorio común Y en Guipúzcoa: debajo de sus líneas
// del común salen estas, una por cada periodicidad que admita el picklist
const OBL_FORAL_GUI_LINEAS = [
    { terr: 'Guipúzcoa', per: 'Mensual', texto: '25 de cada mes (31 ene)', fechas: OBL_FORAL_GUI_MENSUAL },
    { terr: 'Guipúzcoa', per: 'Trimestral', textos: ['25 abr', '25 jul', '25 oct', '31 ene'],
      fechas: [{ mes: 4, dia: 25 }, { mes: 7, dia: 25 }, { mes: 10, dia: 25 }, { mes: 1, dia: 31 }] }
];
// Navarra: los resúmenes anuales de retenciones 180 y 193 se presentan hasta el 5 de febrero
const OBL_FORAL_NAV_5FEB = [{ terr: 'Navarra', per: 'Anual', textos: ['5 feb'], fechas: [{ mes: 2, dia: 5 }] }];
// Bizkaia y Guipúzcoa: el 322 (IVA de grupo) mensual vence el 25 de cada mes, no el 30
const OBL_FORAL_BIZ_GUI_25 = [{ terrs: ['Guipúzcoa', 'Bizkaia'], per: 'Mensual', texto: '25 de cada mes',
    fechas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ mes: m, dia: 25 })) }];
const OBL_VENC_FORAL = {
    '115': OBL_FORAL_GUI_LINEAS,
    '123': OBL_FORAL_GUI_LINEAS,
    '349': OBL_FORAL_GUI_LINEAS,
    '180': OBL_FORAL_NAV_5FEB,
    '193': OBL_FORAL_NAV_5FEB,
    '322': OBL_FORAL_BIZ_GUI_25
};

// Pestaña de destino de cada caja de la Visión general (tareas generales no navega)
const VIS_KPI_DESTINOS = {
    contratos: 'contratoscf',
    contabilidades: 'contabilidad',
    precierres: 'precierres',
    cierres: 'cierres',
    libros: 'libros',
    cuentas: 'cuentas',
    rentas: 'rentas',
    expedientes: 'expedientes',
    casos: 'casos'
};
const CONTADORES = ['contratos', 'contabilidades', 'contabVencidas', 'buzon', 'precierres', 'precVencidos', 'cierres', 'cierVencidos', 'libros', 'librosVencidos', 'cuentas', 'cuentasVencidas', 'rentas', 'expedientes', 'casos', 'tareas', 'oportunidades', 'total'];

// Columnas de visión por usuarios que navegan a su pestaña al pinchar el número
// (las que no tienen tab se muestran sin enlace)
const COLS_NAV = [
    { campo: 'contabilidades', tab: 'contabilidad' },
    { campo: 'buzon', tab: null },
    { campo: 'agregador', tab: null },
    { campo: 'precierres', tab: 'precierres' },
    { campo: 'cierres', tab: 'cierres' },
    { campo: 'libros', tab: 'libros' },
    { campo: 'cuentas', tab: 'cuentas' },
    { campo: 'rentas', tab: 'rentas' },
    { campo: 'expedientes', tab: 'expedientes' },
    { campo: 'casos', tab: 'casos' },
    { campo: 'oportunidades', tab: null }
];

/**
 * Área Contable y Fiscal: registros en estado abierto por usuario propietario,
 * agrupados por empresa titular y departamento asignado de la ficha de usuario.
 */
export default class AreaContableFiscal extends NavigationMixin(LightningElement) {

    @track loading = false;
    @track error = null;
    @track datos = [];

    // Submenús: Mi panel / Área Contable y Fiscal, y sus pestañas
    @track menuActivo = 'operativa';
    @track opTabActiva = 'misituacion';
    @track balTabActiva = 'contabilidad';

    // Filtros (por defecto: cuatro empresas titulares y departamentos
    // Administración y Fiscal y Contable)
    @track filtroEmpresas = [...VIS_EMPRESAS_DEFECTO];
    @track filtroDepartamentos = [...VIS_DEPARTAMENTOS_DEFECTO];
    @track filtroActivo = '';
    @track showEmpresaDropdown = false;
    @track showDeptoDropdown = false;

    // Mi panel es la pestaña inicial. El arranque va en dos fases: primero la
    // llamada rápida con lo que necesita Detalle (mis contadores, vencimientos
    // y mis tareas) y, sin bloquear el pintado, el resumen de todos los
    // usuarios llega en segundo plano para la visión por usuarios
    connectedCallback() {
        this.cargarInicio();
        this.aplicarNavegacionInicial();
    }

    // Navegación pedida por c/acfInicio (el inicio rápido) al importar este
    // componente: abre directamente el menú o la pestaña que el usuario pinchó
    @api navegacionInicial;

    aplicarNavegacionInicial() {
        // Sin navegación del inicio rápido, la URL puede pedir una vista (?acfMovs=...)
        const n = this.navegacionInicial || this.navegacionDesdeUrl();
        if (!n || !n.accion) return;
        if (n.accion === 'menu') {
            this.menuActivo = n.menu;
            if (n.menu === 'balances') this.cargarBalTab();
            if (n.menu === 'rrhh' && !this.rhCargado) this.cargarRh();
            if (n.menu === 'imputaciones') this.cargarImputaciones();
        } else if (n.accion === 'erp') {
            this.handleAccesoOperativa();
        } else if (n.accion === 'optab') {
            this.menuActivo = 'operativa';
            this.opTabActiva = n.tab;
            this.cargarOpTab();
        } else if (n.accion === 'tabUsuario') {
            this.abrirTabConUsuario(n.tab, n.usuario);
        } else if (n.accion === 'vtos') {
            this.abrirVtosConTipo(n.tipo || '');
            this.vtoFechaFiltro = n.fecha || '';
        } else if (n.accion === 'senal') {
            this.abrirSenalamientos();
            this.senFechaFiltro = n.fecha || '';
        } else if (n.accion === 'movs') {
            // Vista de movimientos contables de Sage pedida desde otra pestaña del navegador
            this.menuActivo = 'rrhh';
            this.rhTab = 'cargatrabajo';
            this.abrirCtMovs(n.codigos || [], n.nombre || '');
        }
    }

    cargarInicio() {
        this.misLoading = true;
        this.misError = null;
        getInicioRapido()
            .then(res => {
                this.miResumen = (res && res.miResumen) || null;
                const v = res && res.vencimientos;
                this.vencDias = (v && v.dias) || [];
                this.vencSinPresentar = (v && v.sinPresentar) || 0;
                this.vencSenalPorDelante = (v && v.senalamientos) || 0;
                this.misTareas = (res && res.misTareas) || [];
                this.misTotal = (res && res.misTareasTotal) || 0;
                this.misOrigenesSrv = (res && res.misTareasOrigenes) || [];
                this.misCompletas = this.misTareas.length >= this.misTotal;
                this.misCargado = true;
                this.tabTotales = {
                    expedientes: (res && res.tabExpedientes) || 0,
                    oportunidades: (res && res.tabOportunidades) || 0,
                    leads: (res && res.tabLeads) || 0,
                    casos: (res && res.tabCasos) || 0,
                    tareas: (res && res.tabTareas) || 0,
                    vtos: (res && res.tabVtos) || 0,
                    senalamientos: (res && res.tabSenalamientos) || 0,
                    ausencias: (res && res.tabAusencias) || 0,
                    teletrabajo: (res && res.tabTeletrabajo) || 0
                };
                this.notifPendientes = (res && res.notifPendientes) || 0;
                this.incidAbiertas = (res && res.incidAbiertas) || 0;
            })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
        // El resumen de todos los usuarios (Visión general) NO se carga aquí:
        // viajaría en la misma petición que la llamada rápida y Detalle
        // esperaría a la lenta. Se carga al entrar en Área Contable y Fiscal.
    }

    // ===== Submenús =====
    get claseMenuOperativa() {
        return this.menuActivo === 'operativa' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get claseMenuBalances() {
        return this.menuActivo === 'balances' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get claseMenuRrhh() {
        return this.menuActivo === 'rrhh' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get claseMenuImputaciones() {
        return this.menuActivo === 'imputaciones' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get esImputaciones() { return this.menuActivo === 'imputaciones'; }
    // Área Marketing: pestaña a la derecha del Área Contable y Fiscal, todavía sin contenido
    get claseMenuMarketing() {
        return this.menuActivo === 'marketing' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get esMarketing() { return this.menuActivo === 'marketing'; }
    // Onboarding y Offboarding: pestañas del Área RR.HH todavía sin contenido
    get claseMenuOnboarding() {
        return this.menuActivo === 'onboarding' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get claseMenuOffboarding() {
        return this.menuActivo === 'offboarding' ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get esOnboarding() { return this.menuActivo === 'onboarding'; }
    get esOffboarding() { return this.menuActivo === 'offboarding'; }

    // Botón verde de la cabecera: abre la Operativa contable
    handleAccesoOperativa() {
        this.menuActivo = 'erp';
        this.cargarOpeTab();
    }

    // Subpestañas de Análisis Imputaciones
    @track imputTab = 'incidencias';
    get esImputIncidencias() { return this.imputTab === 'incidencias'; }
    get esImputPendientes() { return this.imputTab === 'pendientes'; }
    // Las dos subpestañas llevan su total entre paréntesis y van en rojo
    // claro con registros (verde claro a cero), como las pestañas de Inicio
    // y del Área Contable y Fiscal: Incidencias con las líneas del listado
    // (origen Otros sin validar en el tramo de fechas) y Pendiente con los
    // días sin imputar de todo el equipo. Hasta que llegan los datos, la
    // pestaña va sin contador ni color
    get imputIncTotal() { return this.rhIncData ? this.rhIncData.length : null; }
    get imputPendTotal() {
        return this.imputBase && this.imputBase.imputaciones ? this.rhImputTotalDias : null;
    }
    imputTabLabel(label, n) { return n == null ? label : label + ' (' + this.fmtNumber(n) + ')'; }
    imputTabCls(activa, n) {
        let extra = '';
        if (n != null) {
            if (activa) extra = n > 0 ? ' lm-subtab-active-rojo' : '';
            else extra = n > 0 ? ' lm-subtab-rojo' : ' lm-subtab-verde';
        }
        return (activa ? 'lm-subtab lm-subtab-active' : 'lm-subtab') + extra;
    }
    get imputTabIncLabel() { return this.imputTabLabel('Incidencias imputaciones', this.imputIncTotal); }
    get imputTabPendLabel() { return this.imputTabLabel('Pendiente imputaciones', this.imputPendTotal); }
    get imputTabIncCls() { return this.imputTabCls(this.esImputIncidencias, this.imputIncTotal); }
    get imputTabPendCls() { return this.imputTabCls(this.esImputPendientes, this.imputPendTotal); }
    handleImputTab(e) {
        this.imputTab = e.currentTarget.dataset.tab;
        // Al cambiar de subpestaña a mano, los botones de volver desaparecen
        this.rhIncDesdeRrhh = false;
        this.pendVolverRrhh = false;
        this.cargarImputaciones();
    }

    // Al entrar en Análisis Imputaciones se cargan las dos listas, no solo
    // la de la subpestaña activa: sus totales van en las subpestañas
    cargarImputaciones() {
        if (!this.rhIncData && !this.rhIncLoading) this.cargarRhInc();
        if (!this.imputBase && !this.imputPendLoading) this.cargarImputPend();
    }

    // La pestaña Análisis Imputaciones es pública: la subpestaña de pendientes
    // carga su propio cuadro sin pasar por el panel del Área RR.HH
    @track imputPendData = null;
    @track imputPendLoading = false;
    @track imputPendError = null;

    cargarImputPend() {
        this.imputPendLoading = true;
        this.imputPendError = null;
        getImputacionesPendientes()
            .then(res => { this.imputPendData = res; })
            .catch(err => { this.imputPendError = this.reduceError(err); })
            .finally(() => { this.imputPendLoading = false; });
    }

    // Fuente del cuadro de pendientes: la carga propia o, si ya está en
    // memoria, el panel de RR.HH (ambos traen imputaciones e inicioVentana)
    get imputBase() { return this.imputPendData || this.rhData; }
    get hayImputPendError() { return !!this.imputPendError; }

    // El Área RR.HH solo se muestra a Directora RR.HH y administradores;
    // el Apex vuelve a comprobarlo en cada método de datos del panel
    @track rhAcceso = false;
    @wire(getAccesoRRHH)
    wiredAccesoRrhh({ data }) {
        this.rhAcceso = data === true;
        if (!this.rhAcceso && ['rrhh', 'onboarding', 'offboarding'].includes(this.menuActivo)) {
            this.menuActivo = 'operativa';
        }
    }
    get esOperativa() { return this.menuActivo === 'operativa'; }
    get esBalances() { return this.menuActivo === 'balances'; }
    get esRrhh() { return this.menuActivo === 'rrhh'; }

    handleMenu(e) {
        this.menuActivo = e.currentTarget.dataset.menu;
        // Al navegar por el menú, los botones de volver a RR.HH dejan de aplicar
        this.rhIncDesdeRrhh = false;
        this.ausVolverRrhh = false;
        this.telVolverRrhh = false;
        this.pendVolverRrhh = false;
        // Al entrar en el área se carga lo que pida la pestaña activa
        if (this.menuActivo === 'balances') this.cargarBalTab();
        if (this.menuActivo === 'rrhh' && !this.rhCargado) this.cargarRh();
        if (this.menuActivo === 'rrhh' && this.rhTab === 'cargatrabajo' && !this.ctCargado) this.cargarCt();
        if (this.menuActivo === 'imputaciones') this.cargarImputaciones();
        if (this.menuActivo === 'erp') this.cargarOpeTab();
    }

    get opTabs() {
        const tabs = [
            { key: 'misituacion', label: 'Detalle' },
            { key: 'vtos', label: 'Vencimientos legales' },
            { key: 'senalamientos', label: 'Señalamientos' },
            { key: 'expedientes', label: 'Expedientes' },
            { key: 'oportunidades', label: 'Oportunidades' },
            { key: 'leads', label: 'Leads' },
            { key: 'casos', label: 'Casos' },
            { key: 'tareas', label: 'Tareas' },
            { key: 'ausencias', label: 'Ausencias Equipo' },
            { key: 'teletrabajo', label: 'Teletrabajo' }
        ];
        return this.opTabsConContador(tabs, this.opTabActiva);
    }

    // Totales de las pestañas de Inicio con contador (llegan con la carga rápida)
    @track tabTotales = null;

    // Vencimientos legales, Expedientes, Oportunidades, Leads, Casos y Tareas llevan
    // el total entre paréntesis y van en rojo claro con registros (verde claro a
    // cero), como las pestañas del Área Contable y Fiscal; Vencimientos legales,
    // Señalamientos (los de hoy), Leads y Casos añaden además un triángulo de aviso
    // detrás del número
    opTabsConContador(tabs, activaKey) {
        const tot = this.tabTotales;
        const conAviso = ['vtos', 'senalamientos', 'leads', 'casos'];
        return tabs.map(t => {
            const activa = t.key === activaKey;
            let label = t.label;
            let extra = '';
            let aviso = false;
            if (tot && t.key in tot) {
                const n = tot[t.key];
                label = t.label + ' (' + this.fmtNumber(n) + ')';
                aviso = conAviso.includes(t.key) && n > 0;
                if (activa) extra = n > 0 ? ' lm-subtab-active-rojo' : '';
                else extra = n > 0 ? ' lm-subtab-rojo' : ' lm-subtab-verde';
            }
            return { ...t, label, aviso, cls: (activa ? 'lm-subtab lm-subtab-active' : 'lm-subtab') + extra };
        });
    }

    handleOpTab(e) {
        this.opTabActiva = e.currentTarget.dataset.tab;
        // Al navegar por las pestañas, los botones de volver a RR.HH desaparecen
        this.ausVolverRrhh = false;
        this.telVolverRrhh = false;
        this.cargarOpTab();
    }

    // Carga lo que necesite la pestaña activa de Mi panel
    cargarOpTab() {
        if (this.opTabActiva === 'expedientes' && !this.expCargado) this.cargarExp();
        if (this.opTabActiva === 'vtos' && !this.vtoCargado) this.cargarVto();
        if (this.opTabActiva === 'misituacion' && !this.misCargado) this.cargarMis();
        if (this.opTabActiva === 'senalamientos' && !this.senCargado) this.cargarSen();
        if (this.opTabActiva === 'ausencias' && !this.ausCargado) this.cargarAus();
        if (this.opTabActiva === 'oportunidades' && !this.opoCargado) this.cargarOpo();
        if (this.opTabActiva === 'leads' && !this.leadCargado) this.cargarLead();
        if (this.opTabActiva === 'casos' && !this.casCargado) this.cargarCas();
        if (this.opTabActiva === 'tareas' && !this.tarCargado) this.cargarTar();
        if (this.opTabActiva === 'teletrabajo' && !this.telCargado) this.cargarTel();
    }

    get esExpedientes() { return this.esOperativa && this.opTabActiva === 'expedientes'; }
    get esTareasEquipo() { return this.esOperativa && this.opTabActiva === 'tareas'; }
    get esVtos() { return this.esOperativa && this.opTabActiva === 'vtos'; }
    get esMiSituacion() { return this.esOperativa && this.opTabActiva === 'misituacion'; }
    get esSenalamientos() { return this.esOperativa && this.opTabActiva === 'senalamientos'; }
    get esAusencias() { return this.esOperativa && this.opTabActiva === 'ausencias'; }
    get esOportunidades() { return this.esOperativa && this.opTabActiva === 'oportunidades'; }
    get esLeads() { return this.esOperativa && this.opTabActiva === 'leads'; }
    get esCasos() { return this.esOperativa && this.opTabActiva === 'casos'; }
    get esTeletrabajo() { return this.esOperativa && this.opTabActiva === 'teletrabajo'; }
    get esOpPlaceholder() {
        return this.esOperativa
            && !['misituacion', 'vtos', 'senalamientos', 'expedientes', 'oportunidades', 'leads', 'ausencias', 'casos', 'tareas', 'teletrabajo']
                .includes(this.opTabActiva);
    }
    get opTabActivaLabel() {
        const t = this.opTabs.find(x => x.key === this.opTabActiva);
        return t ? t.label : '';
    }

    // ===== Pestañas de Área Contable y Fiscal =====
    get balTabs() {
        const tabs = [
            { key: 'contabilidad', label: 'Tareas recurrentes' },
            { key: 'buzon', label: 'Buzón contable' },
            { key: 'agregador', label: 'Agregador bancario' },
            { key: 'impuestos', label: 'Impuestos' },   // listado de Impuestos_global__c, pendiente de contenido
            { key: 'precierres', label: 'Precierres' },
            { key: 'cierres', label: 'Cierres' },
            { key: 'libros', label: 'Libros' },
            { key: 'cuentas', label: 'Cuentas' },
            { key: 'rentas', label: 'Rentas' },
            { key: 'contratoscf', label: 'Contratos' },
            { key: 'vision', label: 'Pendiente usuarios' }
        ];
        // Obligaciones tributarias va a la derecha de Contratos contables y fiscal
        tabs.splice(tabs.findIndex(t => t.key === 'contratoscf') + 1, 0,
            { key: 'obligaciones', label: 'Obligaciones tributarias' });
        // Pestañas con contador: total entre paréntesis, rojo claro con
        // registros (o verde claro a cero); marcadas con registros van en
        // rojo oscuro en vez del verde oscuro. El resto van neutras
        const CONTADOR = {
            contabilidad: this.contabData.length,
            buzon: this.buzData.length,
            agregador: 0, // de momento el agregador va con el contador a cero
            precierres: this.precPendN,
            cierres: this.ciePendN,
            libros: this.libPendN,
            cuentas: this.cuPendN,
            rentas: this.renPendN,
            obligaciones: this.oblIncTotal // null hasta que llegan los datos: sin contador ni color
        };
        return tabs.map(t => {
            let label = t.label;
            let extra = '';
            let aviso = false;
            const activa = t.key === this.balTabActiva;
            if (t.key in CONTADOR && CONTADOR[t.key] != null) {
                const n = CONTADOR[t.key];
                label = t.label + ' (' + this.fmtNumber(n) + ')';
                // Obligaciones tributarias: triángulo de aviso junto al contador si hay incidencias
                if (t.key === 'obligaciones' && n > 0) aviso = true;
                if (activa) extra = n > 0 ? ' lm-subtab-active-rojo' : '';
                else extra = n > 0 ? ' lm-subtab-rojo' : ' lm-subtab-verde';
            } else if (!activa) {
                extra = ' lm-subtab-neutra';
            }
            return {
                ...t,
                label,
                aviso,
                cls: (activa ? 'lm-subtab lm-subtab-active' : 'lm-subtab') + extra
            };
        });
    }

    handleBalTab(e) {
        this.balTabActiva = e.currentTarget.dataset.tab;
        this.cargarBalTab();
    }

    cargarBalTab() {
        if (this.balTabActiva === 'vision' && !this.visCargado && !this.loading) this.cargar();
        // Tareas recurrentes y Buzón se cargan siempre: sus totales van en las pestañas
        if (!this.contabCargado && !this.contabLoading) this.cargarContab();
        if (!this.buzCargado && !this.buzLoading) this.cargarBuz();
        // Precierres, cierres, libros y cuentas también: sus pendientes van en las pestañas
        if (!this.precCargado && !this.precLoading) this.cargarPrec();
        if (!this.cieCargado && !this.cieLoading) this.cargarCie();
        if (!this.libCargado && !this.libLoading) this.cargarLib();
        if (!this.cuCargado && !this.cuLoading) this.cargarCu();
        if (!this.renCargado && !this.renLoading) this.cargarRen();
        if (this.balTabActiva === 'contratoscf' && !this.ccCargado) this.cargarCc();
        // Obligaciones tributarias también: su total de incidencias va en la pestaña
        if (!this.oblCargado && !this.oblLoading) this.cargarObl();
    }

    // ===== Pestaña Obligaciones tributarias =====
    @track oblData = [];
    @track oblCargado = false;
    @track oblLoading = false;
    @track oblError = null;
    @track oblBusqueda = '';

    // Vuelve a pedir las obligaciones sin tocar oblLoading: la vista se queda
    // como está y se actualiza cuando llegan los datos
    cargarOblSilencioso() {
        getObligacionesTributarias()
            .then(res => { this.oblData = res || []; })
            .catch(err => { this.oblError = this.reduceError(err); });
    }

    cargarObl() {
        this.oblLoading = true;
        this.oblError = null;
        getObligacionesTributarias()
            .then(res => { this.oblData = res || []; this.oblCargado = true; })
            .catch(err => { this.oblError = this.reduceError(err); })
            .finally(() => { this.oblLoading = false; });
    }

    handleOblRefresh() { this.cargarObl(); }
    handleOblBusqueda(e) { this.oblBusqueda = e.detail.value; }
    get oblHasError() { return !!this.oblError; }
    get esObligaciones() { return this.esBalances && this.balTabActiva === 'obligaciones'; }
    get oblShow() { return this.esObligaciones && !this.oblLoading && !this.oblError; }

    // Incidencias de coherencia entre modelos (ver oblAvisosDe) de TODOS los contratos
    // cargados, sin filtros: total de avisos y nº de contratos con alguno. Cacheado por
    // los datos porque la pestaña lo pinta en cada render
    oblIncCache = null;
    oblIncCacheData = null;
    get oblIncidencias() {
        if (this.oblIncCache && this.oblIncCacheData === this.oblData) return this.oblIncCache;
        let total = 0;
        let contratos = 0;
        (this.oblData || []).forEach(c => {
            const n = this.oblAvisosDe(c).length;
            if (n) { total += n; contratos += 1; }
        });
        this.oblIncCache = { total, contratos };
        this.oblIncCacheData = this.oblData;
        return this.oblIncCache;
    }
    // Total para la pestaña: null hasta que llegan los datos (sin contador ni color)
    get oblIncTotal() { return this.oblCargado ? this.oblIncidencias.total : null; }
    // Resumen de la subpestaña Reglas incidencias
    get oblIncResumen() {
        const i = this.oblIncidencias;
        const n = (this.oblData || []).length;
        if (!i.total) return 'Sin incidencias en los ' + this.fmtNumber(n) + ' contratos';
        return this.fmtNumber(i.total) + (i.total === 1 ? ' incidencia' : ' incidencias')
            + ' en ' + this.fmtNumber(i.contratos) + ' de ' + this.fmtNumber(n) + ' contratos';
    }

    // Filtro de periodicidad de la cabecera y cliente marcado (ficha censal)
    @track oblPerFiltro = '';
    @track oblSelId = null;

    handleOblPerFiltro(e) {
        const k = e.currentTarget.dataset.per;
        this.oblPerFiltro = this.oblPerFiltro === k ? '' : k;
    }

    // Subpestañas de la pestaña: Total por empresas (la matriz), Total por asesores, Listado
    // impuestos (una línea por obligación), Catálogo modelos y Reglas incidencias
    @track oblVista = 'empresas';
    handleOblVista(e) {
        this.oblVista = e.currentTarget.dataset.vista;
        // El calendario necesita las opciones de los picklists
        if (this.oblVista !== 'empresas') this.cargarOblOpciones();
    }
    get esOblVistaEmpresas() { return this.oblVista === 'empresas'; }
    get esOblVistaCalendario() { return this.oblVista === 'calendario'; }
    get esOblVistaAsesores() { return this.oblVista === 'asesores'; }
    get esOblVistaInfo() { return this.oblVista === 'info'; }
    get esOblVistaImpuestos() { return this.oblVista === 'impuestos'; }
    get oblVistaImpCls() {
        return 'lm-subtab' + (this.esOblVistaImpuestos ? ' lm-subtab-active' : '');
    }
    get oblVistaEmpCls() {
        return 'lm-subtab' + (this.esOblVistaEmpresas ? ' lm-subtab-active' : '');
    }
    get oblVistaCalCls() {
        return 'lm-subtab' + (this.esOblVistaCalendario ? ' lm-subtab-active' : '');
    }
    get oblVistaAseCls() {
        return 'lm-subtab' + (this.esOblVistaAsesores ? ' lm-subtab-active' : '');
    }
    get oblVistaInfoCls() {
        return 'lm-subtab' + (this.esOblVistaInfo ? ' lm-subtab-active' : '');
    }

    // Total por asesores: la estructura de la matriz, pero dentro de cada
    // periodicidad una línea por asesor con los totales de cada columna; el
    // Ampliar de cada asesor abre el desglose de sus empresas
    @track oblAseExp = [];
    handleOblAseExp(e) {
        this.oblAseExp = this.alternar(this.oblAseExp, e.currentTarget.dataset.key);
    }
    // Cada sección ordena a los asesores por sus totales (por defecto); las secciones de
    // esta lista van por nombre, alternado con el botón de la propia sección
    @track oblAseOrden = [];
    handleOblAseOrden(e) {
        this.oblAseOrden = this.alternar(this.oblAseOrden, e.currentTarget.dataset.key);
    }

    get oblAsesoresFilas() {
        // Mismas periodicidades que las filas de totales (con Total SII y el
        // SII fuera de los mensuales)
        const defs = this.oblDefsPeriodicidad;
        // En esta vista cada obligación se atribuye a SU asesor responsable (el de la propia
        // obligación, no el del contrato) y solo cuentan las que presenta el despacho. Que la
        // obligación siga de alta y su contrato contable y fiscal abierto ya lo garantiza el
        // Apex, que no trae ni obligaciones de baja ni contratos cerrados
        const presentaDespacho = (m) => this.normalizar(m.presentacion) === 'despacho';
        const cuenta = (m, c, casa) => presentaDespacho(m) && this.oblAsePasaFiltros(m)
            && casa(this.normalizar(m.periodicidad), m.modelo, c);
        // Celdas y total de una lista de entradas { c, modelos }: en cada columna, cuántas
        // empresas tienen ese modelo entre los modelos de la entrada; el total de la fila es
        // la suma de todas las columnas, es decir, las obligaciones del apartado
        const contar = (entradas) => {
            let total = 0;
            const celdas = this.oblColumnas.map(col => {
                const valores = OBL_ALIAS[col] || [col];
                let n = 0;
                entradas.forEach(e => { if (e.modelos.some(m => valores.includes(m.modelo))) n++; });
                total += n;
                // Dos clases porque la misma celda sirve en la fila de sección y en la del asesor
                return { key: col, n: n || '',
                    clsTot: 'obl-td obl-total-td' + oblColVerdeCls(col),
                    clsAse: 'obl-td obl-ase-td' + oblColVerdeCls(col) };
            });
            return { celdas, total };
        };
        const out = [];
        defs.forEach(d => {
            // Modelos de la periodicidad que cuentan, por empresa (para la fila de la sección)
            // y repartidos por el asesor de cada obligación
            const porEmpresa = [];
            const porAsesor = new Map(); // asesor -> { nombre, empresas: Map(contratoId -> { c, modelos }) }
            this.oblMostradas.forEach(c => {
                const modelos = (c.modelos || []).filter(m => cuenta(m, c, d.casa));
                if (!modelos.length) return;
                porEmpresa.push({ c, modelos });
                modelos.forEach(m => {
                    const k = m.asesorId || 'SIN';
                    if (!porAsesor.has(k)) porAsesor.set(k, { nombre: m.asesor || 'Sin asesor', empresas: new Map() });
                    const a = porAsesor.get(k);
                    if (!a.empresas.has(c.contratoId)) a.empresas.set(c.contratoId, { c, modelos: [] });
                    a.empresas.get(c.contratoId).modelos.push(m);
                });
            });
            const sec = contar(porEmpresa);
            const porTotal = !this.oblAseOrden.includes(d.key);
            out.push({ key: 'sec·' + d.key, esSeccion: true,
                filaCls: 'obl-total-fila' + (d.amarilla ? ' obl-total-fila-amarilla' : ''),
                label: d.label, total: this.fmtNumber(sec.total), celdas: sec.celdas,
                ordKey: d.key, ordBtn: porTotal ? 'Ordenar por nombre' : 'Ordenar por totales' });
            // Por totales del asesor (por defecto) o, con el botón de la sección, por nombre
            const entradas = [];
            porAsesor.forEach((a, k) => {
                const lista = [...a.empresas.values()];
                entradas.push({ key: k, nombre: a.nombre, lista, ase: contar(lista) });
            });
            entradas.sort((a, b) => (porTotal
                ? (b.ase.total - a.ase.total) || a.nombre.localeCompare(b.nombre, 'es')
                : a.nombre.localeCompare(b.nombre, 'es')));
            entradas.forEach(({ key, nombre, lista, ase }) => {
                const expKey = d.key + '·' + key;
                const expandido = this.oblAseExp.includes(expKey);
                out.push({ key: 'ase·' + expKey, esAsesor: true, filaCls: 'acf-row obl-ase-fila',
                    nombre, total: this.fmtNumber(ase.total), celdas: ase.celdas,
                    expKey, btn: expandido ? 'Cerrar' : 'Ampliar' });
                if (!expandido) return;
                // Empresas del asesor, solo con los modelos que él lleva
                const filasCli = lista.map(({ c, modelos }) => {
                    const porModelo = new Map();
                    modelos.forEach(m => { if (!porModelo.has(m.modelo)) porModelo.set(m.modelo, m); });
                    const celdasCli = this.oblColumnas.map(col => {
                        const valores = OBL_ALIAS[col] || [col];
                        const m = valores.map(v => porModelo.get(v)).find(x => x);
                        const chip = m ? this.oblChipTerr(m) : null;
                        return {
                            key: col,
                            letra: chip ? chip.letra : '',
                            chipCls: chip ? chip.cls : '',
                            cls: 'obl-td' + oblColVerdeCls(col)
                        };
                    });
                    // Total de la empresa: los modelos del apartado que lleva este asesor en ella
                    const totalCli = celdasCli.filter(x => x.letra).length;
                    // Si el asesor responsable del contrato contable y fiscal no es este usuario,
                    // se indica junto a la empresa (las obligaciones son suyas, el contrato no)
                    const asesorContrato = (c.asesorId || 'SIN') !== key ? (c.asesor || 'sin asesor') : '';
                    return {
                        key: 'cli·' + expKey + '·' + c.contratoId,
                        esCliente: true,
                        filaCls: 'acf-row',
                        empresa: c.empresa,
                        empresaId: c.empresaId,
                        asesorContrato,
                        asesorContratoTitle: asesorContrato
                            ? 'El asesor responsable del contrato contable y fiscal es ' + asesorContrato : '',
                        grupo: String(c.grupo || '').trim() || 'Sin grupo',
                        totalN: totalCli,
                        total: this.fmtNumber(totalCli),
                        celdas: celdasCli
                    };
                });
                if (!this.oblAgrGrupo) { out.push(...filasCli); return; }
                // Con Agrupar por grupo pulsado, las empresas del asesor van por grupo
                // empresarial: una cabecera por grupo (alfabético, "Sin grupo" al final) con
                // su número de empresas y la suma de sus obligaciones, y debajo sus empresas
                const porGrupo = new Map();
                filasCli.forEach(f => {
                    if (!porGrupo.has(f.grupo)) porGrupo.set(f.grupo, []);
                    porGrupo.get(f.grupo).push(f);
                });
                const claves = [...porGrupo.keys()].sort((a, b) => {
                    if (a === 'Sin grupo') return 1;
                    if (b === 'Sin grupo') return -1;
                    return a.localeCompare(b, 'es');
                });
                claves.forEach(g => {
                    const miembros = porGrupo.get(g);
                    const suma = miembros.reduce((s, f) => s + f.totalN, 0);
                    out.push({
                        key: 'grp·' + expKey + '·' + g,
                        esGrupoAse: true,
                        filaCls: 'acf-row',
                        colspan: 2 + this.oblColumnas.length,
                        etiqueta: g,
                        tot: this.fmtNumber(miembros.length) + (miembros.length === 1 ? ' empresa · ' : ' empresas · ')
                            + this.fmtNumber(suma) + (suma === 1 ? ' obligación' : ' obligaciones')
                    });
                    out.push(...miembros);
                });
            });
        });
        return out;
    }

    // Calendario "bruto": todos los modelos de las columnas, tengan o no
    // registros, agrupados por su banda y con las periodicidades que admite
    // el picklist dependiente del objeto
    // Buscador por modelo y agrupación por territorio del calendario
    @track oblCalBusqueda = '';
    handleOblCalBusqueda(e) { this.oblCalBusqueda = e.detail.value; }
    @track oblCalAgrTerr = false;
    get oblCalAgrTerrCls() {
        return 'acf-btn-agrupar' + (this.oblCalAgrTerr ? ' acf-btn-agrupar-activo' : '');
    }
    handleOblCalAgrTerr() { this.oblCalAgrTerr = !this.oblCalAgrTerr; }

    // Botón "Modelos vencimientos diferentes": solo los modelos con dos
    // territorios, cuyos plazos son distintos en cada uno
    @track oblCalSoloMulti = false;
    get oblCalSoloMultiCls() {
        return 'acf-btn-agrupar' + (this.oblCalSoloMulti ? ' acf-btn-agrupar-activo' : '');
    }
    handleOblCalSoloMulti() { this.oblCalSoloMulti = !this.oblCalSoloMulti; }

    // Filtro por descripción: las descripciones distintas de los modelos del
    // calendario (varios modelos comparten descripción, p.ej. IVA individual)
    @track oblCalDescSel = '';
    handleOblCalDesc(e) { this.oblCalDescSel = e.target.value; }
    get oblCalDescOpciones() {
        const descs = new Set();
        OBL_BANDAS.forEach(b => b.modelos.forEach(col => {
            const d = OBL_DESCRIPCIONES[col];
            if (d) descs.add(d);
        }));
        const sel = this.oblCalDescSel;
        return [{ key: 'todas', value: '', label: '— Descripción —', sel: !sel }]
            .concat([...descs].sort((a, c) => a.localeCompare(c, 'es')).map(d => ({
                key: d, value: d, label: d, sel: sel === d
            })));
    }

    // Fechas concretas (mes y día) de un modelo y periodicidad, para la tira
    // de meses y el filtro por día. Los mensuales pisan todos los meses.
    oblVencFechasBrutas(valorPicklist, per) {
        const p = this.normalizar(per || '');
        const MESES12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        if (p.startsWith('mensual')) {
            // Día 30 de cada mes (28 en febrero) para el 303 y los grupos/IGIC
            if (['303', '322', '353', '410', '417', '716', '760'].includes(valorPicklist)) {
                return MESES12.map(m => ({ mes: m, dia: m === 2 ? 28 : 30 }));
            }
            if (valorPicklist === '330') {
                // Bizkaia y Guipúzcoa: el de julio (que vencería el 25 ago) se presenta hasta el 25 sep
                // y el de diciembre (25 ene) hasta el 31 ene
                return MESES12.map(m => (m === 1 ? { mes: 1, dia: 31 }
                    : m === 8 ? { mes: 9, dia: 25 }
                    : { mes: m, dia: 25 }));
            }
            // El 320 (Guipúzcoa) va el 25 de cada mes, pero en enero no se presenta
            if (valorPicklist === '320') return MESES12.filter(m => m !== 1).map(m => ({ mes: m, dia: 25 }));
            if (valorPicklist === 'F66') {
                // Navarra: el de junio (que vencería el 30 jul) se amplía al 5 ago y el de
                // julio (30 ago) al 21 sep
                return MESES12.map(m => (m === 1 ? { mes: 1, dia: 31 }
                    : m === 7 ? { mes: 8, dia: 5 }
                    : m === 8 ? { mes: 9, dia: 21 }
                    : { mes: m, dia: m === 2 ? 28 : 30 }));
            }
            if (valorPicklist.startsWith('Intrastat')) return MESES12.map(m => ({ mes: m, dia: 12 }));
            return MESES12.map(m => ({ mes: m, dia: 20 }));
        }
        if (p.includes('sii') || p.startsWith('diaria') || p.startsWith('semanal')) return [];
        return String(OBL_VENC_FECHAS[valorPicklist] || '').split(';')
            .map(v => v.trim().match(/^(\d{1,2})\/(\d{2})$/))
            .filter(Boolean)
            .map(mm => ({ mes: parseInt(mm[2], 10), dia: parseInt(mm[1], 10) }));
    }

    // Tira de meses: cada cajita es un día con el nº de modelos que vencen
    @track oblCalDiaSel = '';
    handleOblCalDia(e) {
        const k = e.currentTarget.dataset.key;
        this.oblCalDiaSel = this.oblCalDiaSel === k ? '' : k;
    }
    get oblCalMeses() {
        const depPer = (this.oblOpciones && this.oblOpciones.periodicidadesPorModelo) || {};
        const diasMes = new Map(); // mes -> Set de días con algún vencimiento
        OBL_BANDAS.forEach(b => b.modelos.forEach(col => {
            if (OBL_CAT_EXCLUIDOS.includes(col)) return;
            const valores = OBL_ALIAS[col] || [col];
            let pers = [...new Set(valores.flatMap(v => depPer[v] || []))];
            if (OBL_PER_FORZADA[col]) pers = OBL_PER_FORZADA[col];
            if (!pers.length && OBL_PER_SIN_PICKLIST[col]) pers = OBL_PER_SIN_PICKLIST[col];
            (pers.length ? pers : ['']).forEach(per => {
                this.oblVencFechasBrutas(valores[0], per).forEach(f => {
                    if (!diasMes.has(f.mes)) diasMes.set(f.mes, new Set());
                    diasMes.get(f.mes).add(f.dia);
                });
            });
            // Las fechas forales del modelo también cuentan en la tira
            (OBL_VENC_FORAL[col] || []).forEach(v => v.fechas.forEach(f => {
                if (!diasMes.has(f.mes)) diasMes.set(f.mes, new Set());
                diasMes.get(f.mes).add(f.dia);
            }));
        }));
        return OBL_MESES_NOMBRES.map((nombre, i) => {
            const mes = i + 1;
            const dias = [...(diasMes.get(mes) || [])].sort((a, b) => a - b).map(dia => {
                const k = mes + '·' + dia;
                return {
                    key: k,
                    dia,
                    cls: 'obl-cal-dia' + (this.oblCalDiaSel === k ? ' obl-cal-dia-sel' : '')
                };
            });
            return { key: 'mes' + mes, nombre, dias };
        });
    }
    // Rótulo del día marcado ("Vencen el 20 de abril")
    get oblCalDiaLabel() {
        if (!this.oblCalDiaSel) return '';
        const [m, d] = this.oblCalDiaSel.split('·').map(Number);
        return 'Vencen el ' + d + ' de ' + OBL_MESES_NOMBRES[m - 1];
    }
    get hayOblCalDia() { return !!this.oblCalDiaSel; }

    // Cajitas de una línea del calendario, con la fecha marcada resaltada
    oblCalPillsView(valorPicklist, per) {
        const p = this.normalizar(per || '');
        const textos = this.oblVencsBrutos(valorPicklist, per);
        const fechas = this.oblVencFechasBrutas(valorPicklist, per);
        const sel = this.oblCalDiaSel;
        // Mensuales y SII: un único texto que cubre todos sus meses
        if (p.startsWith('mensual') || p.includes('sii')
            || p.startsWith('diaria') || p.startsWith('semanal')) {
            const casa = !!sel && fechas.some(f => (f.mes + '·' + f.dia) === sel);
            return textos.map(t => ({ key: t, text: t,
                cls: 'obl-venc-pill' + (casa ? ' obl-venc-pill-sel' : '') }));
        }
        // Una cajita por fecha, emparejada con su mes y día
        return fechas.map((f, i) => ({
            key: (textos[i] || '') + '·' + i,
            text: textos[i] || '',
            cls: 'obl-venc-pill' + (sel === (f.mes + '·' + f.dia) ? ' obl-venc-pill-sel' : '')
        }));
    }

    // Nº de obligaciones de alta por modelo: con fecha de alta y sin baja
    // (el Apex ya descarta las de baja), de contratos activos sin fecha de baja
    get oblCalConteos() {
        const conteos = new Map();
        (this.oblData || []).forEach(c => {
            if (c.fechaBaja) return;
            (c.modelos || []).forEach(m => {
                if (!m.fechaAlta) return;
                conteos.set(m.modelo, (conteos.get(m.modelo) || 0) + 1);
            });
        });
        return conteos;
    }

    // Exportar el calendario a Excel (CSV con BOM y punto y coma) con la misma
    // estructura de la vista: bandas, y una fila por modelo y periodicidad
    handleOblCalExportar() {
        const sep = ';';
        const esc = v => {
            const s = String(v == null ? '' : v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const filas = [['Modelo', 'Descripción', 'De alta', 'Territorio',
            'Periodicidad', 'Vencimientos'].join(sep)];
        this.oblCalendarioFilas.forEach(c => {
            if (c.esBanda) { filas.push(esc(c.nombre)); return; }
            if (c.esGrupoTerr) { filas.push(esc(c.etiqueta)); return; }
            (c.grupos || []).forEach(g => {
                const lineas = g.hayLineas ? g.lineas : [{ perLabel: '', pills: [] }];
                lineas.forEach(l => {
                    filas.push([
                        esc(c.modelo), esc(c.desc), esc(c.activos), esc(g.terr),
                        esc(String(l.perLabel || '').replace(/:$/, '')),
                        esc(l.pills.map(p => p.text).join(' · '))
                    ].join(sep));
                });
            });
        });
        try {
            // LWS solo admite ciertos tipos MIME en los Blob (text/csv no pasa): va como
            // texto plano; la extensión .csv del atributo download basta para Excel
            const blob = new Blob(['\ufeff' + filas.join('\r\n')], { type: 'text/plain' });
            if (this.oblCalExportUrl) URL.revokeObjectURL(this.oblCalExportUrl);
            this.oblCalExportUrl = URL.createObjectURL(blob);
            // El clic se da sobre el enlace de la propia plantilla (LWS no lo
            // bloquea) en renderedCallback, cuando el nuevo href ya est\u00e1 pintado
            this.oblCalExportPendiente = true;
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo generar el archivo',
                message: String((e && e.message) || e), variant: 'error'
            }));
        }
    }
    @track oblCalExportUrl = null;
    oblCalExportPendiente = false;

    // Dispara la descarga del CSV del calendario en cuanto el enlace de la
    // plantilla lleva el href del blob reci\u00e9n generado
    renderedCallback() {
        if (!this.oblCalExportPendiente) return;
        this.oblCalExportPendiente = false;
        const a = this.template.querySelector('a.obl-cal-export-link');
        try {
            if (!a) throw new Error('No se encontr\u00f3 el enlace de descarga en la pantalla');
            a.click();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo descargar el archivo',
                message: String((e && e.message) || e), variant: 'error'
            }));
        }
    }

    // ===== Exportar el catálogo a PDF. El componente construye el cuerpo HTML con la misma
    // estructura y los mismos colores que la tabla (bandas, chips de territorio y periodicidad,
    // cajitas de vencimiento) a partir de las filas ya filtradas y agrupadas; Apex lo guarda en el
    // Documento personal del usuario (se sobrescribe en cada exportación) y la página Visualforce
    // CatalogoModelosPdf lo pinta como PDF con su CSS, en una pestaña nueva. El enlace "Abrir PDF"
    // queda en la barra por si el navegador bloquea la pestaña =====
    @track oblCalPdfGenerando = false;
    @track oblCalPdfUrl = '';
    get oblCalPdfBtnLabel() { return this.oblCalPdfGenerando ? 'Preparando PDF…' : 'Exportar a PDF'; }
    async handleOblCalExportarPdf() {
        if (this.oblCalPdfGenerando) return;
        this.oblCalPdfGenerando = true;
        this.oblCalPdfUrl = '';
        try {
            const docId = await guardarCatalogoHtml({ html: this.oblCalPdfHtml() });
            const url = '/apex/CatalogoModelosPdf?d=' + docId + '&t=' + Date.now();
            this.oblCalPdfUrl = url;
            window.open(url, '_blank');
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo preparar el PDF', message: this.reduceError(e), variant: 'error'
            }));
        } finally {
            this.oblCalPdfGenerando = false;
        }
    }
    // Cuerpo del PDF: los colores de la pantalla van en línea porque el CSS del componente no
    // llega a la página; la maqueta (fuentes, márgenes, cabecera) la pone la propia página
    oblCalPdfHtml() {
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const BANDA = { 'Renta': '#14395c', 'Sociedades': '#3d6a96', 'Retenciones': '#17a2b8',
            'IVA': '#0070d2', 'Intrastat': '#7f5fb0', 'Otros': '#6c757d' };
        const TERR = { 'obl-cal-terr-comun': ['#e9edf5', '#3b4a63'], 'obl-cal-terr-canarias': ['#fdf1c0', '#6b5900'],
            'obl-cal-terr-foral': ['#e3f5e6', '#1d6f42'], 'obl-cal-terr-navarra': ['#e5defa', '#5a3fc0'],
            'obl-cal-terr-bizkaia': ['#f7cfe3', '#7a0b47'], 'obl-cal-terr-alava': ['#fde6ef', '#8b1e4f'] };
        const CHIP = { 'obl-chip-m': ['#14395c', '#ffffff'], 'obl-chip-t': ['#17a2b8', '#ffffff'],
            'obl-chip-a': ['#cfe6f9', '#0b5cab'], 'obl-chip-3x': ['#f5d34d', '#4a3f00'],
            'obl-chip-d': ['#0070d2', '#ffffff'], 'obl-chip-o': ['#eef1f5', '#43506e'] };
        const porClase = (cls, mapa) => {
            const k = String(cls || '').split(/\s+/).find(x => mapa[x]);
            return k ? mapa[k] : null;
        };
        const chipTerr = t => {
            const c = porClase(t.terrCls, TERR);
            return c
                ? '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + ';">' + esc(t.terr) + '</span>'
                : '<span class="tx">' + esc(t.terr) + '</span>';
        };
        const chipPer = l => {
            if (!l.chipLetra) return '';
            const c = porClase(l.chipCls, CHIP) || CHIP['obl-chip-o'];
            return '<span class="chip" style="background:' + c[0] + ';color:' + c[1] + ';">' + esc(l.chipLetra) + '</span>';
        };
        const pill = p => {
            const cls = String(p.cls || '');
            const foral = cls.includes('obl-venc-pill-foral');
            const sel = cls.includes('obl-venc-pill-sel');
            const bg = sel ? (foral ? '#1d6f42' : '#0070d2') : (foral ? '#e3f5e6' : '#eef2f8');
            const co = sel ? '#ffffff' : (foral ? '#1d6f42' : '#16325c');
            return '<span class="pill" style="background:' + bg + ';color:' + co + ';">' + esc(p.text) + '</span>';
        };
        const linea = l => '<div class="linea">' + chipPer(l)
            + (l.perLabel ? '<span class="per">' + esc(l.perLabel) + '</span>' : '')
            + (l.hayPills ? l.pills.map(pill).join(' ') : '<span class="vacio">—</span>') + '</div>';
        const grupo = g => '<tr><td class="gterr">' + (g.terrs || []).map(chipTerr).join(' ') + '</td>'
            + '<td class="glin">' + (g.hayLineas ? g.lineas.map(linea).join('') : '<span class="vacio">—</span>') + '</td></tr>';
        let cuerpo = '';
        let nModelos = 0;
        this.oblCalendarioFilas.forEach(c => {
            if (c.esBanda) {
                cuerpo += '<tr class="banda"><td colspan="3" style="background:' + (BANDA[c.nombre] || '#6c757d') + ';">'
                    + esc(c.nombre) + '</td></tr>';
                return;
            }
            if (c.esGrupoTerr) {
                cuerpo += '<tr class="gterrfila"><td colspan="3">' + esc(c.etiqueta) + '</td></tr>';
                return;
            }
            nModelos++;
            cuerpo += '<tr class="modelo"><td class="cod">' + esc(c.modelo) + '</td><td class="desc">' + esc(c.desc) + '</td>'
                + '<td class="grupos"><table class="tg">' + (c.grupos || []).map(grupo).join('') + '</table></td></tr>';
        });
        // Subtítulo: fecha y los filtros que estaban aplicados al exportar
        const filtros = [];
        if (this.oblCalBusqueda) filtros.push('búsqueda "' + this.oblCalBusqueda + '"');
        if (this.oblCalDescSel) filtros.push('descripción "' + this.oblCalDescSel + '"');
        if (this.hayOblCalDia) filtros.push(String(this.oblCalDiaLabel || '').toLowerCase());
        if (this.oblCalSoloMulti) filtros.push('solo modelos con vencimientos diferentes por territorio');
        if (this.oblCalAgrTerr) filtros.push('agrupado por territorio');
        const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const sub = 'Generado el ' + fecha + ' · ' + this.fmtNumber(nModelos) + (nModelos === 1 ? ' modelo' : ' modelos')
            + (filtros.length ? ' · Filtros: ' + filtros.join('; ') : ' · Sin filtros');
        return '<div class="topbar"></div>'
            + '<div class="kicker">Área contable y fiscal · Obligaciones tributarias</div>'
            + '<div class="title">Catálogo de modelos</div>'
            + '<div class="sub">' + esc(sub) + '</div>'
            + '<table class="cat"><thead><tr><th>Modelo</th><th>Descripción</th><th>Territorio · Periodicidad y vencimiento</th></tr></thead>'
            + '<tbody>' + cuerpo + '</tbody></table>';
    }

    // ===== Exportar las Reglas incidencias a PDF: mismo mecanismo que el catálogo (Documento
    // personal del usuario + página Visualforce ReglasIncidenciasPdf, en vertical). El contenido
    // es el de la propia pestaña, leído de la plantilla, con el resumen de incidencias delante =====
    @track oblInfoPdfGenerando = false;
    @track oblInfoPdfUrl = '';
    get oblInfoPdfBtnLabel() { return this.oblInfoPdfGenerando ? 'Preparando PDF…' : 'Exportar a PDF'; }
    async handleOblInfoExportarPdf() {
        if (this.oblInfoPdfGenerando) return;
        this.oblInfoPdfGenerando = true;
        this.oblInfoPdfUrl = '';
        try {
            const docId = await guardarHtmlPdf({ html: this.oblInfoPdfHtml(), tipo: 'Reglas_Incidencias' });
            const url = '/apex/ReglasIncidenciasPdf?d=' + docId + '&t=' + Date.now();
            this.oblInfoPdfUrl = url;
            window.open(url, '_blank');
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo preparar el PDF', message: this.reduceError(e), variant: 'error'
            }));
        } finally {
            this.oblInfoPdfGenerando = false;
        }
    }
    // Cuerpo del PDF de las reglas: los bloques tal y como están en la pantalla (la página pone el
    // CSS), sin los atributos de ámbito que LWC añade a cada etiqueta
    oblInfoPdfHtml() {
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const cont = this.template.querySelector('.obl-info-bloques');
        if (!cont) throw new Error('No se encontró el contenido de las reglas en la pantalla');
        const bloques = String(cont.innerHTML || '').replace(/\s+c-[a-z0-9_-]+(?:="[^"]*")?/g, '');
        const resumenSub = this.template.querySelector('.obl-info-resumen-sub');
        const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        return '<div class="topbar"></div>'
            + '<div class="kicker">Área contable y fiscal · Obligaciones tributarias</div>'
            + '<div class="title">Reglas de incidencias</div>'
            + '<div class="sub">' + esc('Generado el ' + fecha + ' · Qué se comprueba en cada contrato contable y fiscal para marcar una incidencia') + '</div>'
            + '<div class="resumen"><b>' + esc(this.oblIncResumen) + '</b>'
            + esc(resumenSub ? resumenSub.textContent : '') + '</div>'
            + '<div class="obl-info-bloques">' + bloques + '</div>';
    }

    get oblCalendarioFilas() {
        const depPer = (this.oblOpciones && this.oblOpciones.periodicidadesPorModelo) || {};
        const conteos = this.oblCalConteos;
        const t = this.normalizar(this.oblCalBusqueda);
        const out = [];
        OBL_BANDAS.forEach(b => {
            // Modelos de la banda que pasan el buscador (por código o descripción)
            const modelos = [];
            b.modelos.forEach(col => {
                if (OBL_CAT_EXCLUIDOS.includes(col)) return;
                const desc = OBL_DESCRIPCIONES[col] || '';
                if (this.oblCalDescSel && desc !== this.oblCalDescSel) return;
                if (t && !this.normalizar(col).includes(t)
                    && !this.normalizar(desc).includes(t)) return;
                const valores = OBL_ALIAS[col] || [col];
                let pers = [...new Set(valores.flatMap(v => depPer[v] || []))];
                // Modelos sin dependencia configurada con periodicidad conocida
                if (OBL_PER_FORZADA[col]) pers = OBL_PER_FORZADA[col];
                if (!pers.length && OBL_PER_SIN_PICKLIST[col]) pers = OBL_PER_SIN_PICKLIST[col];
                const lineas = (pers.length ? pers : ['']).map(per => {
                    const chip = per ? this.oblChip(per, col) : null;
                    const pills = this.oblCalPillsView(valores[0], per);
                    return {
                        key: col + '·' + (per || 'unica'),
                        per: per || '—',
                        perLabel: per ? per + ':' : '',
                        chipLetra: chip ? chip.letra : '',
                        chipCls: chip ? chip.cls : '',
                        pills,
                        hayPills: pills.length > 0,
                        // La línea casa con el día marcado si alguna cajita lo lleva
                        casaDia: pills.some(x => x.cls.includes('obl-venc-pill-sel'))
                    };
                }).filter(l => l.hayPills || l.per !== '—');
                // Líneas forales agrupadas por su territorio (vencimientos
                // distintos del común); las que declaran periodicidad solo
                // salen si el picklist la admite para el modelo
                const foralPorTerr = new Map();
                const foralTerrs = new Map(); // clave -> territorios de la línea
                (OBL_VENC_FORAL[col] || []).forEach((v, i) => {
                    if (v.per && pers.length && !pers.includes(v.per)) return;
                    const sel = this.oblCalDiaSel;
                    const textos = v.textos || [v.texto];
                    const pills = textos.map((tx, j) => {
                        // Con lista de textos, cada cajita casa con su propia fecha;
                        // con texto único, con cualquiera de las fechas de la línea
                        const casaPill = v.textos
                            ? !!sel && (v.fechas[j].mes + '·' + v.fechas[j].dia) === sel
                            : !!sel && v.fechas.some(f => (f.mes + '·' + f.dia) === sel);
                        return { key: tx + '·' + j, text: tx,
                            cls: 'obl-venc-pill obl-venc-pill-foral' + (casaPill ? ' obl-venc-pill-sel' : '') };
                    });
                    const chip = v.per ? this.oblChip(v.per, col) : null;
                    // Una línea puede ser de varios territorios (terrs): se agrupan juntos
                    const terrsLinea = v.terrs || [v.terr];
                    const claveTerr = terrsLinea.join(' · ');
                    if (!foralPorTerr.has(claveTerr)) { foralPorTerr.set(claveTerr, []); foralTerrs.set(claveTerr, terrsLinea); }
                    foralPorTerr.get(claveTerr).push({
                        key: col + '·foral' + i,
                        per: v.per || '—',
                        perLabel: v.per ? v.per + ':' : '',
                        chipLetra: chip ? chip.letra : '',
                        chipCls: chip ? chip.cls : '',
                        pills,
                        hayPills: true,
                        casaDia: pills.some(p => p.cls.includes('obl-venc-pill-sel'))
                    });
                });
                const territorio = OBL_TERRITORIO_MODELO[col] || 'Territorio Común';
                // Cada territorio con su chip de fondo claro (el mismo color para el mismo nombre)
                const terrCls = {
                    'Territorio Común': 'obl-cal-terr obl-cal-terr-comun',
                    'Canarias': 'obl-cal-terr obl-cal-terr-canarias',
                    'Foral': 'obl-cal-terr obl-cal-terr-foral',
                    'Guipúzcoa': 'obl-cal-terr obl-cal-terr-foral',
                    'Bizkaia': 'obl-cal-terr obl-cal-terr-bizkaia',
                    'Álava': 'obl-cal-terr obl-cal-terr-alava',
                    'Navarra': 'obl-cal-terr obl-cal-terr-navarra'
                };
                const chipTerr = terr => ({ key: col + '·chip·' + terr, terr, terrCls: terrCls[terr] || '' });
                // Territorios que comparten los plazos del principal: mismos chips, mismas líneas
                const mismosPlazos = (OBL_TERRITORIOS_MISMOS_PLAZOS[col] || []).filter(x => x !== territorio);
                const terrsPrincipal = [territorio, ...mismosPlazos];
                // Un grupo por juego de plazos: sus chips de territorio a la izquierda, centrados
                // a la altura de sus líneas de periodicidad y vencimiento
                const grupos = [{
                    key: col + '·' + territorio, terr: terrsPrincipal.join(' · '),
                    terrs: terrsPrincipal.map(chipTerr), lineas, hayLineas: lineas.length > 0
                }];
                foralPorTerr.forEach((ls, clave) => grupos.push({
                    key: col + '·' + clave, terr: clave, terrs: (foralTerrs.get(clave) || [clave]).map(chipTerr),
                    lineas: ls, hayLineas: ls.length > 0
                }));
                // Todos los territorios en los que vive el modelo, para el agrupado por territorio
                const territorios = [...terrsPrincipal, ...[...foralPorTerr.keys()].flatMap(k => foralTerrs.get(k) || [k])];
                // Con un día marcado, solo los modelos que vencen ese día
                if (this.oblCalDiaSel
                    && !grupos.some(g => g.lineas.some(l => l.casaDia))) return;
                // Con el botón de vencimientos diferentes, solo los modelos que
                // viven en dos territorios (sus plazos cambian según el territorio)
                if (this.oblCalSoloMulti && grupos.length < 2) return;
                // Obligaciones de alta del modelo, sumando sus alias del picklist
                const activos = valores.reduce((s, v) => s + (conteos.get(v) || 0), 0);
                modelos.push({
                    key: col,
                    esBanda: false,
                    modelo: col,
                    desc,
                    territorio,
                    territorios,
                    grupos,
                    activos,
                });
            });
            if (!modelos.length) return;
            out.push({ key: 'banda·' + b.nombre, esBanda: true, nombre: b.nombre,
                filaCls: 'acf-row', bandCls: b.cls + ' obl-cal-banda' });
            // Todas las filas de modelo con el mismo fondo: sin alternas ni resaltado de los
            // modelos que viven en dos territorios (se quitó a petición del usuario)
            const alt = (m) => ({ ...m, filaCls: 'acf-row' });
            if (!this.oblCalAgrTerr) {
                modelos.forEach(m => out.push(alt(m)));
                return;
            }
            // Agrupado por territorio dentro del apartado: un modelo que vive en varios
            // territorios sale en cada uno de ellos
            const grupos = new Map();
            modelos.forEach(m => (m.territorios || [m.territorio]).forEach(terr => {
                if (!grupos.has(terr)) grupos.set(terr, []);
                grupos.get(terr).push(m);
            }));
            [...grupos.keys()].sort((a, c) => a.localeCompare(c, 'es')).forEach(terr => {
                const lista = grupos.get(terr);
                out.push({ key: b.nombre + '·terr·' + terr, esGrupoTerr: true,
                    filaCls: 'acf-row',
                    etiqueta: terr + ' (' + this.fmtNumber(lista.length) + ')' });
                lista.forEach(m => out.push({ ...alt(m), key: m.key + '·' + terr }));
            });
        });
        return out;
    }

    // Departamento laboral (modelos 111, 216, 190, 296 y 345) o fiscal (el resto)
    @track oblDeptoFiltro = '';
    handleOblDepto(e) {
        const k = e.currentTarget.dataset.depto;
        this.oblDeptoFiltro = this.oblDeptoFiltro === k ? '' : k;
    }
    get oblDeptoLabCls() {
        return 'acf-btn-mios' + (this.oblDeptoFiltro === 'laboral' ? ' acf-btn-mios-activo' : '');
    }
    get oblDeptoFisCls() {
        return 'acf-btn-mios' + (this.oblDeptoFiltro === 'fiscal' ? ' acf-btn-mios-activo' : '');
    }

    // Pinchar el modelo en la cabecera deja solo los clientes que lo tienen
    @track oblModeloFiltro = '';
    handleOblModeloFiltro(e) {
        const m = e.currentTarget.dataset.modelo;
        this.oblModeloFiltro = this.oblModeloFiltro === m ? '' : m;
    }

    // Filtro de modelos con selección múltiple y modo incluir/excluir
    @track oblModelosSel = [];
    @track oblModelosModo = 'incluir';
    @track showOblModDd = false;

    get oblModOptionsView() {
        return this.oblColumnas.map(m => ({
            value: m,
            label: OBL_DESCRIPCIONES[m] ? m + ' · ' + OBL_DESCRIPCIONES[m] : m,
            optionClass: this.oblModelosSel.includes(m)
                ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
        }));
    }
    get oblModTriggerLabel() {
        if (!this.oblModelosSel.length) return 'Modelos';
        const base = this.oblModelosSel.length === 1
            ? this.oblModelosSel[0]
            : this.oblModelosSel.length + ' modelos';
        return this.oblModelosModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    get oblModModoIncCls() {
        return 'ts-ms-link' + (this.oblModelosModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get oblModModoExcCls() {
        return 'ts-ms-link' + (this.oblModelosModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }
    toggleOblModDd() { this.showOblModDd = !this.showOblModDd; }
    closeOblModDd() { this.showOblModDd = false; }
    handleOblModToggle(e) {
        this.oblModelosSel = this.alternar(this.oblModelosSel, e.currentTarget.dataset.value);
    }
    handleOblModTodos() { this.oblModelosSel = []; }
    handleOblModModo(e) { this.oblModelosModo = e.currentTarget.dataset.modo; }
    handleOblSel(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        this.oblSelId = this.oblSelId === id ? null : id;
        // La ficha necesita las opciones de los picklists para editar en línea
        if (this.oblSelId) this.cargarOblOpciones();
        // La cabecera de la ficha se trae siempre a pantalla: el sticky no
        // aplica dentro del contenedor de la página y quedaba fuera de vista
        if (this.oblSelId) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                const ficha = this.template.querySelector('.obl-ficha');
                if (!ficha) return;
                const r = ficha.getBoundingClientRect();
                // Solo se desplaza si la cabecera no está ya visible
                if (r.top < 0 || r.top > window.innerHeight - 100) {
                    ficha.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 120);
        }
    }

    // Agrupar la matriz por el asesor responsable o por la empresa titular
    // gestión del contrato (una agrupación excluye a la otra)
    @track oblAgrAsesor = false;
    // En amarillo claro, como los botones "Mis ..."
    get oblAgrAsesorCls() {
        return 'acf-btn-mios acf-btn-vis-mios' + (this.oblAgrAsesor ? ' acf-btn-vis-mios-activo' : '');
    }
    handleOblAgrAsesor() {
        this.oblAgrAsesor = !this.oblAgrAsesor;
        if (this.oblAgrAsesor) { this.oblAgrTitular = false; this.oblAgrTipoTit = false; this.oblAgrGrupo = false; this.oblAgrTerrFis = false; this.oblAgrConsol = false; }
    }
    @track oblAgrTitular = false;
    get oblAgrTitularCls() { return 'acf-btn-agrupar' + (this.oblAgrTitular ? ' acf-btn-agrupar-activo' : ''); }
    handleOblAgrTitular() {
        this.oblAgrTitular = !this.oblAgrTitular;
        if (this.oblAgrTitular) { this.oblAgrAsesor = false; this.oblAgrTipoTit = false; this.oblAgrGrupo = false; this.oblAgrTerrFis = false; this.oblAgrConsol = false; }
    }
    // Agrupar por el tipo de titular de la empresa (el botón se llama
    // Agrupar por tipo de empresa)
    @track oblAgrTipoTit = false;
    get oblAgrTipoTitCls() { return 'acf-btn-agrupar' + (this.oblAgrTipoTit ? ' acf-btn-agrupar-activo' : ''); }
    handleOblAgrTipoTit() {
        this.oblAgrTipoTit = !this.oblAgrTipoTit;
        if (this.oblAgrTipoTit) { this.oblAgrAsesor = false; this.oblAgrTitular = false; this.oblAgrGrupo = false; this.oblAgrTerrFis = false; this.oblAgrConsol = false; }
    }
    // Agrupar por el grupo empresarial del contrato
    @track oblAgrGrupo = false;
    get oblAgrGrupoCls() { return 'acf-btn-agrupar' + (this.oblAgrGrupo ? ' acf-btn-agrupar-activo' : ''); }
    handleOblAgrGrupo() {
        this.oblAgrGrupo = !this.oblAgrGrupo;
        if (this.oblAgrGrupo) { this.oblAgrAsesor = false; this.oblAgrTitular = false; this.oblAgrTipoTit = false; this.oblAgrTerrFis = false; this.oblAgrConsol = false; }
    }
    // Agrupar por el territorio fiscal del contrato contable y fiscal
    @track oblAgrTerrFis = false;
    get oblAgrTerrFisCls() { return 'acf-btn-agrupar' + (this.oblAgrTerrFis ? ' acf-btn-agrupar-activo' : ''); }
    handleOblAgrTerrFis() {
        this.oblAgrTerrFis = !this.oblAgrTerrFis;
        if (this.oblAgrTerrFis) { this.oblAgrAsesor = false; this.oblAgrTitular = false; this.oblAgrTipoTit = false; this.oblAgrGrupo = false; this.oblAgrConsol = false; }
    }
    // Consolidación sociedades: agrupar por el campo Consolidación fiscal del contrato (Sí / No / sin informar)
    @track oblAgrConsol = false;
    get oblAgrConsolCls() { return 'acf-btn-agrupar' + (this.oblAgrConsol ? ' acf-btn-agrupar-activo' : ''); }
    handleOblAgrConsol() {
        this.oblAgrConsol = !this.oblAgrConsol;
        if (this.oblAgrConsol) { this.oblAgrAsesor = false; this.oblAgrTitular = false; this.oblAgrTipoTit = false; this.oblAgrGrupo = false; this.oblAgrTerrFis = false; }
    }
    oblEtiquetaConsol(c) {
        const v = this.normalizar(c.consolidacionFiscal);
        if (v === 'si') return 'Consolidación fiscal: Sí';
        if (v === 'no') return 'Consolidación fiscal: No';
        return 'Consolidación fiscal sin informar';
    }

    // Filtros generales activos (los de la fila de Total por empresas, que también actúan en Total
    // por asesores y Listado impuestos); el censo y el buscador no cuentan porque siguen a la vista
    get oblFiltrosGeneralesN() {
        return (this.oblMios ? 1 : 0) + (this.oblDeptoFiltro ? 1 : 0) + (this.oblPerFiltro ? 1 : 0)
            + (this.oblAsesoresSel.length ? 1 : 0) + (this.oblTitularesSel.length ? 1 : 0)
            + (this.oblTerritoriosSel.length ? 1 : 0) + (this.oblTipoTitSel.length ? 1 : 0)
            + (this.oblModelosSel.length ? 1 : 0) + (this.oblModeloFiltro ? 1 : 0)
            + (this.oblTotSel ? 1 : 0) + (this.oblPresSel.length ? 1 : 0);
    }
    get hayOblFiltrosGenerales() { return this.oblFiltrosGeneralesN > 0; }

    // Limpiar: deja los filtros y botones como al llegar a la pestaña
    handleOblLimpiar() {
        this.oblBusqueda = '';
        this.oblMios = false;
        this.oblAsesoresSel = [];
        this.oblAsesoresModo = 'incluir';
        this.oblAseOblSel = [];
        this.oblAseOblModo = 'incluir';
        this.oblAseTitSel = [];
        this.oblAseTitModo = 'incluir';
        this.oblPresSel = [];
        this.oblPresModo = 'incluir';
        this.oblImpModSel = [];
        this.oblImpModModo = 'incluir';
        this.oblImpPresSel = [];
        this.oblImpPresModo = 'incluir';
        this.oblTitularesSel = [];
        this.oblTitularesModo = 'incluir';
        this.oblTerritoriosSel = [];
        this.oblTerritoriosModo = 'incluir';
        this.oblTipoTitSel = [];
        this.oblTipoTitModo = 'incluir';
        this.oblCensosSel = [];
        this.oblModelosSel = [];
        this.oblModelosModo = 'incluir';
        this.oblPerFiltro = '';
        this.oblModeloFiltro = '';
        this.oblTotSel = '';
        this.oblDeptoFiltro = '';
        this.oblAgrAsesor = false;
        this.oblAgrTitular = false;
        this.oblAgrTipoTit = false;
        this.oblAgrGrupo = false;
        this.oblAgrTerrFis = false;
        this.oblAgrConsol = false;
        this.oblCalBusqueda = '';
        this.oblCalAgrTerr = false;
        this.oblCalDiaSel = '';
    }

    // Mis contratos: solo los clientes donde soy el asesor responsable
    @track oblMios = false;
    get oblMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.oblMios ? ' acf-btn-vis-mios-activo' : ''); }
    handleOblMios() { this.oblMios = !this.oblMios; }

    // ===== Alta de una obligación tributaria nueva =====
    @track oblNuevaOpen = false;
    @track oblNuevaEmpresaId = null;
    @track oblNuevaModelo = '';
    @track oblNuevaPer = '';
    @track oblNuevaTerr = '';
    @track oblNuevaMod = '';
    @track oblNuevaFecha = null;
    @track oblNuevaPres = '';
    @track oblNuevaSoft = '';
    @track oblNuevaSaving = false;
    @track oblNuevaError = null;
    @track oblOpciones = null;

    // Con oblEditId informado el mismo modal edita en vez de dar de alta;
    // con la empresa fija (alta desde la ficha) el buscador de empresa se oculta
    @track oblEditId = null;
    @track oblNuevaEmpresaFija = false;

    // Alta desde la cabecera de la ficha: la empresa es la del cliente marcado
    handleOblNuevaDesdeFicha() {
        const c = this.oblSel;
        if (!c) return;
        this.handleOblNuevaOpen();
        this.oblNuevaEmpresaId = c.empresaId;
        this.oblNuevaEmpresaFija = true;
    }

    handleOblNuevaOpen() {
        this.oblEditId = null;
        this.oblNuevaEmpresaFija = false;
        this.oblNuevaEmpresaId = null;
        this.oblNuevaModelo = '';
        this.oblNuevaPer = '';
        this.oblNuevaTerr = '';
        this.oblNuevaMod = '';
        // La fecha de alta la tiene que informar el usuario, sin valor por defecto
        this.oblNuevaFecha = null;
        this.oblNuevaPres = '';
        this.oblNuevaSoft = '';
        this.oblNuevaExo = '';
        this.oblNuevaAsesor = '';
        this.oblNuevaAsesorNombre = '';
        this.oblNuevaError = null;
        this.oblNuevaSaving = false;
        this.oblNuevaOpen = true;
        this.cargarOblOpciones();
    }

    // Editar una obligación desde el número de modelo de la ficha
    handleOblEditar(e) {
        const id = e.currentTarget.dataset.id;
        const c = this.oblSel;
        const m = c ? (c.modelos || []).find(x => x.id === id) : null;
        if (!m) return;
        this.oblEditId = id;
        this.oblNuevaEmpresaId = c.empresaId;
        this.oblNuevaModelo = m.modelo || '';
        this.oblNuevaPer = m.periodicidad || '';
        this.oblNuevaTerr = m.territorio || '';
        this.oblNuevaMod = m.modalidad || '';
        this.oblNuevaFecha = m.fechaAlta || null;
        this.oblNuevaPres = m.presentacion || '';
        this.oblNuevaSoft = m.software || '';
        this.oblNuevaAsesor = m.asesorId || '';
        this.oblNuevaAsesorNombre = m.asesor || '';
        this.oblNuevaExo = m.exonerado || '';
        this.oblNuevaError = null;
        this.oblNuevaSaving = false;
        this.oblNuevaOpen = true;
        this.cargarOblOpciones();
    }

    // Asesor responsable de la obligación: usuarios activos; en edición se
    // conserva el actual aunque ya no esté activo
    @track oblNuevaAsesor = '';
    oblNuevaAsesorNombre = '';
    hOblNuevaAsesor(e) { this.oblNuevaAsesor = e.detail.value || ''; }
    // Exonerado (Sí / No): en SII, los modelos que exonera (347 y 390; 415 y 425 en Canarias)
    // deben ir marcados; vacío es "sin informar"
    @track oblNuevaExo = '';
    hOblNuevaExo(e) { this.oblNuevaExo = e.detail.value || ''; }
    get oblNuevaExonerados() {
        return [{ label: '— Sin informar —', value: '' }, ...this.oblOpcionesDe('exonerados')];
    }
    get oblNuevaAsesores() {
        const lista = ((this.oblOpciones && this.oblOpciones.asesores) || []).map(a => ({ ...a }));
        if (this.oblNuevaAsesor && !lista.some(a => a.value === this.oblNuevaAsesor)) {
            lista.unshift({ value: this.oblNuevaAsesor, label: this.oblNuevaAsesorNombre || 'Asesor actual' });
        }
        return [{ value: '', label: '— Sin asesor responsable —' }, ...lista];
    }

    cargarOblOpciones() {
        if (this.oblOpciones) return;
        getOpcionesObligacion()
            .then(res => { this.oblOpciones = res; })
            .catch(err => { this.oblNuevaError = this.reduceError(err); });
    }

    get oblEsEdicion() { return !!this.oblEditId; }
    get oblModalTitulo() {
        return this.oblEsEdicion ? 'Editar obligación tributaria' : 'Nueva obligación tributaria';
    }
    get oblOcultarEmpresa() { return this.oblEsEdicion || this.oblNuevaEmpresaFija; }
    handleOblNuevaClose() {
        if (this.oblNuevaSaving) return;
        this.oblNuevaOpen = false;
    }
    oblOpcionesDe(clave) {
        return ((this.oblOpciones && this.oblOpciones[clave]) || [])
            .map(v => ({ label: v, value: v }));
    }
    get oblNuevaModelos() { return this.oblOpcionesDe('modelos'); }
    // Periodicidad es un picklist dependiente del modelo: solo sus valores
    // válidos (si el modelo no tiene dependencias configuradas, se ofrecen todas)
    get oblNuevaPeriodicidades() {
        const mapa = (this.oblOpciones && this.oblOpciones.periodicidadesPorModelo) || null;
        if (!mapa || !this.oblNuevaModelo) return [];
        let validas = mapa[this.oblNuevaModelo] || [];
        if (!validas.length) validas = this.oblOpciones.periodicidades || [];
        // En edición se conserva la periodicidad grabada aunque ya no esté activa
        if (this.oblNuevaPer && !validas.includes(this.oblNuevaPer)) {
            return [...validas, this.oblNuevaPer].map(v => ({ label: v, value: v }));
        }
        return validas.map(v => ({ label: v, value: v }));
    }
    get oblNuevaPerDisabled() { return !this.oblNuevaPeriodicidades.length; }
    get oblNuevaTerritorios() { return this.oblOpcionesDe('territorios'); }
    // Modalidad es un picklist dependiente del modelo: solo sus valores válidos
    get oblNuevaModalidades() {
        const mapa = (this.oblOpciones && this.oblOpciones.modalidadesPorModelo) || null;
        if (!mapa || !this.oblNuevaModelo) return [];
        const validas = mapa[this.oblNuevaModelo] || [];
        // En edición se conserva la modalidad grabada aunque ya no esté activa
        if (this.oblNuevaMod && !validas.includes(this.oblNuevaMod)) {
            return [...validas, this.oblNuevaMod].map(v => ({ label: v, value: v }));
        }
        return validas.map(v => ({ label: v, value: v }));
    }
    get oblNuevaModDisabled() { return !this.oblNuevaModalidades.length; }
    // La modalidad solo es obligatoria si el modelo tiene modalidades dependientes
    get oblNuevaModRequerida() { return this.oblNuevaModalidades.length > 0; }
    hOblNuevaEmpresa(e) { this.oblNuevaEmpresaId = e.detail.recordId || null; }
    hOblNuevaModelo(e) {
        this.oblNuevaModelo = e.detail.value;
        // Al cambiar el modelo se descartan la modalidad y la periodicidad
        // si ya no son válidas para el modelo nuevo
        const op = this.oblOpciones || {};
        const modalidades = (op.modalidadesPorModelo || {})[this.oblNuevaModelo] || [];
        if (this.oblNuevaMod && !modalidades.includes(this.oblNuevaMod)) this.oblNuevaMod = '';
        let periodicidades = (op.periodicidadesPorModelo || {})[this.oblNuevaModelo] || [];
        if (!periodicidades.length) periodicidades = op.periodicidades || [];
        if (this.oblNuevaPer && !periodicidades.includes(this.oblNuevaPer)) this.oblNuevaPer = '';
    }
    hOblNuevaPer(e) { this.oblNuevaPer = e.detail.value; }
    hOblNuevaTerr(e) { this.oblNuevaTerr = e.detail.value; }
    hOblNuevaMod(e) { this.oblNuevaMod = e.detail.value; }
    hOblNuevaFecha(e) { this.oblNuevaFecha = e.detail.value || null; }
    hOblNuevaPres(e) { this.oblNuevaPres = e.detail.value; }
    hOblNuevaSoft(e) { this.oblNuevaSoft = e.detail.value; }
    get oblNuevaPresentaciones() { return this.oblOpcionesDe('presentaciones'); }
    get oblNuevaSoftwares() { return this.oblOpcionesDe('softwares'); }
    get hasOblNuevaError() { return !!this.oblNuevaError; }
    get oblNuevaGuardarLabel() { return this.oblNuevaSaving ? 'Guardando…' : 'Guardar'; }
    get oblNuevaGuardarDisabled() {
        return this.oblNuevaSaving || !this.oblNuevaModelo || !this.oblNuevaPer
            || !this.oblNuevaTerr || !this.oblNuevaFecha
            || !this.oblNuevaPres || !this.oblNuevaSoft
            || (this.oblNuevaModRequerida && !this.oblNuevaMod)
            || (!this.oblEsEdicion && !this.oblNuevaEmpresaId);
    }

    handleOblNuevaGuardar() {
        if (this.oblNuevaGuardarDisabled) return;
        this.oblNuevaSaving = true;
        this.oblNuevaError = null;
        const campos = {
            modelo: this.oblNuevaModelo,
            periodicidad: this.oblNuevaPer || null,
            territorio: this.oblNuevaTerr || null,
            modalidad: this.oblNuevaMod || null,
            fechaAlta: this.oblNuevaFecha,
            presentacion: this.oblNuevaPres || null,
            software: this.oblNuevaSoft || null,
            asesorId: this.oblNuevaAsesor || null,
            exonerado: this.oblNuevaExo || null
        };
        const accion = this.oblEsEdicion
            ? actualizarObligacionTributaria({ obligacionId: this.oblEditId, ...campos })
            : crearObligacionTributaria({ empresaId: this.oblNuevaEmpresaId, ...campos });
        accion
            .then(contratoId => {
                this.oblNuevaOpen = false;
                // Tras el alta, el cliente queda marcado con su ficha a la vista
                if (!this.oblEsEdicion) this.oblSelId = contratoId;
                // Recarga silenciosa: la matriz y la ficha se refrescan con lo
                // guardado sin tapar la pestaña con la ruleta
                this.cargarOblSilencioso();
            })
            .catch(err => { this.oblNuevaError = this.reduceError(err); })
            .finally(() => { this.oblNuevaSaving = false; });
    }

    // Filtro desplegable por asesor responsable del contrato (multiselección)
    @track oblAsesoresSel = [];
    @track showOblAsesorDd = false;

    get oblAsesorOptionsView() {
        const porAsesor = new Map();
        this.oblData.forEach(c => {
            const k = c.asesorId || 'SIN';
            if (!porAsesor.has(k)) porAsesor.set(k, c.asesor || 'Sin asesor');
        });
        return [...porAsesor.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.oblAsesoresSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get oblAsesorTriggerLabel() {
        if (!this.oblAsesoresSel.length) return 'Asesor responsable contrato';
        let base = this.oblAsesoresSel.length + ' seleccionados';
        if (this.oblAsesoresSel.length === 1) {
            const opt = this.oblAsesorOptionsView.find(o => o.value === this.oblAsesoresSel[0]);
            base = opt ? opt.label : '1 seleccionado';
        }
        return this.oblAsesoresModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    toggleOblAsesorDd() { this.showOblAsesorDd = !this.showOblAsesorDd; }
    closeOblAsesorDd() { this.showOblAsesorDd = false; }
    handleOblAsesorToggle(e) {
        this.oblAsesoresSel = this.alternar(this.oblAsesoresSel, e.currentTarget.dataset.value);
    }
    handleOblAsesorTodos() { this.oblAsesoresSel = []; }
    @track oblAsesoresModo = 'incluir';
    handleOblAsesorModo(e) { this.oblAsesoresModo = e.currentTarget.dataset.modo; }
    get oblAsesorModoIncCls() {
        return 'ts-ms-link' + (this.oblAsesoresModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get oblAsesorModoExcCls() {
        return 'ts-ms-link' + (this.oblAsesoresModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    // ===== Filtros propios de Total por asesores: asesor responsable de la obligación y
    // empresa titular del usuario asesor, con multiselección e incluir/excluir. Actúan sobre
    // cada obligación (no sobre el contrato), que es como se atribuye en esa vista =====
    @track oblAseOblSel = [];
    @track oblAseOblModo = 'incluir';
    @track showOblAseOblDd = false;
    @track oblAseTitSel = [];
    @track oblAseTitModo = 'incluir';
    @track showOblAseTitDd = false;
    // Opciones a partir de las obligaciones cargadas
    oblAseOpciones(claveFn, etiquetaFn, sel) {
        const porClave = new Map();
        this.oblData.forEach(c => (c.modelos || []).forEach(m => {
            const k = claveFn(m);
            if (!porClave.has(k)) porClave.set(k, etiquetaFn(m));
        }));
        return [...porClave.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value, label,
                optionClass: sel.includes(value) ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    oblAseEtiqueta(sel, modo, opciones, vacio) {
        if (!sel.length) return vacio;
        let base = sel.length + ' seleccionados';
        if (sel.length === 1) {
            const opt = opciones.find(o => o.value === sel[0]);
            base = opt ? opt.label : '1 seleccionado';
        }
        return modo === 'excluir' ? 'Excluir: ' + base : base;
    }
    get oblAseOblOptionsView() {
        return this.oblAseOpciones(m => m.asesorId || 'SIN', m => m.asesor || 'Sin asesor', this.oblAseOblSel);
    }
    get oblAseOblTriggerLabel() {
        return this.oblAseEtiqueta(this.oblAseOblSel, this.oblAseOblModo, this.oblAseOblOptionsView,
            'Asesor responsable obligación tributaria');
    }
    toggleOblAseOblDd() { this.showOblAseOblDd = !this.showOblAseOblDd; }
    closeOblAseOblDd() { this.showOblAseOblDd = false; }
    handleOblAseOblToggle(e) { this.oblAseOblSel = this.alternar(this.oblAseOblSel, e.currentTarget.dataset.value); }
    handleOblAseOblTodos() { this.oblAseOblSel = []; }
    handleOblAseOblModo(e) { this.oblAseOblModo = e.currentTarget.dataset.modo; }
    get oblAseOblModoIncCls() { return 'ts-ms-link' + (this.oblAseOblModo === 'incluir' ? ' ts-ms-link-activo' : ''); }
    get oblAseOblModoExcCls() { return 'ts-ms-link' + (this.oblAseOblModo === 'excluir' ? ' ts-ms-link-activo' : ''); }
    get oblAseTitOptionsView() {
        return this.oblAseOpciones(m => m.asesorEmpresaTitular || 'SIN',
            m => m.asesorEmpresaTitular || 'Sin empresa titular', this.oblAseTitSel);
    }
    get oblAseTitTriggerLabel() {
        return this.oblAseEtiqueta(this.oblAseTitSel, this.oblAseTitModo, this.oblAseTitOptionsView, 'Empresa titular usuario');
    }
    toggleOblAseTitDd() { this.showOblAseTitDd = !this.showOblAseTitDd; }
    closeOblAseTitDd() { this.showOblAseTitDd = false; }
    handleOblAseTitToggle(e) { this.oblAseTitSel = this.alternar(this.oblAseTitSel, e.currentTarget.dataset.value); }
    handleOblAseTitTodos() { this.oblAseTitSel = []; }
    handleOblAseTitModo(e) { this.oblAseTitModo = e.currentTarget.dataset.modo; }
    get oblAseTitModoIncCls() { return 'ts-ms-link' + (this.oblAseTitModo === 'incluir' ? ' ts-ms-link-activo' : ''); }
    get oblAseTitModoExcCls() { return 'ts-ms-link' + (this.oblAseTitModo === 'excluir' ? ' ts-ms-link-activo' : ''); }
    // ¿La obligación pasa los dos filtros de Total por asesores?
    oblAsePasaFiltros(m) {
        const casa = (modo, cumple) => (modo === 'excluir' ? !cumple : cumple);
        if (this.oblAseOblSel.length
            && !casa(this.oblAseOblModo, this.oblAseOblSel.includes(m.asesorId || 'SIN'))) return false;
        if (this.oblAseTitSel.length
            && !casa(this.oblAseTitModo, this.oblAseTitSel.includes(m.asesorEmpresaTitular || 'SIN'))) return false;
        return true;
    }

    // ===== Filtro Quién presenta (Despacho / Cliente / Otro asesor / Sin informar), en todas las
    // vistas: filtra los modelos de cada cliente y deja fuera al cliente que se queda sin ninguno =====
    @track oblPresSel = [];
    @track oblPresModo = 'incluir';
    @track showOblPresDd = false;
    oblClavePres(m) { return m.presentacion ? String(m.presentacion) : 'SIN'; }
    get oblPresOptionsView() {
        return this.oblAseOpciones(m => this.oblClavePres(m),
            m => (m.presentacion ? String(m.presentacion) : 'Sin informar'), this.oblPresSel);
    }
    get oblPresTriggerLabel() {
        return this.oblAseEtiqueta(this.oblPresSel, this.oblPresModo, this.oblPresOptionsView, 'Quién presenta');
    }
    toggleOblPresDd() { this.showOblPresDd = !this.showOblPresDd; }
    closeOblPresDd() { this.showOblPresDd = false; }
    handleOblPresToggle(e) { this.oblPresSel = this.alternar(this.oblPresSel, e.currentTarget.dataset.value); }
    handleOblPresTodos() { this.oblPresSel = []; }
    handleOblPresModo(e) { this.oblPresModo = e.currentTarget.dataset.modo; }
    get oblPresModoIncCls() { return 'ts-ms-link' + (this.oblPresModo === 'incluir' ? ' ts-ms-link-activo' : ''); }
    get oblPresModoExcCls() { return 'ts-ms-link' + (this.oblPresModo === 'excluir' ? ' ts-ms-link-activo' : ''); }

    // ===== Listado impuestos: filtros propios por modelo y por quién presenta, que solo actúan
    // en esa vista (los de la fila general siguen aplicando igual que en Total por empresas) =====
    @track oblImpModSel = [];
    @track oblImpModModo = 'incluir';
    @track showOblImpModDd = false;
    @track oblImpPresSel = [];
    @track oblImpPresModo = 'incluir';
    @track showOblImpPresDd = false;
    // Opciones de modelo: los que tienen los contratos que muestra el Total por empresas, con su
    // descripción, en orden de código
    get oblImpModOptionsView() {
        const porClave = new Map();
        this.oblMostradas.forEach(c => (c.modelos || []).forEach(m => {
            const k = String(m.modelo);
            if (!porClave.has(k)) porClave.set(k, k + (OBL_DESCRIPCIONES[k] ? ' · ' + OBL_DESCRIPCIONES[k] : ''));
        }));
        return [...porClave.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
            .map(([value, label]) => ({
                value, label,
                optionClass: this.oblImpModSel.includes(value) ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get oblImpModTriggerLabel() {
        return this.oblAseEtiqueta(this.oblImpModSel, this.oblImpModModo, this.oblImpModOptionsView, 'Modelo');
    }
    toggleOblImpModDd() { this.showOblImpModDd = !this.showOblImpModDd; }
    closeOblImpModDd() { this.showOblImpModDd = false; }
    handleOblImpModToggle(e) { this.oblImpModSel = this.alternar(this.oblImpModSel, e.currentTarget.dataset.value); }
    handleOblImpModTodos() { this.oblImpModSel = []; }
    handleOblImpModModo(e) { this.oblImpModModo = e.currentTarget.dataset.modo; }
    get oblImpModModoIncCls() { return 'ts-ms-link' + (this.oblImpModModo === 'incluir' ? ' ts-ms-link-activo' : ''); }
    get oblImpModModoExcCls() { return 'ts-ms-link' + (this.oblImpModModo === 'excluir' ? ' ts-ms-link-activo' : ''); }
    get oblImpPresOptionsView() {
        return this.oblAseOpciones(m => this.oblClavePres(m),
            m => (m.presentacion ? String(m.presentacion) : 'Sin informar'), this.oblImpPresSel);
    }
    get oblImpPresTriggerLabel() {
        return this.oblAseEtiqueta(this.oblImpPresSel, this.oblImpPresModo, this.oblImpPresOptionsView, 'Quién presenta');
    }
    toggleOblImpPresDd() { this.showOblImpPresDd = !this.showOblImpPresDd; }
    closeOblImpPresDd() { this.showOblImpPresDd = false; }
    handleOblImpPresToggle(e) { this.oblImpPresSel = this.alternar(this.oblImpPresSel, e.currentTarget.dataset.value); }
    handleOblImpPresTodos() { this.oblImpPresSel = []; }
    handleOblImpPresModo(e) { this.oblImpPresModo = e.currentTarget.dataset.modo; }
    get oblImpPresModoIncCls() { return 'ts-ms-link' + (this.oblImpPresModo === 'incluir' ? ' ts-ms-link-activo' : ''); }
    get oblImpPresModoExcCls() { return 'ts-ms-link' + (this.oblImpPresModo === 'excluir' ? ' ts-ms-link-activo' : ''); }
    // Chip de quién presenta: verde el despacho, azul el cliente, gris otro asesor y rojo sin informar
    oblImpPresCls(p) {
        const t = this.normalizar(p);
        if (!t) return 'obl-imp-pres obl-imp-pres-sin';
        if (t.includes('despacho')) return 'obl-imp-pres obl-imp-pres-desp';
        if (t.includes('cliente')) return 'obl-imp-pres obl-imp-pres-cli';
        return 'obl-imp-pres obl-imp-pres-otro';
    }

    // Listado impuestos: una línea por obligación tributaria de alta de los contratos que muestra
    // el Total por empresas (mismos datos y filtros), más los filtros propios de la pestaña.
    // Orden: empresa y, dentro de ella, modelo. Con caché por firma de filtros
    oblImpFirma() {
        return this.oblRowsFirma() + JSON.stringify([this.oblImpModSel, this.oblImpModModo,
            this.oblImpPresSel, this.oblImpPresModo]);
    }
    get oblImpRows() {
        const firma = this.oblImpFirma();
        if (this.oblImpCache && this.oblImpCacheData === this.oblData && this.oblImpCacheFirma === firma) {
            return this.oblImpCache;
        }
        const casa = (modo, cumple) => (modo === 'excluir' ? !cumple : cumple);
        const rows = [];
        this.oblMostradas.forEach(c => (c.modelos || []).forEach(m => {
            const mod = String(m.modelo);
            if (this.oblImpModSel.length && !casa(this.oblImpModModo, this.oblImpModSel.includes(mod))) return;
            if (this.oblImpPresSel.length
                && !casa(this.oblImpPresModo, this.oblImpPresSel.includes(this.oblClavePres(m)))) return;
            rows.push({
                key: m.id || (c.contratoId + '·' + mod + '·' + rows.length),
                id: m.id,
                modelo: mod,
                descripcion: OBL_DESCRIPCIONES[mod] || 'Modelo ' + mod,
                empresa: c.empresa || 'Sin empresa',
                empresaId: c.empresaId,
                contratoId: c.contratoId,
                periodicidad: m.periodicidad || '—',
                territorio: m.territorio || '—',
                asesor: m.asesor || 'Sin asesor',
                presentacion: m.presentacion || 'Sin informar',
                presCls: this.oblImpPresCls(m.presentacion),
                software: m.software || '—',
                modalidad: m.modalidad || '—'
            });
        }));
        rows.sort((a, b) => a.empresa.localeCompare(b.empresa, 'es')
            || a.modelo.localeCompare(b.modelo, 'es', { numeric: true }));
        rows.forEach((r, i) => { r.n = i + 1; });
        this.oblImpCache = rows;
        this.oblImpCacheData = this.oblData;
        this.oblImpCacheFirma = firma;
        return rows;
    }
    get hayOblImpRows() { return this.oblImpRows.length > 0; }
    get oblImpTotalLabel() {
        const n = this.oblImpRows.length;
        return this.fmtNumber(n) + (n === 1 ? ' obligación tributaria' : ' obligaciones tributarias');
    }

    // Filtro por la empresa titular gestión del contrato, con selección múltiple
    @track oblTitularesSel = [];
    @track showOblTitularDd = false;

    get oblTitularOptionsView() {
        const titulares = new Map();
        this.oblData.forEach(c => {
            const k = c.empresaTitular || 'SIN';
            if (!titulares.has(k)) titulares.set(k, c.empresaTitular || 'Sin empresa titular');
        });
        return [...titulares.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.oblTitularesSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get oblTitularTriggerLabel() {
        if (!this.oblTitularesSel.length) return 'Empresa titular gestión';
        let base = this.oblTitularesSel.length + ' seleccionadas';
        if (this.oblTitularesSel.length === 1) {
            const opt = this.oblTitularOptionsView.find(o => o.value === this.oblTitularesSel[0]);
            base = opt ? opt.label : '1 seleccionada';
        }
        return this.oblTitularesModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    toggleOblTitularDd() { this.showOblTitularDd = !this.showOblTitularDd; }
    closeOblTitularDd() { this.showOblTitularDd = false; }
    handleOblTitularToggle(e) {
        this.oblTitularesSel = this.alternar(this.oblTitularesSel, e.currentTarget.dataset.value);
    }
    handleOblTitularTodos() { this.oblTitularesSel = []; }
    @track oblTitularesModo = 'incluir';
    handleOblTitularModo(e) { this.oblTitularesModo = e.currentTarget.dataset.modo; }
    get oblTitularModoIncCls() {
        return 'ts-ms-link' + (this.oblTitularesModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get oblTitularModoExcCls() {
        return 'ts-ms-link' + (this.oblTitularesModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    // Filtro por la situación censal AEAT del contrato (Activa/Inactiva),
    // junto al botón de Nueva obligación
    @track oblCensosSel = [];
    @track showOblCensoDd = false;
    get oblCensoOptionsView() {
        return this.opcionesMs(this.oblData.map(c => c.censo || 'Sin censo'), this.oblCensosSel);
    }
    get oblCensoTriggerLabel() { return this.etiquetaMs(this.oblCensosSel, 'Censo'); }
    toggleOblCensoDd() { this.showOblCensoDd = !this.showOblCensoDd; }
    closeOblCensoDd() { this.showOblCensoDd = false; }
    handleOblCensoToggle(e) {
        this.oblCensosSel = this.alternar(this.oblCensosSel, e.currentTarget.dataset.value);
    }
    handleOblCensoTodos() { this.oblCensosSel = []; }

    // Filtro por el territorio de los modelos, con selección múltiple
    @track oblTerritoriosSel = [];
    @track showOblTerrDd = false;

    get oblTerrOptionsView() {
        const territorios = new Map();
        this.oblData.forEach(c => (c.modelos || []).forEach(m => {
            const k = m.territorio || 'SIN';
            if (!territorios.has(k)) territorios.set(k, m.territorio || 'Sin territorio');
        }));
        return [...territorios.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.oblTerritoriosSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get oblTerrTriggerLabel() {
        if (!this.oblTerritoriosSel.length) return 'Territorio';
        let base = this.oblTerritoriosSel.length + ' seleccionados';
        if (this.oblTerritoriosSel.length === 1) {
            const opt = this.oblTerrOptionsView.find(o => o.value === this.oblTerritoriosSel[0]);
            base = opt ? opt.label : '1 seleccionado';
        }
        return this.oblTerritoriosModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    toggleOblTerrDd() { this.showOblTerrDd = !this.showOblTerrDd; }
    closeOblTerrDd() { this.showOblTerrDd = false; }
    handleOblTerrToggle(e) {
        this.oblTerritoriosSel = this.alternar(this.oblTerritoriosSel, e.currentTarget.dataset.value);
    }
    handleOblTerrTodos() { this.oblTerritoriosSel = []; }
    @track oblTerritoriosModo = 'incluir';
    handleOblTerrModo(e) { this.oblTerritoriosModo = e.currentTarget.dataset.modo; }
    get oblTerrModoIncCls() {
        return 'ts-ms-link' + (this.oblTerritoriosModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get oblTerrModoExcCls() {
        return 'ts-ms-link' + (this.oblTerritoriosModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    // Filtro por el tipo de titular de la empresa, con selección múltiple
    @track oblTipoTitSel = [];
    @track showOblTipoTitDd = false;

    get oblTipoTitOptionsView() {
        const tipos = new Map();
        this.oblData.forEach(c => {
            const k = c.tipoTitular || 'SIN';
            if (!tipos.has(k)) tipos.set(k, c.tipoTitular || 'Sin informar');
        });
        return [...tipos.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.oblTipoTitSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get oblTipoTitTriggerLabel() {
        if (!this.oblTipoTitSel.length) return 'Tipo de titular';
        let base = this.oblTipoTitSel.length + ' seleccionados';
        if (this.oblTipoTitSel.length === 1) {
            const opt = this.oblTipoTitOptionsView.find(o => o.value === this.oblTipoTitSel[0]);
            base = opt ? opt.label : '1 seleccionado';
        }
        return this.oblTipoTitModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    toggleOblTipoTitDd() { this.showOblTipoTitDd = !this.showOblTipoTitDd; }
    closeOblTipoTitDd() { this.showOblTipoTitDd = false; }
    handleOblTipoTitToggle(e) {
        this.oblTipoTitSel = this.alternar(this.oblTipoTitSel, e.currentTarget.dataset.value);
    }
    handleOblTipoTitTodos() { this.oblTipoTitSel = []; }
    @track oblTipoTitModo = 'incluir';
    handleOblTipoTitModo(e) { this.oblTipoTitModo = e.currentTarget.dataset.modo; }
    get oblTipoTitModoIncCls() {
        return 'ts-ms-link' + (this.oblTipoTitModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get oblTipoTitModoExcCls() {
        return 'ts-ms-link' + (this.oblTipoTitModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    // Chip de una periodicidad: letra y clase de color
    // El modelo solo hace falta para distinguir el pago a cuenta único (1x) del de tres plazos (3x)
    oblChip(per, modelo) {
        const p = this.normalizar(per);
        if (p.startsWith('mensual')) return { letra: 'M', cls: 'obl-chip obl-chip-m' };
        if (p.startsWith('trimestral')) return { letra: 'T', cls: 'obl-chip obl-chip-t' };
        if (p.startsWith('anual +')) return { letra: 'A+', cls: 'obl-chip obl-chip-3x' };
        if (p.startsWith('anual')) return { letra: 'A', cls: 'obl-chip obl-chip-a' };
        if (p.startsWith('pago')) {
            return { letra: OBL_PAGO_UNICO.includes(String(modelo || '')) ? '1x' : '3x', cls: 'obl-chip obl-chip-3x' };
        }
        if (p.includes('sii') || p.startsWith('diaria') || p.startsWith('semanal')) {
            return { letra: 'D', cls: 'obl-chip obl-chip-d' };
        }
        return { letra: 'O', cls: 'obl-chip obl-chip-o' };
    }

    // Chip de una obligación en la matriz: la letra sigue siendo la
    // periodicidad, pero el color es el territorio del registro (leyenda de
    // territorios bajo las subpestañas)
    oblChipTerr(m) {
        const letra = this.oblChip(m.periodicidad, m.modelo).letra;
        return { letra, cls: 'obl-chip ' + this.oblTerrColorCls(m.territorio) };
    }
    // Clase de color de un territorio (paleta común de la matriz y la ficha)
    oblTerrColorCls(territorio) {
        const t = this.normalizar(territorio || '');
        if (t.startsWith('territorio com')) return 'obl-chip-comun';
        if (t.startsWith('navarra')) return 'obl-chip-navarra';
        if (t.startsWith('guipuzcoa') || t.startsWith('gipuzkoa')) return 'obl-chip-gipuzkoa';
        if (t.startsWith('alava') || t.startsWith('araba')) return 'obl-chip-alava';
        if (t.startsWith('bizkaia') || t.startsWith('vizcaya')) return 'obl-chip-bizkaia';
        if (t.startsWith('canarias')) return 'obl-chip-canarias';
        return 'obl-chip-sinterr';
    }
    // La leyenda de territorios acompaña a las vistas que pintan chips de obligaciones
    get esOblVistaConChips() { return this.esOblVistaEmpresas || this.esOblVistaAsesores; }

    // ¿El modelo casa con el filtro de periodicidad de la cabecera?
    oblCasaFiltro(m) {
        if (!this.oblPerFiltro) return true;
        const p = this.normalizar(m.periodicidad);
        if (this.oblPerFiltro === 'SII') return m.modelo === 'SII' || p.includes('sii');
        if (this.oblPerFiltro === 'Anual') return p.startsWith('anual');
        return p.startsWith(this.normalizar(this.oblPerFiltro));
    }

    // El filtrado completo es caro y los getters de la vista lo piden muchas
    // veces por repintado: se cachea con la misma firma de filtros que la matriz
    get oblMostradas() {
        const firma = this.oblRowsFirma();
        if (this.oblMostradasCache && this.oblMostradasCacheData === this.oblData
            && this.oblMostradasCacheFirma === firma) {
            return this.oblMostradasCache;
        }
        const filas = this.oblMostradasCalcular();
        this.oblMostradasCache = filas;
        this.oblMostradasCacheData = this.oblData;
        this.oblMostradasCacheFirma = firma;
        return filas;
    }

    oblMostradasCalcular() {
        let filas = this.oblData;
        if (this.oblMios) filas = filas.filter(c => c.asesorId === USER_ID);
        // Departamento laboral: clientes con alguno de sus modelos; fiscal: el resto
        if (this.oblDeptoFiltro) {
            const laborales = ['111', '216', '190', '296', '345'];
            const esLaboral = c => (c.modelos || []).some(m => laborales.includes(m.modelo));
            filas = this.oblDeptoFiltro === 'laboral'
                ? filas.filter(esLaboral)
                : filas.filter(c => !esLaboral(c));
        }
        // Cada filtro casa en modo incluir o deja fuera en modo excluir
        const casa = (modo, cumple) => (modo === 'excluir' ? !cumple : cumple);
        // Quién presenta actúa sobre los modelos: el cliente conserva solo los que casan y
        // desaparece si no le queda ninguno (la matriz, los totales y la ficha lo reflejan)
        if (this.oblPresSel.length) {
            filas = filas
                .map(c => ({ ...c, modelos: (c.modelos || []).filter(m =>
                    casa(this.oblPresModo, this.oblPresSel.includes(this.oblClavePres(m)))) }))
                .filter(c => c.modelos.length);
        }
        if (this.oblAsesoresSel.length) {
            filas = filas.filter(c => casa(this.oblAsesoresModo,
                this.oblAsesoresSel.includes(c.asesorId || 'SIN')));
        }
        if (this.oblTitularesSel.length) {
            filas = filas.filter(c => casa(this.oblTitularesModo,
                this.oblTitularesSel.includes(c.empresaTitular || 'SIN')));
        }
        if (this.oblTerritoriosSel.length) {
            filas = filas.filter(c => casa(this.oblTerritoriosModo,
                (c.modelos || []).some(m => this.oblTerritoriosSel.includes(m.territorio || 'SIN'))));
        }
        if (this.oblTipoTitSel.length) {
            filas = filas.filter(c => casa(this.oblTipoTitModo,
                this.oblTipoTitSel.includes(c.tipoTitular || 'SIN')));
        }
        if (this.oblCensosSel.length) {
            filas = filas.filter(c => this.oblCensosSel.includes(c.censo || 'Sin censo'));
        }
        const t = this.normalizar(this.oblBusqueda);
        if (t) filas = filas.filter(c => this.normalizar(c.empresa).includes(t));
        if (this.oblPerFiltro) {
            filas = filas.filter(c => (c.modelos || []).some(m => this.oblCasaFiltro(m)));
        }
        if (this.oblModeloFiltro) {
            const valores = OBL_ALIAS[this.oblModeloFiltro] || [this.oblModeloFiltro];
            filas = filas.filter(c => (c.modelos || []).some(m => valores.includes(m.modelo)));
        }
        if (this.oblModelosSel.length) {
            const valoresSel = new Set();
            this.oblModelosSel.forEach(col => (OBL_ALIAS[col] || [col]).forEach(v => valoresSel.add(v)));
            const tieneAlguno = c => (c.modelos || []).some(m => valoresSel.has(m.modelo));
            filas = this.oblModelosModo === 'excluir'
                ? filas.filter(c => !tieneAlguno(c))
                : filas.filter(c => tieneAlguno(c));
        }
        // Celda de totales marcada: clientes con ese modelo en esa periodicidad
        if (this.oblTotSel) {
            const [dk, col] = this.oblTotSel.split('·');
            const def = this.oblDefsPeriodicidad.find(x => x.key === dk);
            const valores = OBL_ALIAS[col] || [col];
            if (def) {
                filas = filas.filter(c => (c.modelos || []).some(m =>
                    valores.includes(m.modelo)
                    && def.casa(this.normalizar(m.periodicidad), m.modelo, c)));
            }
        }
        return filas;
    }

    // Cabecera: bandas y columnas de modelos
    get oblBandas() {
        return OBL_BANDAS.map(b => ({ ...b, key: b.nombre, n: b.modelos.length }));
    }
    get oblColumnas() {
        const out = [];
        OBL_BANDAS.forEach(b => b.modelos.forEach(m => out.push(m)));
        return out;
    }
    // Cabecera de columnas: pinchables para filtrar y con la i informativa
    get oblColumnasView() {
        return this.oblColumnas.map(m => ({
            key: m,
            label: m,
            cls: 'acf-th-cen obl-th obl-th-btn' + oblColVerdeCls(m)
                + (this.oblModeloFiltro === m ? ' obl-th-activo' : ''),
            info: OBL_DESCRIPCIONES[m] || ''
        }));
    }

    // KPIs de la cabecera sobre todos los clientes mostrados. Los "Anual +
    // Pago a cuenta" cuentan en pagos a cuenta, no en anuales
    get oblKpis() {
        // Total de cada apartado y, debajo, cuántos de esos modelos presenta el despacho
        // (campo Quién presenta = Despacho); en SII se cuentan clientes, no modelos
        let mensuales = 0, trimestrales = 0, anuales = 0, pagos = 0;
        // Por quién presenta: despacho, cliente y otro asesor (lo que falte hasta el total está sin informar)
        const q = { desp: { m: 0, t: 0, a: 0, p: 0, sii: new Set() }, cli: { m: 0, t: 0, a: 0, p: 0, sii: new Set() }, otro: { m: 0, t: 0, a: 0, p: 0, sii: new Set() } };
        const enSii = new Set();
        this.oblMostradas.forEach(c => (c.modelos || []).forEach(m => {
            const p = this.normalizar(m.periodicidad);
            const pres = this.normalizar(m.presentacion);
            const g = pres === 'despacho' ? q.desp : (pres === 'cliente' ? q.cli : (pres ? q.otro : null));
            if (p.startsWith('mensual')) { mensuales++; if (g) g.m++; }
            else if (p.startsWith('trimestral')) { trimestrales++; if (g) g.t++; }
            else if (p.startsWith('anual') && !p.includes('pago')) { anuales++; if (g) g.a++; }
            if (p.startsWith('pago') || p.includes('pago a cuenta')) { pagos++; if (g) g.p++; }
            if (m.modelo === 'SII' || p.includes('sii')) {
                enSii.add(c.contratoId);
                if (g) g.sii.add(c.contratoId);
            }
        }));
        return {
            mensuales: this.fmtNumber(mensuales),
            trimestrales: this.fmtNumber(trimestrales),
            anuales: this.fmtNumber(anuales),
            pagos: this.fmtNumber(pagos),
            sii: this.fmtNumber(enSii.size),
            mensualesDesp: this.fmtNumber(q.desp.m), trimestralesDesp: this.fmtNumber(q.desp.t),
            anualesDesp: this.fmtNumber(q.desp.a), pagosDesp: this.fmtNumber(q.desp.p), siiDesp: this.fmtNumber(q.desp.sii.size),
            mensualesCli: this.fmtNumber(q.cli.m), trimestralesCli: this.fmtNumber(q.cli.t),
            anualesCli: this.fmtNumber(q.cli.a), pagosCli: this.fmtNumber(q.cli.p), siiCli: this.fmtNumber(q.cli.sii.size),
            mensualesOtro: this.fmtNumber(q.otro.m), trimestralesOtro: this.fmtNumber(q.otro.t),
            anualesOtro: this.fmtNumber(q.otro.a), pagosOtro: this.fmtNumber(q.otro.p), siiOtro: this.fmtNumber(q.otro.sii.size)
        };
    }

    get oblFiltros() {
        const botones = [
            { key: '', label: 'Todas' },
            { key: 'Mensual', label: 'Mensual' },
            { key: 'Trimestral', label: 'Trimestral' },
            { key: 'Anual', label: 'Anual' },
            { key: 'SII', label: 'SII' }
        ];
        return botones.map(b => ({
            ...b,
            cls: 'acf-btn-mios' + (this.oblPerFiltro === b.key ? ' acf-btn-mios-activo' : '')
        }));
    }
    get oblEjercicioLabel() { return 'Ejercicio ' + new Date().getFullYear(); }

    // Cajitas de vencimiento a partir de una lista "20/04;20/07;…": cada
    // fecha dd/mm se muestra como "20 abr" (los textos se dejan tal cual)
    oblFormatearVencs(lista) {
        const MESES = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr',
            '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago',
            '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
        return String(lista || '').split(';')
            .map(v => v.trim())
            .filter(Boolean)
            .map(v => {
                const mm = v.match(/^(\d{1,2})\/(\d{2})$/);
                return mm ? mm[1] + ' ' + (MESES[mm[2]] || mm[2]) : v;
            });
    }
    oblVencimientos(m) { return this.oblFormatearVencs(m.vencimientos); }

    // Vencimientos "brutos" del calendario, sin registros: por modelo y
    // periodicidad, con el mismo criterio que la fórmula del campo
    oblVencsBrutos(valorPicklist, per) {
        const p = this.normalizar(per || '');
        if (p.startsWith('mensual')) {
            if (['303', '322', '353', '410', '417', '716', '760'].includes(valorPicklist)) {
                return ['30 de cada mes (feb: 28)'];
            }
            if (valorPicklist === '330') return ['25 de cada mes (julio: hasta 25 sep; diciembre: hasta 31 ene)'];
            if (valorPicklist === '320') return ['25 de cada mes (enero no se presenta)'];
            if (valorPicklist === 'F66') return ['30 de cada mes (31 ene, feb: 28; junio: 5 ago; julio: 21 sep)'];
            if (valorPicklist.startsWith('Intrastat')) return ['12 de cada mes'];
            return ['20 de cada mes'];
        }
        if (p.includes('sii') || p.startsWith('diaria') || p.startsWith('semanal')) return ['4 días háb.'];
        return this.oblFormatearVencs(OBL_VENC_FECHAS[valorPicklist] || '');
    }

    // La matriz es cara de construir (cientos de clientes x columnas): se
    // cachea y solo se recalcula cuando cambian los datos o algún filtro.
    // La selección de una fila (oblSelId) se aplica aparte en oblRows, que es
    // lo que hace instantáneo marcar un cliente para abrir su ficha
    get oblRows() {
        const rows = this.oblRowsBase;
        if (!this.oblSelId) return rows;
        return rows.map(r => (r.esGrupo || r.contratoId !== this.oblSelId)
            ? r : { ...r, filaCls: r.filaCls + ' obl-fila-sel' });
    }

    oblRowsFirma() {
        return JSON.stringify([this.oblMios, this.oblDeptoFiltro,
            this.oblAsesoresSel, this.oblAsesoresModo, this.oblTitularesSel, this.oblTitularesModo,
            this.oblTerritoriosSel, this.oblTerritoriosModo, this.oblTipoTitSel, this.oblTipoTitModo,
            this.oblCensosSel, this.oblBusqueda, this.oblPerFiltro, this.oblModeloFiltro,
            this.oblModelosSel, this.oblModelosModo, this.oblTotSel,
            this.oblAgrAsesor, this.oblAgrTitular, this.oblAgrTipoTit, this.oblAgrGrupo, this.oblAgrTerrFis, this.oblAgrConsol,
            this.oblPresSel, this.oblPresModo]);
    }

    get oblRowsBase() {
        const firma = this.oblRowsFirma();
        if (this.oblRowsCache && this.oblRowsCacheData === this.oblData && this.oblRowsCacheFirma === firma) {
            return this.oblRowsCache;
        }
        const rows = this.oblRowsCalcular();
        this.oblRowsCache = rows;
        this.oblRowsCacheData = this.oblData;
        this.oblRowsCacheFirma = firma;
        return rows;
    }

    oblRowsCalcular() {
        const filas = this.oblMostradas.map(c => {
            // Modelos del contrato que pasan el filtro, indexados por columna
            const porModelo = new Map();
            (c.modelos || []).forEach(m => {
                if (!this.oblCasaFiltro(m)) return;
                if (!porModelo.has(m.modelo)) porModelo.set(m.modelo, m);
            });
            const clienteSii = this.oblClienteSii(c);
            // Avisos de coherencia entre modelos: triángulo rojo si hay alguno, gris claro si no
            const avisos = this.oblAvisosDe(c);
            const notaTitular = this.oblNotaTitular(c);
            // Situación censal AEAT del contrato: A verde activa, I roja inactiva
            const censoActiva = c.censo === 'Activa';
            return {
                key: c.contratoId,
                contratoId: c.contratoId,
                empresaId: c.empresaId,
                empresa: c.empresa,
                censoLetra: censoActiva ? 'A' : c.censo === 'Inactiva' ? 'I' : '',
                censoCls: 'obl-censo-dot' + (censoActiva ? ' obl-censo-activa' : ' obl-censo-inactiva'),
                censoTitle: 'Situación censal AEAT: ' + (c.censo || ''),
                avisoCls: 'obl-aviso-dot' + (avisos.length ? ' obl-aviso-rojo' : ' obl-aviso-gris'),
                avisoTitle: (avisos.length ? avisos.join('\n') : 'Sin incidencias de coherencia entre modelos')
                    + (notaTitular ? '\n' + notaTitular : ''),
                avisosN: avisos.length,
                hayAvisos: avisos.length > 0,
                asesor: c.asesor,
                titular: c.empresaTitular || 'Sin empresa titular',
                terrFiscal: c.territorioFiscal || 'Sin territorio fiscal',
                consolFiscal: this.oblEtiquetaConsol(c),
                tipoTit: c.tipoTitular || 'Sin informar',
                grupo: c.grupo || 'Sin grupo',
                filaCls: 'acf-row obl-fila',
                celdas: this.oblColumnas.map(col => {
                    const valores = OBL_ALIAS[col] || [col];
                    const m = valores.map(v => porModelo.get(v)).find(x => x);
                    const chip = m ? this.oblChipTerr(m) : null;
                    // Cliente en SII: el 390 y el 347 no son obligatorios; la celda lo dice al
                    // pasar el ratón (antes iba además con fondo amarillo, retirado a petición)
                    const revisar = clienteSii && this.oblModelosSii(c).includes(col);
                    // Modelo de alta que no presenta el despacho (cliente, otro asesor o sin
                    // informar): la caja va en azul intenso y el chip sigue con su letra
                    const noDespacho = !!m && this.normalizar(m.presentacion) !== 'despacho';
                    const quienPresenta = m && m.presentacion
                        ? 'Presenta ' + String(m.presentacion).toLowerCase()
                        : 'Sin informar quién presenta';
                    return {
                        key: col,
                        letra: chip ? chip.letra : '',
                        chipCls: chip ? chip.cls : '',
                        cls: 'obl-td' + oblColVerdeCls(col) + (noDespacho ? ' obl-td-nodesp' : ''),
                        title: revisar
                            ? 'En SII el modelo ' + col + ' debe estar de alta y marcado Exonerado = Sí'
                            : (m ? (col + ' · ' + (m.periodicidad || '') + (noDespacho ? ' · ' + quienPresenta : '')) : '')
                    };
                })
            };
        });
        // Número correlativo por fila; agrupado por asesor, empieza en cada grupo
        const numerar = (arr) => {
            let n = 0;
            return arr.map(c => {
                if (c.esGrupo) { n = 0; return { ...c, filaCls: 'acf-row' }; }
                n += 1;
                return { ...c, num: n };
            });
        };
        const agrupar = this.oblAgrAsesor
            ? (c => c.asesor || 'Sin asesor')
            : (this.oblAgrTitular ? (c => c.titular)
                : (this.oblAgrTipoTit ? (c => c.tipoTit)
                    : (this.oblAgrGrupo ? (c => c.grupo)
                        : (this.oblAgrTerrFis ? (c => c.terrFiscal)
                            : (this.oblAgrConsol ? (c => c.consolFiscal) : null)))));
        if (!agrupar) return numerar(filas);
        // Totales de mensuales, trimestrales, anuales y SII de cada grupo
        const totales = new Map();
        this.oblMostradas.forEach(c => {
            const k = this.oblAgrAsesor
                ? (c.asesor || 'Sin asesor')
                : (this.oblAgrTitular
                    ? (c.empresaTitular || 'Sin empresa titular')
                    : (this.oblAgrTipoTit
                        ? (c.tipoTitular || 'Sin informar')
                        : (this.oblAgrGrupo
                            ? (c.grupo || 'Sin grupo')
                            : (this.oblAgrTerrFis
                                ? (c.territorioFiscal || 'Sin territorio fiscal')
                                : this.oblEtiquetaConsol(c)))));
            if (!totales.has(k)) totales.set(k, { m: 0, t: 0, a: 0, sii: new Set() });
            const g = totales.get(k);
            (c.modelos || []).forEach(x => {
                const p = this.normalizar(x.periodicidad);
                if (p.startsWith('mensual')) g.m++;
                else if (p.startsWith('trimestral')) g.t++;
                else if (p.startsWith('anual')) g.a++;
                if (x.modelo === 'SII' || p.includes('sii')) g.sii.add(c.contratoId);
            });
        });
        return numerar(this.agruparFilas(filas, agrupar)).map(c => {
            if (!c.esGrupo) return c;
            const g = totales.get(c.key.substring(2)) || { m: 0, t: 0, a: 0, sii: new Set() };
            return {
                ...c,
                tot: 'Mensuales ' + g.m + ' · Trimestrales ' + g.t
                    + ' · Anuales ' + g.a + ' · SII ' + g.sii.size
            };
        });
    }

    get oblHayFilas() { return this.oblMostradas.length > 0; }

    // ¿El modelo/periodicidad es del SII? (no debe sumar en los mensuales)
    oblEsSii(modelo, p) {
        return modelo === 'SII' || p.includes('sii')
            || p.startsWith('diaria') || p.startsWith('semanal');
    }
    // ¿El cliente está en SII? (queda exonerado del 390 y del 347)
    oblClienteSii(c) {
        return (c.modelos || []).some(m =>
            this.oblEsSii(m.modelo, this.normalizar(m.periodicidad)));
    }
    // Periodicidades de las filas de totales y de Total por asesores. Los
    // "Anual + Pago a cuenta" suman solo en Pago a cuenta, el SII va en su
    // propia fila (sin sumar en mensuales) y los anuales excluidos son los
    // 390/347 de clientes en SII (exonerados, pendientes de revisar)
    // Modelos que el SII exonera según el territorio fiscal del contrato: en Canarias (IGIC) son
    // el 415 y el 425; en el resto, el 347 y el 390
    oblModelosSii(c) {
        return this.normalizar(c && c.territorioFiscal).startsWith('canarias') ? ['415', '425'] : ['347', '390'];
    }
    // ¿Modelo exonerado por SII? (los de oblModelosSii en clientes en SII)
    oblExcluidoSii(mod, c) {
        return !!c && this.oblModelosSii(c).includes(String(mod)) && this.oblClienteSii(c);
    }
    get oblDefsPeriodicidad() {
        return [
            { key: 'mensual', label: 'Total mensual',
              casa: (p, mod) => p.startsWith('mensual') && !this.oblEsSii(mod, p) },
            { key: 'trimestral', label: 'Total trimestral', casa: p => p.startsWith('trimestral') },
            // Los 390/347 exonerados por SII no suman en Anual: van en excluidos
            { key: 'anual', label: 'Total anual',
              casa: (p, mod, c) => p.startsWith('anual') && !p.includes('pago')
                  && !this.oblExcluidoSii(mod, c) },
            { key: 'anualexc', label: 'Total anual excluidos', amarilla: true,
              casa: (p, mod, c) => this.oblExcluidoSii(mod, c) },
            { key: 'pago', label: 'Total pago a cuenta',
              casa: p => p.startsWith('pago') || p.includes('pago a cuenta') },
            { key: 'sii', label: 'Total SII', casa: (p, mod) => this.oblEsSii(mod, p) }
        ];
    }

    // Celda de totales marcada ('clave·columna'): filtra esos modelos
    @track oblTotSel = '';
    handleOblTotCelda(e) {
        const k = e.currentTarget.dataset.k;
        if (!k) return;
        this.oblTotSel = this.oblTotSel === k ? '' : k;
    }

    // Primeras líneas de la matriz: total de clientes con cada modelo en
    // cada periodicidad, columna a columna. Las celdas con número filtran
    get oblTotalesPeriodicidad() {
        const defs = this.oblDefsPeriodicidad;
        // Una sola pasada por los clientes: para cada periodicidad, cuántos
        // clientes tienen cada modelo (normalizar se llama una vez por modelo)
        const porDef = defs.map(() => new Map());
        this.oblMostradas.forEach(c => {
            const vistos = defs.map(() => new Set());
            (c.modelos || []).forEach(m => {
                const p = this.normalizar(m.periodicidad);
                defs.forEach((d, i) => {
                    if (vistos[i].has(m.modelo)) return;
                    if (d.casa(p, m.modelo, c)) {
                        vistos[i].add(m.modelo);
                        porDef[i].set(m.modelo, (porDef[i].get(m.modelo) || 0) + 1);
                    }
                });
            });
        });
        return defs.map((d, i) => {
            let total = 0;
            const celdas = this.oblColumnas.map(col => {
                const valores = OBL_ALIAS[col] || [col];
                const n = valores.reduce((s, v) => s + (porDef[i].get(v) || 0), 0);
                total += n;
                const k = d.key + '·' + col;
                return {
                    key: col,
                    k,
                    n: n || '',
                    cls: 'obl-td obl-total-td' + oblColVerdeCls(col) + (n ? ' obl-total-click' : '')
                        + (this.oblTotSel === k ? ' obl-total-sel' : '')
                };
            });
            return { key: d.key, label: d.label, total: this.fmtNumber(total),
                cls: 'obl-total-fila' + (d.amarilla ? ' obl-total-fila-amarilla' : ''),
                celdas };
        });
    }

    // Ficha censal del cliente marcado; sin cliente, la matriz va a todo lo ancho
    get oblSel() { return this.oblData.find(c => c.contratoId === this.oblSelId) || null; }
    get hayOblSel() { return !!this.oblSel; }

    // Reglas de coherencia de un contrato (ver la subpestaña Reglas incidencias). Cada aviso es
    // UN modelo que falta, sobra o está mal marcado, o UN campo del contrato sin informar: el
    // nº de avisos es el nº de cosas a corregir. Solo se miran los modelos de alta.
    //  - Campos del contrato: Consolidación fiscal y Operador intracomunitario informados (Sí/No).
    //  - Territorio fiscal: en Bizkaia y Guipúzcoa el pago fraccionado es el 203 (no el 202); en
    //    Navarra el Impuesto sobre Sociedades es el S90 (no el 200) y el pago fraccionado el S91
    //    (no el 202). Todas las reglas del 200 y del 202 se aplican con el modelo del territorio,
    //    y tener el de otro territorio es una incidencia.
    //  - Situación censal AEAT inactiva: persona física sin ninguna obligación; sociedad, solo
    //    200, 202, 232 y 347 (el resto sobra). Sin tipo de titular no se puede saber más.
    //  - Parejas periódico/anual: 111-190, 216-296, 123-193, 115-180 y 303-390 (esta no en SII).
    //    El 180 también queda justificado por el 759 o el 760, y el 193 por el 716 (forales).
    //  - Dependencias en un solo sentido: 759 o 760 exigen el 180; 716 exige el 193; 320 exige
    //    el 390 (no en SII, donde el 390 va por la regla del SII). El 417 es solo mensual y no
    //    va ligado al 425. El 330 (IVA mensual de Bizkaia y Guipúzcoa) exige estar en SII y
    //    excluye el 303.
    //  - Con situación censal activa, toda empresa debe tener el 111 y el 190.
    //  - 220 (consolidado) exige el 222 y el 22A.
    //  - Persona física: nunca 200, 202 ni 232. Sociedad: 200, 232 y 347 (en SII el 347 va
    //    por la regla del SII) y 202 salvo que Consolidación fiscal sea Sí.
    //  - CIF que empieza por E (atribución de rentas): sin 200, 202 ni 232 aunque no sea persona física.
    //  - SII: el 347 y el 390 deben estar de alta y marcados Exonerado = Sí; con territorio
    //    fiscal Canarias son el 415 y el 425, y el 347 y el 390 no le corresponden.
    //  - Operador intracomunitario Sí exige el 349; No, el 349 no debe estar de alta.
    oblAvisosDe(c) {
        const modelos = c.modelos || [];
        const tiene = new Set(modelos.map(m => String(m.modelo)));
        const exonerado = mod => modelos.some(m => String(m.modelo) === mod && this.normalizar(m.exonerado) === 'si');
        const sii = this.oblClienteSii(c);
        const titular = this.normalizar(c.tipoTitular);
        const fisica = !!titular && titular.includes('fisica');
        const sociedad = !!titular && !fisica;
        // CIF que empieza por E (entidad en atribución de rentas): sin 200, 202 ni 232 aunque no sea persona física
        const cifE = String(c.cif || '').trim().toUpperCase().startsWith('E');
        const censo = this.normalizar(c.censo);
        const consolidacion = this.normalizar(c.consolidacionFiscal);
        const operador = this.normalizar(c.operadorIntracomValor);
        const terr = this.oblModelosTerritorio(c.territorioFiscal);
        const avisos = [];
        // Campos del contrato que hay que informar
        if (consolidacion !== 'si' && consolidacion !== 'no') {
            avisos.push('Informar el campo Consolidación fiscal del contrato (Sí o No)');
        }
        if (operador !== 'si' && operador !== 'no') {
            avisos.push('Informar el campo Operador intracomunitario del contrato (Sí o No)');
        }
        // Situación censal inactiva
        if (censo === 'inactiva') {
            if (fisica) {
                modelos.forEach(m => avisos.push('Situación censal inactiva y persona física: el modelo '
                    + m.modelo + ' no debería estar de alta'));
            } else if (sociedad) {
                // Los modelos de sociedades de otro territorio los avisa la regla del territorio
                const permitidos = [...OBL_MODELOS_SOCIEDAD, '232', '347'];
                [...tiene].filter(m => !permitidos.includes(m)).sort().forEach(m => avisos.push(
                    'Situación censal inactiva: el modelo ' + m + ' no debería estar de alta'));
                this.oblAvisosSociedad(tiene, false, consolidacion, terr, avisos, cifE);
            }
            return avisos;
        }
        // Parejas periódico / anual. Los alternativos son otros periódicos (forales) que también
        // justifican el anual: con 180 y 759 no se echa en falta el 115
        const pareja = (a, b, alternativos = []) => {
            if (tiene.has(a) && !tiene.has(b)) avisos.push('Tiene el modelo ' + a + ' pero no el ' + b);
            else if (tiene.has(b) && !tiene.has(a) && !alternativos.some(x => tiene.has(x))) {
                avisos.push('Tiene el modelo ' + b + ' pero no el ' + a
                    + (alternativos.length ? ' ni el ' + alternativos.join(' o ') : ''));
            }
        };
        // Dependencia en un solo sentido: quien tiene alguno de los modelos a debe tener el b
        const requiere = (a, b) => {
            const presentes = a.filter(x => tiene.has(x));
            if (presentes.length && !tiene.has(b)) avisos.push('Tiene el modelo ' + presentes.join(' y ') + ' pero no el ' + b);
        };
        if (censo === 'activa' && !tiene.has('111') && !tiene.has('190')) {
            avisos.push('Situación censal activa y no tiene el modelo 111');
            avisos.push('Situación censal activa y no tiene el modelo 190');
        } else {
            pareja('111', '190');
        }
        pareja('216', '296');
        pareja('123', '193', ['716']);
        pareja('115', '180', ['759', '760']);
        if (!sii) pareja('303', '390');
        requiere(['759', '760'], '180');
        requiere(['716'], '193');
        if (!sii) requiere(['320'], '390');
        // Consolidado: el 220 lleva el 222 y el 22A
        if (tiene.has('220')) {
            if (!tiene.has('222')) avisos.push('Tiene el modelo 220 pero no el 222');
            if (!tiene.has('22A')) avisos.push('Tiene el modelo 220 pero no el 22A');
        }
        // 330 (IVA mensual de Bizkaia y Guipúzcoa): solo lo presenta quien está en el SII, y con
        // él no le corresponde el 303
        if (tiene.has('330')) {
            if (!sii) avisos.push('Tiene el modelo 330 pero no el SII: el 330 es el IVA mensual foral de los inscritos en SII');
            if (tiene.has('303')) avisos.push('Tiene el modelo 330 y el 303: con el 330 no le corresponde el 303');
        }
        // Persona física: nunca sociedades (ni el 200 y el 202 ni sus equivalentes forales)
        if (fisica) {
            [...OBL_MODELOS_SOCIEDAD, '232'].forEach(m => {
                if (tiene.has(m)) avisos.push('Persona física con el modelo ' + m + ', que no le corresponde');
            });
        }
        if (sociedad) this.oblAvisosSociedad(tiene, sii, consolidacion, terr, avisos, cifE);
        // SII: los modelos que exonera (347 y 390; en Canarias, 415 y 425) de alta y marcados
        // Exonerado = Sí. En Canarias, el 347 y el 390 no le corresponden
        if (sii) {
            const exigidos = this.oblModelosSii(c);
            exigidos.forEach(m => {
                if (!tiene.has(m)) avisos.push('En SII debe tener el modelo ' + m + ' de alta y marcado Exonerado = Sí');
                else if (!exonerado(m)) avisos.push('En SII el modelo ' + m + ' debe estar marcado Exonerado = Sí');
            });
            if (exigidos[0] === '415') {
                [['347', '415'], ['390', '425']].forEach(([m, ok]) => {
                    if (tiene.has(m)) avisos.push('En SII con territorio fiscal Canarias no le corresponde el modelo ' + m + ' sino el ' + ok);
                });
            }
        }
        // Operador intracomunitario
        if (operador === 'si' && !tiene.has('349')) avisos.push('Operador intracomunitario sin el modelo 349');
        if (operador === 'no' && tiene.has('349')) avisos.push('Tiene el modelo 349 sin ser operador intracomunitario');
        return avisos;
    }
    // Modelos del Impuesto sobre Sociedades y del pago fraccionado según el territorio fiscal
    // del contrato: Bizkaia y Guipúzcoa presentan el 203 en vez del 202; Navarra el S90 en vez
    // del 200 y el S91 en vez del 202. El resto (Territorio Común, Canarias, Álava o sin
    // informar) el 200 y el 202
    oblModelosTerritorio(territorioFiscal) {
        const t = this.normalizar(territorioFiscal);
        if (t.includes('navarra')) return { m200: 'S90', m202: 'S91', nombre: 'Navarra' };
        if (t.includes('bizkaia') || t.includes('vizcaya') || t.includes('guipuzcoa') || t.includes('gipuzkoa')) {
            return { m200: '200', m202: '203', nombre: territorioFiscal };
        }
        return { m200: '200', m202: '202', nombre: territorioFiscal || 'sin territorio fiscal' };
    }
    // Modelos que no pueden faltar a una sociedad: el 200, el 232, el 347 (fuera de SII) y el
    // 202 salvo consolidación fiscal, con el 200 y el 202 que tocan por territorio fiscal. Tener
    // de alta el Impuesto sobre Sociedades o el pago fraccionado de otro territorio es incidencia
    oblAvisosSociedad(tiene, sii, consolidacion, terr, avisos, cifE = false) {
        if (cifE) {
            // Entidad en atribución de rentas (CIF que empieza por E): sin Impuesto sobre Sociedades,
            // pago fraccionado ni 232; tenerlos de alta es incidencia. El 347 sí se le exige
            [...OBL_MODELOS_SOCIEDAD, '232'].forEach(m => {
                if (tiene.has(m)) avisos.push('CIF que empieza por E (entidad en atribución de rentas): el modelo ' + m + ' no le corresponde');
            });
            if (!sii && !tiene.has('347')) avisos.push('No es persona física y no tiene el modelo 347');
            return;
        }
        const enTerr = terr.m200 !== '200' || terr.m202 !== '202' ? ' (' + terr.nombre + ')' : '';
        if (!tiene.has(terr.m200)) avisos.push('No es persona física y no tiene el modelo ' + terr.m200 + enTerr);
        if (consolidacion !== 'si' && !tiene.has(terr.m202)) {
            avisos.push('No es persona física y no tiene el modelo ' + terr.m202 + enTerr);
        }
        if (!tiene.has('232')) avisos.push('No es persona física y no tiene el modelo 232');
        if (!sii && !tiene.has('347')) avisos.push('No es persona física y no tiene el modelo 347');
        OBL_MODELOS_SOCIEDAD.filter(m => m !== terr.m200 && m !== terr.m202 && tiene.has(m)).forEach(m => {
            const correcto = m === '200' || m === 'S90' ? terr.m200 : terr.m202;
            avisos.push('Tiene el modelo ' + m + ', que no es de su territorio fiscal (' + terr.nombre
                + '): le corresponde el ' + correcto);
        });
    }

    // Nota informativa que NO cuenta como incidencia: sin tipo de titular no se pueden
    // comprobar los modelos de sociedades (200, 202, 232 y 347, o sus equivalentes por
    // territorio fiscal) ni lo que corresponde con la situación censal inactiva
    oblNotaTitular(c) {
        if (this.normalizar(c.tipoTitular)) return '';
        const terr = this.oblModelosTerritorio(c.territorioFiscal);
        return 'Sin tipo de titular informado: no se comprueban los modelos ' + terr.m200 + ', '
            + terr.m202 + ', 232 y 347';
    }

    get oblFicha() {
        const c = this.oblSel;
        if (!c) return null;
        const avisos = this.oblAvisosDe(c);
        const notaTitular = this.oblNotaTitular(c);
        const orden = ['Mensual', 'Trimestral', 'Pago a cuenta', 'Anual', 'Anual excluidos', 'Otras'];
        const grupos = new Map();
        const clienteSii = this.oblClienteSii(c);
        (c.modelos || []).forEach(m => {
            const p = this.normalizar(m.periodicidad);
            let g = 'Otras';
            if (p.startsWith('mensual')) g = 'Mensual';
            else if (p.startsWith('trimestral')) g = 'Trimestral';
            else if (p.startsWith('pago')) g = 'Pago a cuenta';
            else if (p.startsWith('anual')) g = 'Anual';
            // En SII, el 390 y el 347 van a su apartado de excluidos en amarillo
            const excluido = clienteSii && this.oblModelosSii(c).includes(String(m.modelo));
            if (excluido) g = 'Anual excluidos';
            if (!grupos.has(g)) grupos.set(g, []);
            // Quién presenta el modelo, con su color, a la derecha de la línea
            const pres = this.normalizar(m.presentacion);
            let presenta = '';
            let presentaCls = 'obl-ficha-pres obl-w-pres';
            if (pres === 'despacho') { presenta = 'Presenta despacho'; presentaCls += ' obl-pres-despacho'; }
            else if (pres === 'cliente') { presenta = 'Presenta cliente'; presentaCls += ' obl-pres-cliente'; }
            else if (pres) { presenta = 'Presenta ' + m.presentacion.toLowerCase(); presentaCls += ' obl-pres-otro'; }
            // Software de preparación del impuesto, abreviado y cada uno con su color
            const soft = this.normalizar(m.software);
            let software = '';
            let softCls = 'obl-soft-otro';
            if (soft.includes('despacho')) { software = 'ERP Despacho'; softCls = 'obl-soft-despacho'; }
            else if (soft.includes('cliente')) { software = 'ERP cliente'; softCls = 'obl-soft-cliente'; }
            else if (soft.includes('hacienda')) { software = 'Hacienda'; softCls = 'obl-soft-hacienda'; }
            else if (soft) software = m.software;
            // Exonerado (Sí / No) del registro de la obligación: en SII el 347 y el 390 van exonerados
            const exo = this.normalizar(m.exonerado);
            grupos.get(g).push({
                key: g + '·' + m.modelo,
                id: m.id,
                itemCls: 'obl-ficha-item' + (excluido ? ' obl-ficha-item-amarilla' : '')
                    + (OBL_MODELOS_GRIS.includes(String(m.modelo)) ? ' obl-ficha-item-gris' : ''),
                modelo: m.modelo,
                desc: OBL_DESCRIPCIONES[m.modelo] || m.periodicidad || '',
                vencs: this.oblVencimientos(m),
                hayVencs: this.oblVencimientos(m).length > 0,
                territorio: m.territorio || '—',
                // Territorio como caja de color, con la misma paleta que los chips de la matriz
                territorioCls: 'obl-ficha-terr obl-w-terr' + (m.territorio
                    ? ' obl-terr-pill ' + this.oblTerrColorCls(m.territorio) : ' obl-terr-vacio'),
                // Asesor responsable del propio registro de la obligación
                asesorObl: m.asesor || '—',
                asesorOblCls: 'obl-ficha-terr obl-w-ase' + (m.asesor ? '' : ' obl-terr-vacio'),
                presenta: presenta || '—',
                presentaCls: presenta ? presentaCls : 'obl-ficha-pres obl-w-pres obl-pres-vacio',
                software: software || '—',
                softwareCls: software
                    ? 'obl-ficha-pres obl-w-soft ' + softCls
                    : 'obl-ficha-pres obl-w-soft obl-pres-vacio',
                modalidad: m.modalidad || '—',
                modalidadCls: 'obl-ficha-terr obl-w-modal' + (m.modalidad ? '' : ' obl-terr-vacio'),
                exonerado: exo === 'si' ? 'Sí' : (exo === 'no' ? 'No' : '—'),
                exoneradoCls: 'obl-ficha-pres obl-w-exo'
                    + (exo === 'si' ? ' obl-exo-si' : (exo === 'no' ? ' obl-exo-no' : ' obl-pres-vacio'))
            });
        });
        const secciones = orden.filter(g => grupos.has(g)).map(g => ({
            key: g,
            nombre: g,
            chip: this.oblChip(g === 'Pago a cuenta' ? 'Pago a cuenta' : g).letra,
            chipCls: this.oblChip(g === 'Pago a cuenta' ? 'Pago a cuenta' : g).cls,
            items: grupos.get(g).sort((a, b) => a.modelo.localeCompare(b.modelo, 'es'))
        }));
        return {
            empresa: c.empresa,
            sub: [c.cif, c.tipoEmpresa].filter(Boolean).join(' · '),
            n: this.fmtNumber((c.modelos || []).length),
            // Asesor responsable y empresa titular gestión del contrato
            detalle: [c.asesor, c.empresaTitular].filter(Boolean).join(' · '),
            // Nº del contrato contable y fiscal (enlazado a su registro), su territorio
            // fiscal como píldora de color y los recuentos de locales afectos y
            // actividades económicas de la empresa
            contratoId: c.contratoId,
            numero: c.numero || '—',
            territorioFiscal: c.territorioFiscal || 'Sin territorio fiscal',
            territorioFiscalCls: 'obl-ficha-tf ' + (c.territorioFiscal
                ? this.oblTerrColorCls(c.territorioFiscal) : 'obl-ficha-tf-vacio'),
            nLocales: this.fmtNumber(c.nLocales || 0),
            nActividades: this.fmtNumber(c.nActividades || 0),
            // Avisos de coherencia entre modelos, en una caja bajo la cabecera
            avisos,
            hayAvisos: avisos.length > 0 || !!notaTitular,
            notaTitular,
            avisosTitulo: avisos.length === 0 ? 'Sin incidencias'
                : (avisos.length === 1 ? '1 incidencia' : avisos.length + ' incidencias'),
            // Tipo de titular de la empresa, solo informativo, y su id para el enlace del nombre
            tipoTitular: c.tipoTitular || 'Sin tipo de titular',
            empresaId: c.empresaId,
            secciones
        };
    }
    handleOblFichaCerrar() { this.oblSelId = null; }

    // El número del modelo abre la ventana estándar de edición de Salesforce
    handleOblEditarStd(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: id, objectApiName: 'Impuestos__c', actionName: 'edit' }
        });
    }

    // Subpestañas de ERP Contable (segunda fila al pulsar su pestaña); el
    // Buzón contable es la primera y la vista inicial
    @track opeTabActiva = 'pyg';

    // Carga los datos de la subpestaña del ERP que lo necesite
    cargarOpeTab() {
        if (this.opeTabActiva === 'buzon' && !this.buzCargado) this.cargarBuz();
    }

    // Una cuenta pinchada en el PyG o el Balance abre el Libro mayor con su
    // empresa, cuenta y rango de fechas. El informe de origen queda montado
    // (oculto) para que al volver a su pestaña siga tal y como estaba.
    @track mayorParams = null;
    @track mayorOrigen = '';
    handleAbrirMayor(e) {
        this.mayorParams = e.detail;
        this.mayorOrigen = ['pyg', 'balance', 'sumas', 'plan'].includes(this.opeTabActiva) ? this.opeTabActiva : '';
        this.menuActivo = 'erp';
        this.opeTabActiva = 'mayor';
    }

    // El PyG y el Balance se mantienen vivos mientras se consulta el mayor
    // al que se saltó desde ellos; cualquier otra navegación los descarta
    get renderPyg() { return this.esBalPyg || (this.esBalMayor && this.mayorOrigen === 'pyg'); }
    get pygWrapCls() { return this.esBalPyg ? 'acf-balances' : 'acf-balances acf-oculto'; }
    get renderBalance() { return this.esBalBalance || (this.esBalMayor && this.mayorOrigen === 'balance'); }
    get balanceWrapCls() { return this.esBalBalance ? 'acf-balances' : 'acf-balances acf-oculto'; }
    get renderSumas() { return this.esBalSumas || (this.esBalMayor && this.mayorOrigen === 'sumas'); }
    get sumasWrapCls() { return this.esBalSumas ? 'acf-balances' : 'acf-balances acf-oculto'; }
    get renderPlan() { return this.esBalPlan || (this.esBalMayor && this.mayorOrigen === 'plan'); }
    get planWrapCls() { return this.esBalPlan ? 'acf-balances' : 'acf-balances acf-oculto'; }

    // Botón azul de la cabecera: abre la ventana de solicitud de ausencias
    @track solAbierta = false;
    handleSolicitarAusencia() { this.solAbierta = true; }
    handleSolCerrar() { this.solAbierta = false; }

    get opeTabs() {
        const tabs = [
            { key: 'pyg', label: 'Pérdidas y ganancias' },
            { key: 'pygmensual', label: 'Pérdidas y ganancias mensual' },
            { key: 'balance', label: 'Balance de situación' },
            { key: 'sumas', label: 'Sumas y Saldos' },
            { key: 'plan', label: 'Plan General Contable' },
            { key: 'mayor', label: 'Libro mayor' }
        ];
        return tabs.map(t => ({
            ...t,
            cls: t.key === this.opeTabActiva ? 'lm-subtab lm-subtab-active' : 'lm-subtab'
        }));
    }

    handleOpeTab(e) {
        const tab = e.currentTarget.dataset.tab;
        // La conservación del informe de origen solo aplica al salto al mayor
        // desde una cuenta: cualquier navegación manual la retira
        if (tab !== 'mayor') this.mayorOrigen = '';
        this.opeTabActiva = tab;
        this.cargarOpeTab();
    }

    // El ERP Contable virtual es ahora un menú superior propio
    get esBalOperativa() { return this.menuActivo === 'erp'; }

    get esVisionGeneral() { return this.esBalances && this.balTabActiva === 'vision'; }
    get esContabilidad() { return this.esBalances && this.balTabActiva === 'contabilidad'; }
    get esPrecierres() { return this.esBalances && this.balTabActiva === 'precierres'; }
    get esCierres() { return this.esBalances && this.balTabActiva === 'cierres'; }
    get esLibros() { return this.esBalances && this.balTabActiva === 'libros'; }
    get esCuentas() { return this.esBalances && this.balTabActiva === 'cuentas'; }
    get esRentas() { return this.esBalances && this.balTabActiva === 'rentas'; }
    get esContratosCF() { return this.esBalances && this.balTabActiva === 'contratoscf'; }
    get esBalPyg() { return this.esBalOperativa && this.opeTabActiva === 'pyg'; }
    get esBalPygMensual() { return this.esBalOperativa && this.opeTabActiva === 'pygmensual'; }
    get esBalMayor() { return this.esBalOperativa && this.opeTabActiva === 'mayor'; }
    get esBalBalance() { return this.esBalOperativa && this.opeTabActiva === 'balance'; }
    get esBalSumas() { return this.esBalOperativa && this.opeTabActiva === 'sumas'; }
    get esBalPlan() { return this.esBalOperativa && this.opeTabActiva === 'plan'; }
    // El buzón vive en su pestaña del Área Contable y Fiscal
    get esBalBuzon() {
        return this.esBalances && this.balTabActiva === 'buzon';
    }
    get esBalPlaceholder() {
        if (!this.esBalances) return false;
        return !['vision', 'contratoscf', 'contabilidad', 'buzon', 'precierres', 'cierres',
            'libros', 'cuentas', 'rentas', 'obligaciones'].includes(this.balTabActiva);
    }

    // ===== Pestaña Carga de trabajo: usuarios activos de Fiscal y Contable con
    // sus contratos no cerrados y sus obligaciones de alta por periodicidad =====
    @track ctData = [];
    @track ctCargado = false;
    @track ctLoading = false;
    @track ctError = null;
    @track ctBusqueda = '';

    // Empresas excluidas del cálculo ({ id, nombre }); se aplican en el servidor
    @track ctExcluidas = [];
    get hayCtExcluidas() { return this.ctExcluidas.length > 0; }
    // Empresas de los contratos del listado que aún no están excluidas
    get ctEmpresasOpciones() {
        const porId = new Map();
        this.ctData.filter(u => !u.esSinAsesor).forEach(u => (u.detalle || []).forEach(d => {
            if (d.empresaId && !porId.has(d.empresaId)) porId.set(d.empresaId, d.empresa || d.empresaId);
        }));
        this.ctExcluidas.forEach(x => porId.delete(x.id));
        return [{ key: 'ninguna', value: '', label: '— Excluir empresa —' }]
            .concat([...porId.entries()]
                .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                .map(([id, nombre]) => ({ key: id, value: id, label: nombre })));
    }
    handleCtExcluir(e) {
        const id = e.target.value;
        if (!id) return;
        const op = this.ctEmpresasOpciones.find(o => o.value === id);
        this.ctExcluidas = [...this.ctExcluidas, { id, nombre: op ? op.label : id }];
        e.target.value = '';
        this.cargarCt();
    }
    handleCtQuitarExcluida(e) {
        const id = e.currentTarget.dataset.id;
        this.ctExcluidas = this.ctExcluidas.filter(x => x.id !== id);
        this.cargarCt();
    }

    cargarCt() {
        this.ctLoading = true;
        this.ctError = null;
        getCargaTrabajo({ empresasExcluidas: this.ctExcluidas.map(x => x.id) })
            .then(res => { this.ctData = res || []; this.ctCargado = true; this.cargarCtMovs(); })
            .catch(err => { this.ctError = this.reduceError(err); })
            .finally(() => { this.ctLoading = false; });
    }
    handleCtRefresh() { this.cargarCt(); }
    handleCtBusqueda(e) { this.ctBusqueda = e.detail.value; }

    // Movimientos contables de Sage (últimos 12 meses) por código de empresa
    // del ERP: se piden aparte para que el listado no dependa de que Sage responda
    @track ctMovs = null;
    @track ctMovsCargando = false;
    @track ctMovsError = null;
    cargarCtMovs() {
        this.ctMovsCargando = true;
        this.ctMovsError = null;
        getMovimientosContables12m()
            .then(res => { this.ctMovs = res || {}; })
            .catch(err => { this.ctMovsError = this.reduceError(err); })
            .finally(() => { this.ctMovsCargando = false; });
    }
    get hasCtMovsError() { return !!this.ctMovsError; }
    // Movimientos de los códigos ERP de los contratos del usuario: total,
    // manuales (EN/ES), automáticos (el resto) y % de automatización
    ctMovimientosDe(codigos) {
        if (!this.ctMovs) return { total: null, manual: null, auto: null, pct: null };
        let total = 0, manual = 0;
        (codigos || []).forEach(c => {
            const m = this.ctMovs[String(c)];
            if (!m) return;
            total += Number(m.total) || 0;
            manual += Number(m.manual) || 0;
        });
        const auto = total - manual;
        return { total, manual, auto, pct: total > 0 ? (auto / total) * 100 : null };
    }
    ctFmtMovs(v) {
        if (v == null) return this.ctMovsCargando ? '…' : '—';
        return this.fmtNumber(v);
    }
    // Celdas de Contabilidad Sage: mientras se leen los movimientos llevan un fondo
    // animado, para que se note que esa parte de la tabla sigue cargando
    get ctSageTdCls() { return 'acf-td-der' + (this.ctMovsCargando ? ' ct-sage-cargando' : ''); }
    ctFmtPctMovs(v) {
        if (v == null) return this.ctMovs ? '—' : (this.ctMovsCargando ? '…' : '—');
        return this.ctFmtPct(v);
    }
    // Semáforo del % de automatización: verde claro desde el 90 %, naranja
    // claro del 80 al 90, rojo claro del 60 al 80 y rojo intenso por debajo del 60
    ctAutoCls(pct) {
        if (pct == null) return 'acf-td-der';
        if (pct >= 90) return 'acf-td-der ct-auto-ok';
        if (pct >= 80) return 'acf-td-der ct-auto-warn';
        if (pct >= 60) return 'acf-td-der ct-auto-bad';
        return 'acf-td-der ct-auto-critico';
    }

    // Subpestañas del Área RR.HH: Visión general (el panel de siempre) y Carga de trabajo
    @track rhTab = 'vision';
    handleRhTab(e) {
        this.rhTab = e.currentTarget.dataset.tab;
        if (this.rhTab === 'cargatrabajo' && !this.ctCargado && !this.ctLoading) this.cargarCt();
        // Si se entró al área por la vista de movimientos, el panel aún no está cargado
        if (this.rhTab === 'vision' && !this.rhCargado && !this.rhLoading) this.cargarRh();
    }
    get esRhVision() { return this.esRrhh && this.rhTab === 'vision'; }
    get rhTabVisionCls() { return 'lm-subtab' + (this.rhTab === 'vision' ? ' lm-subtab-active' : ''); }
    get rhTabCargaCls() { return 'lm-subtab' + (this.rhTab === 'cargatrabajo' ? ' lm-subtab-active' : ''); }

    // Filtro por empresa titular del usuario (desplegable con el nº de usuarios de cada una)
    @track ctTitularSel = '';
    handleCtTitular(e) { this.ctTitularSel = e.target.value; }
    get ctTitularOpciones() {
        const porTitular = new Map();
        this.ctData.filter(u => !u.esSinAsesor).forEach(u => {
            const k = u.empresaTitular || 'Sin empresa titular';
            porTitular.set(k, (porTitular.get(k) || 0) + 1);
        });
        const sel = this.ctTitularSel;
        return [{ key: 'todas', value: '', label: '— Empresa titular —', sel: !sel }]
            .concat([...porTitular.entries()]
                .sort((a, b) => a[0].localeCompare(b[0], 'es'))
                .map(([k, n]) => ({ key: k, value: k, label: k + ' (' + n + ')', sel: sel === k })));
    }
    get esCargaTrabajo() { return this.esRrhh && this.rhTab === 'cargatrabajo'; }
    get ctHasError() { return !!this.ctError; }
    get ctShow() { return this.esCargaTrabajo && !this.ctLoading && !this.ctError; }

    // Orden por columna al pinchar la cabecera (asc → desc → sin orden)
    @track ctOrdenCol = '';
    @track ctOrdenDir = 'asc';
    handleCtOrden(e) {
        const col = e.currentTarget.dataset.col;
        if (this.ctOrdenCol !== col) {
            this.ctOrdenCol = col;
            this.ctOrdenDir = 'asc';
        } else if (this.ctOrdenDir === 'asc') {
            this.ctOrdenDir = 'desc';
        } else {
            this.ctOrdenCol = '';
        }
    }
    ctOrdenIcono(col) {
        if (this.ctOrdenCol !== col) return '↕';
        return this.ctOrdenDir === 'asc' ? '▲' : '▼';
    }
    get ctCabeceras() {
        return [
            { key: 'nombre', label: 'Usuario', cls: 'acf-th-izq acf-th-orden' },
            { key: 'empresaTitular', label: 'Empresa titular usuario', cls: 'acf-th-izq acf-th-orden' },
            { key: 'contratos', label: 'Nº Contratos', cls: 'acf-th-cen acf-th-orden' },
            { key: 'contratosGestion', label: 'Gestión contable y fiscal', cls: 'acf-th-cen acf-th-orden' },
            { key: 'contratosConsultoria', label: 'Consultoría', cls: 'acf-th-cen acf-th-orden' },
            { key: 'sii', label: 'SII', cls: 'acf-th-cen acf-th-orden' },
            { key: 'mensuales', label: 'Mensuales', cls: 'acf-th-cen acf-th-orden' },
            { key: 'trimestrales', label: 'Trimestrales', cls: 'acf-th-cen acf-th-orden' },
            { key: 'anuales', label: 'Anuales', cls: 'acf-th-cen acf-th-orden' },
            { key: 'modelo200', label: 'Modelo 200', cls: 'acf-th-cen acf-th-orden' },
            { key: 'total', label: 'Total obligaciones', cls: 'acf-th-cen acf-th-orden' },
            { key: 'movimientos', label: 'Movimientos contables', cls: 'acf-th-der acf-th-orden' },
            { key: 'movsManual', label: 'Manual', cls: 'acf-th-der acf-th-orden' },
            { key: 'movsAuto', label: 'Automático', cls: 'acf-th-der acf-th-orden' },
            { key: 'automatizacion', label: '% Automatización', cls: 'acf-th-der acf-th-orden' },
            { key: 'tareasLegales', label: 'Tareas legales presentadas', cls: 'acf-th-cen acf-th-orden' },
            { key: 'igualasAnuales', label: 'Igualas anuales', cls: 'acf-th-der acf-th-orden' },
            { key: 'salarioBrutoAnual', label: 'Coste anual', cls: 'acf-th-der acf-th-orden' },
            { key: 'diferencia', label: 'Diferencia', cls: 'acf-th-der acf-th-orden' },
            { key: 'margen', label: '% margen', cls: 'acf-th-der acf-th-orden' }
        ].map(c => ({ ...c, label: c.label + ' ' + this.ctOrdenIcono(c.key) }));
    }

    // Usuarios filtrados y ordenados; la fila "Sin asesor" va siempre fija al
    // final, al margen de filtros, orden y totales
    get ctMostradas() {
        const sinAsesor = this.ctData.find(u => u.esSinAsesor);
        const usuarios = this.ctUsuariosMostrados;
        if (!sinAsesor) return usuarios;
        return [...usuarios, {
            ...sinAsesor,
            usuarioId: 'sinasesor',
            empresaTitular: '—',
            igualasAnuales: null,
            salarioBrutoAnual: null,
            diferencia: null,
            margen: null,
            movimientos: null,
            movsManual: null,
            movsAuto: null,
            automatizacion: null,
            total: (sinAsesor.mensuales || 0) + (sinAsesor.trimestrales || 0)
                + (sinAsesor.anuales || 0) + (sinAsesor.sii || 0)
        }];
    }
    get ctUsuariosMostrados() {
        const t = this.normalizar(this.ctBusqueda);
        let filas = this.ctData.filter(u => !u.esSinAsesor).map(u => {
            const movs = this.ctMovimientosDe(u.codigosErp);
            const igualas = Number(u.igualasAnuales) || 0;
            // Sin ficha de empleado no hay coste: la diferencia y el margen quedan sin calcular
            const conCoste = u.salarioBrutoAnual != null;
            const salario = conCoste ? Number(u.salarioBrutoAnual) || 0 : null;
            const diferencia = conCoste ? igualas - salario : null;
            return {
                ...u,
                empresaTitular: u.empresaTitular || 'Sin empresa titular',
                igualasAnuales: igualas,
                salarioBrutoAnual: salario,
                diferencia,
                // Margen sobre las igualas: (igualas - coste) / igualas
                margen: conCoste && igualas > 0 ? (diferencia / igualas) * 100 : null,
                total: (u.mensuales || 0) + (u.trimestrales || 0) + (u.anuales || 0) + (u.sii || 0),
                // Movimientos contables de Sage de los códigos ERP de sus contratos
                movimientos: movs.total,
                movsManual: movs.manual,
                movsAuto: movs.auto,
                automatizacion: movs.pct
            };
        });
        if (this.ctTitularSel) filas = filas.filter(u => u.empresaTitular === this.ctTitularSel);
        if (t) {
            filas = filas.filter(u => this.normalizar(u.nombre || '').includes(t)
                || this.normalizar(u.empresaTitular).includes(t));
        }
        if (this.ctOrdenCol) {
            const col = this.ctOrdenCol;
            const dir = this.ctOrdenDir === 'asc' ? 1 : -1;
            filas = [...filas].sort((a, b) => (typeof a[col] === 'number'
                ? dir * ((a[col] || 0) - (b[col] || 0))
                : dir * String(a[col] || '').localeCompare(String(b[col] || ''), 'es')));
        }
        return filas;
    }
    // ===== Vista de tareas legales presentadas de un usuario (sustituye a la tabla
    // de Carga de trabajo mientras está abierta; se vuelve con el botón amarillo) =====
    @track ctTlAbierto = false;
    @track ctTlNombre = '';
    @track ctTlData = [];
    @track ctTlLoading = false;
    @track ctTlError = null;
    handleCtTareasLegales(e) {
        const usuarioId = e.currentTarget.dataset.usuario;
        this.ctTlNombre = e.currentTarget.dataset.nombre || '';
        this.ctTlAbierto = true;
        this.ctTlLoading = true;
        this.ctTlError = null;
        this.ctTlData = [];
        getTareasLegalesUsuario({ usuarioId })
            .then(res => { this.ctTlData = res || []; })
            .catch(err => { this.ctTlError = this.reduceError(err); })
            .finally(() => { this.ctTlLoading = false; });
    }
    handleCtTlCerrar() { this.ctTlAbierto = false; }
    get ctTlHasError() { return !!this.ctTlError; }
    get ctTlHay() { return !this.ctTlLoading && !this.ctTlError && this.ctTlData.length > 0; }
    get ctTlVacio() { return !this.ctTlLoading && !this.ctTlError && this.ctTlData.length === 0; }
    get ctTlTitulo() {
        const n = this.ctTlData.length;
        return 'Tareas legales presentadas · ' + this.ctTlNombre
            + (this.ctTlLoading ? '' : ' (' + this.fmtNumber(n) + ')');
    }
    // Gráfico de barras: nº de tareas por mes de vencimiento en los últimos doce meses
    // (el actual incluido); la barra más alta marca el 100 %
    get ctTlMeses() {
        const hoy = new Date();
        const meses = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            meses.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 });
        }
        this.ctTlData.forEach(t => {
            if (!t.vencimiento) return;
            const [y, m] = String(t.vencimiento).split('-').map(Number);
            const mes = meses.find(x => x.y === y && x.m === m - 1);
            if (mes) mes.n += 1;
        });
        const max = Math.max(1, ...meses.map(x => x.n));
        return meses.map(x => ({
            key: x.y + '-' + x.m,
            label: MESES[x.m].slice(0, 3) + ' ' + String(x.y).slice(-2),
            nFmt: x.n ? this.fmtNumber(x.n) : '',
            title: MESES[x.m] + ' ' + x.y + ': ' + this.fmtNumber(x.n) + (x.n === 1 ? ' tarea' : ' tareas'),
            style: 'height: ' + Math.round((x.n / max) * 100) + '%'
        }));
    }
    // Ya vienen de la más reciente a la más antigua por fecha de vencimiento
    get ctTlRows() {
        return this.ctTlData.map((t, i) => ({
            ...t,
            key: t.id,
            num: i + 1,
            vencimientoFmt: t.vencimiento ? this.fmtFecha(t.vencimiento) : '—',
            vencimientoLegalFmt: t.vencimientoLegal ? this.fmtFecha(t.vencimientoLegal) : '—',
            relacionado: t.relacionado || '—',
            tituloRelacionado: t.tituloRelacionado || '—',
            estado: t.estado || '—'
        }));
    }

    // ===== Vista de movimientos contables de Sage (gráficos) =====
    // El nº de movimientos de cada línea (usuario o contrato) abre esta vista en
    // una pestaña nueva del navegador con los códigos ERP en la URL
    // (?acfMovs=344,390&acfMovsNombre=...), así se puede refrescar y dejar abierta.
    // Cuatro gráficos: movimientos por mes (todos, manuales y automáticos) y el
    // acumulado por usuario de Sage que grabó el movimiento. Pinchar un usuario
    // filtra los tres gráficos mensuales; pinchar un mes filtra el de usuarios.
    @track ctMvAbierto = false;
    @track ctMvCodigos = [];
    @track ctMvNombre = '';
    @track ctMvData = null;
    @track ctMvLoading = false;
    @track ctMvError = null;
    @track ctMvUsuarioSel = null;
    // Meses marcados en las barras: se pueden marcar varios y los paneles de usuarios y
    // tipos de entrada acumulan los movimientos de todos ellos
    @track ctMvMesesSel = [];
    @track ctMvTipoSel = null; // 'manual' | 'auto' | null, desde las cajas Manuales y Automáticos de la cabecera
    @track ctMvEntradaSel = null; // código de tipo de entrada de Sage (EN, ES, FC...) marcado en su caja
    @track ctMvVerTabla = false;

    // Parámetros de la URL con los que otra pestaña pide abrir una vista al cargar
    // (misma función en c/acfInicio, que es quien descarga este componente en el sitio)
    navegacionDesdeUrl() {
        try {
            const p = new URLSearchParams(window.location.search);
            const movs = p.get('acfMovs');
            if (!movs) return null;
            return {
                accion: 'movs',
                codigos: movs.split(',').map(x => x.trim()).filter(Boolean),
                nombre: p.get('acfMovsNombre') || ''
            };
        } catch (e) {
            return null;
        }
    }

    handleCtMovs(e) {
        e.preventDefault();
        e.stopPropagation();
        const codigos = String(e.currentTarget.dataset.codigos || '').split(',').map(x => x.trim()).filter(Boolean);
        const nombre = e.currentTarget.dataset.nombre || '';
        if (!codigos.length) return;
        let abierta = null;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('acfMovs', codigos.join(','));
            url.searchParams.set('acfMovsNombre', nombre);
            abierta = window.open(url.toString(), '_blank');
        } catch (err) {
            abierta = null;
        }
        // Si el navegador bloquea la pestaña nueva, la vista se abre aquí mismo
        if (!abierta) this.abrirCtMovs(codigos, nombre);
    }
    abrirCtMovs(codigos, nombre) {
        this.ctMvCodigos = (codigos || []).map(Number).filter(n => Number.isInteger(n));
        this.ctMvNombre = nombre || '';
        this.ctMvUsuarioSel = null;
        this.ctMvMesesSel = [];
        this.ctMvTipoSel = null;
        this.ctMvEntradaSel = null;
        this.ctMvData = null;
        this.ctMvAbierto = true;
        this.cargarCtMv();
    }
    // Detalle de la vista (no confundir con cargarCtMovs, que alimenta la columna de la tabla)
    cargarCtMv() {
        if (!this.ctMvCodigos.length) return;
        this.ctMvLoading = true;
        this.ctMvError = null;
        getMovimientosContablesDetalle({ codigosEmpresa: this.ctMvCodigos })
            .then(res => { this.ctMvData = res || { desde: null, filas: [] }; })
            .catch(err => { this.ctMvError = this.reduceError(err); })
            .finally(() => { this.ctMvLoading = false; });
    }
    handleCtMvRefresh() { this.cargarCtMv(); }
    handleCtMvCerrar() {
        this.ctMvAbierto = false;
        // Abierta desde la URL, la tabla de Carga de trabajo aún no se ha cargado
        if (!this.ctCargado && !this.ctLoading) this.cargarCt();
    }
    handleCtMvUsuario(e) {
        const u = e.currentTarget.dataset.usuario;
        this.ctMvUsuarioSel = this.ctMvUsuarioSel === u ? null : u;
    }
    // Pinchar una barra la añade a la selección o la quita; varias barras marcadas se acumulan
    handleCtMvMes(e) {
        const m = e.currentTarget.dataset.mes;
        this.ctMvMesesSel = this.alternar(this.ctMvMesesSel, m);
    }
    handleCtMvQuitarFiltros() {
        this.ctMvUsuarioSel = null;
        this.ctMvMesesSel = [];
        this.ctMvTipoSel = null;
        this.ctMvEntradaSel = null;
    }
    // Caja de tipos de entrada de Sage: pinchar uno filtra el resto de gráficos
    handleCtMvEntrada(e) {
        const k = e.currentTarget.dataset.entrada;
        this.ctMvEntradaSel = this.ctMvEntradaSel === k ? null : k;
    }
    // Cajas de la cabecera: Manuales y Automáticos filtran los cuatro gráficos por tipo
    // de entrada (pinchar de nuevo lo quita); Movimientos vuelve a mostrar todo
    handleCtMvTipo(e) {
        const t = e.currentTarget.dataset.tipo || null;
        this.ctMvTipoSel = !t || this.ctMvTipoSel === t ? null : t;
    }
    handleCtMvTabla() { this.ctMvVerTabla = !this.ctMvVerTabla; }

    get ctMvHasError() { return !!this.ctMvError; }
    get ctMvCargandoInicial() { return this.ctMvLoading && !this.ctMvData; }
    get ctMvHay() { return !!this.ctMvData && (this.ctMvData.filas || []).length > 0; }
    get ctMvVacio() {
        return !this.ctMvLoading && !this.ctMvError && !!this.ctMvData && (this.ctMvData.filas || []).length === 0;
    }
    // Al refrescar se mantiene lo pintado, atenuado, en vez de un parpadeo en blanco
    get ctMvClsCuerpo() { return 'ct-mv-cuerpo' + (this.ctMvLoading && this.ctMvData ? ' ct-mv-refrescando' : ''); }
    get ctMvTablaBtn() { return this.ctMvVerTabla ? 'Ocultar tablas' : 'Ver tablas'; }
    get ctMvTitulo() {
        return 'Movimientos contables · ' + (this.ctMvNombre || ('Códigos ERP ' + this.ctMvCodigos.join(', ')));
    }
    get ctMvSubtitulo() {
        const desde = this.ctMvData && this.ctMvData.desde ? this.fmtFecha(this.ctMvData.desde) : '';
        // Sin la lista de códigos ERP: con muchos contratos ocupaba toda la línea y no aportaba
        const empresas = this.ctMvCodigos.length === 1 ? 'de la empresa' : 'de sus ' + this.fmtNumber(this.ctMvCodigos.length) + ' empresas';
        return 'Movimientos de Sage ' + empresas
            + (desde ? ' desde el ' + desde + ' hasta hoy' : ' de los últimos doce meses')
            + ', por mes del asiento. Manuales: entradas EN y ES; el resto, automáticos.';
    }

    // Todo el cálculo de la vista en una pasada por las filas, cacheado por datos
    // y filtros: los getters de los gráficos leen de aquí y no recorren nada
    get ctMvCalc() {
        const data = this.ctMvData;
        const firma = JSON.stringify([this.ctMvUsuarioSel, this.ctMvMesesSel, this.ctMvTipoSel, this.ctMvEntradaSel]);
        if (this.ctMvCache && this.ctMvCacheData === data && this.ctMvCacheFirma === firma) return this.ctMvCache;
        const filas = (data && data.filas) || [];
        const hoy = new Date();
        // Meses del periodo: del mes de inicio al actual
        let ini = { y: hoy.getFullYear() - 1, m: hoy.getMonth() };
        if (data && data.desde) {
            const [y, m] = String(data.desde).split('-').map(Number);
            if (y && m) ini = { y, m: m - 1 };
        }
        const fin = { y: hoy.getFullYear(), m: hoy.getMonth() };
        const meses = [];
        const idx = new Map();
        for (let y = ini.y, m = ini.m, guard = 0; (y < fin.y || (y === fin.y && m <= fin.m)) && guard < 60; guard++) {
            const key = y + '-' + (m + 1);
            idx.set(key, meses.length);
            meses.push({ key, y, m, total: 0, manual: 0, auto: 0 });
            m += 1;
            if (m > 11) { m = 0; y += 1; }
        }
        // Asientos con fecha posterior al mes actual (amortizaciones y previsiones ya
        // contabilizadas para años venideros): una sola barra al final para que no
        // estiren el eje; cuentan en los totales igual que en la columna de la tabla
        const post = { key: 'post', y: fin.y, m: fin.m, total: 0, manual: 0, auto: 0, posterior: true };
        const esPosterior = f => f.anio > fin.y || (f.anio === fin.y && f.mes - 1 > fin.m);
        let hayPosterior = false;
        const uSel = this.ctMvUsuarioSel;
        const mSel = this.ctMvMesesSel;
        const tSel = this.ctMvTipoSel;
        const eSel = this.ctMvEntradaSel;
        const usuarios = new Map();
        // Conceptos de los tipos de entrada que no están en la tabla de Sage
        const conceptos = { IO: 'Liquidación de IVA', NO: 'Nóminas', sin: 'Sin tipo de entrada' };
        const entradas = new Map();
        let total = 0, manual = 0;
        filas.forEach(f => {
            const posterior = esPosterior(f);
            if (posterior) hayPosterior = true;
            const key = posterior ? 'post' : f.anio + '-' + f.mes;
            const uKey = f.usuario == null ? 'sin' : String(f.usuario);
            const eKey = f.tipoEntrada ? String(f.tipoEntrada) : 'sin';
            const n = Number(f.n) || 0;
            total += n;
            if (f.manual) manual += n;
            // Filtros cruzados: tipo (cajas de la cabecera), tipo de entrada, usuario y mes;
            // cada gráfico aplica todos menos el suyo, y los totales de la cabecera ninguno
            const pasaTipo = tSel == null || (f.manual ? 'manual' : 'auto') === tSel;
            const pasaEntrada = eSel == null || eKey === eSel;
            const pasaUsuario = uSel == null || uKey === uSel;
            const pasaMes = mSel.length === 0 || mSel.includes(key);
            // Serie mensual
            if (pasaTipo && pasaEntrada && pasaUsuario) {
                const i = idx.get(key);
                const mes = posterior ? post : (i != null ? meses[i] : null);
                if (mes) {
                    mes.total += n;
                    if (f.manual) mes.manual += n; else mes.auto += n;
                }
            }
            // Acumulado por usuario
            if (pasaTipo && pasaEntrada && pasaMes) {
                let u = usuarios.get(uKey);
                if (!u) {
                    const nombre = f.usuarioNombre || (uKey === 'sin' ? 'Sin usuario' : 'Usuario ' + uKey);
                    u = { key: uKey, nombre, total: 0, manual: 0, auto: 0 };
                    usuarios.set(uKey, u);
                }
                u.total += n;
                if (f.manual) u.manual += n; else u.auto += n;
            }
            // Acumulado por tipo de entrada, con su concepto
            if (pasaTipo && pasaUsuario && pasaMes) {
                let t = entradas.get(eKey);
                if (!t) {
                    const nombre = f.tipoEntradaDesc || conceptos[eKey] || ('Tipo ' + eKey);
                    t = { key: eKey, codigo: eKey === 'sin' ? '—' : eKey, nombre, manual: !!f.manual, total: 0 };
                    entradas.set(eKey, t);
                }
                t.total += n;
            }
        });
        if (hayPosterior) meses.push(post);
        const lista = [...usuarios.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
        const listaEntradas = [...entradas.values()].sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo));
        const res = { meses, usuarios: lista, entradas: listaEntradas, total, manual, auto: total - manual };
        this.ctMvCache = res;
        this.ctMvCacheData = data;
        this.ctMvCacheFirma = firma;
        return res;
    }

    // Cabecera: total, manuales, automáticos y % de automatización del periodo, sin filtros
    get ctMvKpis() {
        const c = this.ctMvCalc;
        const sel = this.ctMvTipoSel;
        const pct = c.total > 0 ? (c.auto / c.total) * 100 : null;
        const kpi = (key, label, valor, extra) => ({ key, label, valor, cls: 'ct-mv-kpi' + (extra || ''), clicable: false });
        // Manuales y Automáticos se marcan cuando filtran y la otra se atenúa
        const clsTipo = tipo => (tipo && sel === tipo ? ' ct-mv-kpi-sel ct-mv-kpi-sel-' + tipo : '')
            + (tipo && sel && sel !== tipo ? ' ct-mv-kpi-apagada' : '');
        const boton = (key, tipo, label, valor, title) => ({ ...kpi(key, label, valor, clsTipo(tipo)), clicable: true, tipo: tipo || '', title });
        return [
            boton('total', null, 'Movimientos', this.fmtNumber(c.total),
                sel ? 'Pinchar para volver a ver todos los movimientos' : 'Todos los movimientos del periodo'),
            boton('manual', 'manual', 'Manuales', this.fmtNumber(c.manual),
                sel === 'manual' ? 'Pinchar para quitar el filtro' : 'Pinchar para ver solo los manuales en los cuatro gráficos'),
            boton('auto', 'auto', 'Automáticos', this.fmtNumber(c.auto),
                sel === 'auto' ? 'Pinchar para quitar el filtro' : 'Pinchar para ver solo los automáticos en los cuatro gráficos'),
            kpi('pct', '% Automatización', this.ctFmtPct(pct), ' ' + this.ctAutoCls(pct).replace('acf-td-der', '').trim())
        ];
    }
    get ctMvHayFiltro() {
        return this.ctMvUsuarioSel != null || this.ctMvMesesSel.length > 0 || this.ctMvTipoSel != null || this.ctMvEntradaSel != null;
    }
    get ctMvFiltroTexto() {
        const partes = [];
        if (this.ctMvTipoSel) partes.push(this.ctMvTipoSel === 'manual' ? 'solo manuales' : 'solo automáticos');
        if (this.ctMvEntradaSel != null) {
            const t = this.ctMvCalc.entradas.find(x => x.key === this.ctMvEntradaSel);
            partes.push('tipo de entrada ' + (t ? t.codigo + ' (' + t.nombre + ')' : this.ctMvEntradaSel));
        }
        if (this.ctMvUsuarioSel != null) {
            const u = this.ctMvCalc.usuarios.find(x => x.key === this.ctMvUsuarioSel);
            partes.push('usuario ' + (u ? u.nombre : this.ctMvUsuarioSel));
        }
        if (this.ctMvMesesSel.length) {
            // Meses marcados en orden cronológico y la suma de sus movimientos (con el resto de filtros)
            const c = this.ctMvCalc;
            const marcados = c.meses.filter(x => this.ctMvMesesSel.includes(x.key));
            const nombres = marcados.map(x => (x.posterior ? 'posteriores' : this.ctMvEtiquetaMes(x)));
            const suma = marcados.reduce((acc, x) => acc + x.total, 0);
            partes.push((marcados.length === 1 ? 'mes ' : 'meses ') + nombres.join(' + ')
                + ' · ' + this.fmtNumber(suma) + ' movimientos acumulados');
        }
        return partes.join(' · ');
    }
    // Etiqueta corta y título largo de un mes del eje (la barra final agrupa los asientos
    // con fecha posterior al mes actual)
    ctMvEtiquetaMes(x) {
        if (x.posterior) return 'Post.';
        return MESES[x.m].slice(0, 3) + ' ' + String(x.y).slice(-2);
    }
    ctMvNombreMes(x) {
        if (x.posterior) return 'Asientos con fecha posterior a ' + MESES[x.m] + ' ' + x.y + ' (amortizaciones y previsiones ya contabilizadas)';
        return MESES[x.m] + ' ' + x.y;
    }
    // Números cortos para las etiquetas de las barras (el tooltip lleva el exacto)
    ctMvFmtCorto(n) {
        if (!n) return '0';
        if (n >= 100000) return this.fmtNumber(Math.round(n / 1000)) + ' k';
        if (n >= 10000) return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n / 1000) + ' k';
        return this.fmtNumber(n);
    }
    // Los tres gráficos mensuales: todos, manuales y automáticos, cada uno a su escala
    get ctMvGraficos() {
        const c = this.ctMvCalc;
        const sel = this.ctMvMesesSel;
        const tSel = this.ctMvTipoSel;
        const defs = [
            { campo: 'total', titulo: 'Movimientos contables por mes', unidad: 'movimientos' },
            { campo: 'manual', titulo: 'Movimientos manuales por mes', unidad: 'manuales' },
            { campo: 'auto', titulo: 'Movimientos automáticos por mes', unidad: 'automáticos' }
        ];
        return defs.map(d => {
            const max = Math.max(1, ...c.meses.map(x => x[d.campo]));
            const suma = c.meses.reduce((s, x) => s + x[d.campo], 0);
            return {
                campo: d.campo,
                titulo: d.titulo,
                total: this.fmtNumber(suma),
                // Con el filtro por tipo, el gráfico del otro tipo queda atenuado (se queda a cero)
                cls: 'acf-card ct-mv-card' + (tSel && d.campo !== 'total' && d.campo !== tSel ? ' ct-mv-card-apagada' : ''),
                barras: c.meses.map(x => {
                    const v = x[d.campo];
                    return {
                        key: x.key,
                        label: this.ctMvEtiquetaMes(x),
                        nFmt: this.ctMvFmtCorto(v),
                        title: this.ctMvNombreMes(x) + ': ' + this.fmtNumber(v) + ' ' + d.unidad
                            + (sel.includes(x.key) ? ' · pinchar para quitarlo de la selección'
                                : ' · pinchar para sumarlo a la selección (se pueden marcar varios meses)'),
                        style: 'height: ' + Math.round((v / max) * 100) + '%',
                        cls: 'ct-mv-barra ct-mv-barra-' + d.campo
                            + (x.posterior ? ' ct-mv-barra-post' : '')
                            + (sel.length && !sel.includes(x.key) ? ' ct-mv-apagada' : '')
                            + (sel.includes(x.key) ? ' ct-mv-sel' : '')
                    };
                })
            };
        });
    }
    // Acumulado por usuario de Sage, de mayor a menor, con su parte manual y automática
    get ctMvUsuarios() {
        const c = this.ctMvCalc;
        const max = Math.max(1, ...c.usuarios.map(u => u.total));
        const suma = c.usuarios.reduce((s, u) => s + u.total, 0);
        const sel = this.ctMvUsuarioSel;
        return c.usuarios.map(u => ({
            key: u.key,
            nombre: u.nombre,
            totalFmt: this.fmtNumber(u.total),
            // Peso del usuario sobre el total de los usuarios mostrados
            pctFmt: this.ctFmtPct(suma > 0 ? (u.total / suma) * 100 : null),
            title: u.nombre + ': ' + this.fmtNumber(u.total) + ' movimientos (' + this.fmtNumber(u.manual)
                + ' manuales, ' + this.fmtNumber(u.auto) + ' automáticos), '
                + this.ctFmtPct(suma > 0 ? (u.total / suma) * 100 : null) + ' del total'
                + (sel === u.key ? ' · pinchar para quitar el filtro'
                    : ' · pinchar para ver solo sus movimientos en los gráficos por mes'),
            manualStyle: 'width: ' + ((u.manual / max) * 100).toFixed(2) + '%',
            autoStyle: 'width: ' + ((u.auto / max) * 100).toFixed(2) + '%',
            cls: 'ct-mv-usuario' + (sel === u.key ? ' ct-mv-usuario-sel' : '')
                + (sel && sel !== u.key ? ' ct-mv-usuario-apagado' : '')
        }));
    }
    get ctMvUsuariosTotal() {
        const c = this.ctMvCalc;
        const n = c.usuarios.length;
        return this.fmtNumber(c.usuarios.reduce((s, u) => s + u.total, 0))
            + ' · ' + this.fmtNumber(n) + (n === 1 ? ' usuario' : ' usuarios');
    }
    // Acumulado por tipo de entrada de Sage (EN, ES, FC...) con su concepto; la barra va
    // en naranja si el tipo es manual y en verde si es automático, como en el resto
    get ctMvEntradas() {
        const c = this.ctMvCalc;
        const max = Math.max(1, ...c.entradas.map(t => t.total));
        const suma = c.entradas.reduce((s, t) => s + t.total, 0);
        const sel = this.ctMvEntradaSel;
        return c.entradas.map(t => {
            const pct = this.ctFmtPct(suma > 0 ? (t.total / suma) * 100 : null);
            return {
                key: t.key,
                codigo: t.codigo,
                nombre: t.nombre,
                totalFmt: this.fmtNumber(t.total),
                pctFmt: pct,
                barStyle: 'width: ' + ((t.total / max) * 100).toFixed(2) + '%',
                segCls: 'ct-mv-seg ' + (t.manual ? 'ct-mv-seg-manual' : 'ct-mv-seg-auto'),
                title: t.codigo + ' · ' + t.nombre + ': ' + this.fmtNumber(t.total) + ' movimientos, ' + pct + ' del total'
                    + (t.manual ? ' · entrada manual' : ' · entrada automática')
                    + (sel === t.key ? ' · pinchar para quitar el filtro' : ' · pinchar para ver solo este tipo en los demás gráficos'),
                cls: 'ct-mv-entrada' + (sel === t.key ? ' ct-mv-entrada-sel' : '') + (sel && sel !== t.key ? ' ct-mv-entrada-apagada' : '')
            };
        });
    }
    get ctMvEntradasTotal() {
        const c = this.ctMvCalc;
        const n = c.entradas.length;
        return this.fmtNumber(c.entradas.reduce((s, t) => s + t.total, 0))
            + ' · ' + this.fmtNumber(n) + (n === 1 ? ' tipo' : ' tipos');
    }
    get ctMvTablaEntradas() {
        const suma = this.ctMvCalc.entradas.reduce((s, t) => s + t.total, 0);
        return this.ctMvCalc.entradas.map(t => ({
            key: t.key,
            codigo: t.codigo,
            nombre: t.nombre,
            clase: t.manual ? 'Manual' : 'Automática',
            total: this.fmtNumber(t.total),
            pct: this.ctFmtPct(suma > 0 ? (t.total / suma) * 100 : null)
        }));
    }
    // Lo mismo que pintan los gráficos, en tablas y con los filtros aplicados
    get ctMvTablaMeses() {
        return this.ctMvCalc.meses.map(x => ({
            key: x.key,
            mes: x.posterior ? 'Posteriores a ' + MESES[x.m] + ' ' + x.y : MESES[x.m] + ' ' + x.y,
            total: this.fmtNumber(x.total),
            manual: this.fmtNumber(x.manual),
            auto: this.fmtNumber(x.auto)
        }));
    }
    get ctMvTablaUsuarios() {
        const suma = this.ctMvCalc.usuarios.reduce((s, u) => s + u.total, 0);
        return this.ctMvCalc.usuarios.map(u => ({
            key: u.key,
            nombre: u.nombre,
            total: this.fmtNumber(u.total),
            pct: this.ctFmtPct(suma > 0 ? (u.total / suma) * 100 : null),
            manual: this.fmtNumber(u.manual),
            auto: this.fmtNumber(u.auto)
        }));
    }

    // Importes anuales sin decimales y porcentaje con un decimal
    ctFmtEur(v) {
        if (v == null) return '—';
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
    }
    ctFmtPct(v) {
        if (v == null) return '—';
        return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v) + ' %';
    }
    // Clase por signo: azul en positivo, rojo en negativo, neutra a cero o sin dato
    ctSignoCls(v) {
        if (v == null || v === 0) return 'acf-td-der';
        return 'acf-td-der' + (v > 0 ? ' ct-azul' : ' ct-neg');
    }
    // Usuarios ampliados: debajo de cada uno, una fila por contrato asignado
    @track ctExp = [];
    handleCtExp(e) { this.ctExp = this.alternar(this.ctExp, e.currentTarget.dataset.key); }

    // Escala de color de una celda: fondo azul cuya intensidad va del máximo
    // (intenso, letra blanca) a los valores bajos (claro); a cero, sin fondo
    ctEscalaStyle(v, max) {
        const n = Number(v) || 0;
        if (n <= 0 || !max) return '';
        const t = Math.min(n / max, 1);
        const alpha = (0.12 + 0.83 * t).toFixed(2);
        return 'background: rgba(11, 92, 171, ' + alpha + ');'
            + (t > 0.55 ? ' color: #ffffff; font-weight: 700;' : ' color: #0b1f3a;');
    }
    // Misma escala en verde (el de la cabecera de Productividad económica) para las
    // columnas económicas: solo los valores positivos llevan fondo; los negativos
    // siguen en rojo sin fondo y a cero o sin dato no hay color
    ctEscalaVerdeStyle(v, max) {
        const n = Number(v) || 0;
        if (n <= 0 || !max) return '';
        const t = Math.min(n / max, 1);
        const alpha = (0.12 + 0.83 * t).toFixed(2);
        return 'background: rgba(29, 111, 66, ' + alpha + ');'
            + (t > 0.55 ? ' color: #ffffff; font-weight: 700;' : ' color: #0b1f3a;');
    }

    // Misma escala en amarillo (el de la cabecera Contratos asignados) para Nº contratos, Gestión
    // contable y fiscal y Consultoría; el texto se queda oscuro porque el blanco sobre amarillo no se lee
    ctEscalaAmarilloStyle(v, max) {
        const n = Number(v) || 0;
        if (n <= 0 || !max) return '';
        const t = Math.min(n / max, 1);
        const alpha = (0.15 + 0.8 * t).toFixed(2);
        return 'background: rgba(240, 180, 0, ' + alpha + '); color: #3d2f00;' + (t > 0.55 ? ' font-weight: 700;' : '');
    }

    get ctRows() {
        const out = [];
        // Máximos de mensuales y trimestrales entre los usuarios mostrados, para la escala de color
        const usuarios = this.ctUsuariosMostrados;
        const maxMensuales = Math.max(0, ...usuarios.map(x => x.mensuales || 0));
        const maxTrimestrales = Math.max(0, ...usuarios.map(x => x.trimestrales || 0));
        const maxSii = Math.max(0, ...usuarios.map(x => x.sii || 0));
        // Nº contratos, Gestión contable y fiscal y Consultoría: escala amarilla, cada columna con su máximo
        const maxContratos = Math.max(0, ...usuarios.map(x => x.contratos || 0));
        const maxGestion = Math.max(0, ...usuarios.map(x => x.contratosGestion || 0));
        const maxConsultoria = Math.max(0, ...usuarios.map(x => x.contratosConsultoria || 0));
        // Anuales, Modelo 200 y Total obligaciones llevan la misma escala, cada columna con su máximo
        const maxAnuales = Math.max(0, ...usuarios.map(x => x.anuales || 0));
        const maxModelo200 = Math.max(0, ...usuarios.map(x => x.modelo200 || 0));
        const maxTotal = Math.max(0, ...usuarios.map(x => x.total || 0));
        // Columnas económicas en verde, cada una con su máximo (solo cuentan los positivos)
        const maxIgualas = Math.max(0, ...usuarios.map(x => x.igualasAnuales || 0));
        const maxSalario = Math.max(0, ...usuarios.map(x => x.salarioBrutoAnual || 0));
        const maxDiferencia = Math.max(0, ...usuarios.map(x => x.diferencia || 0));
        const maxMargen = Math.max(0, ...usuarios.map(x => x.margen || 0));
        this.ctMostradas.forEach((u, i) => {
            const expandible = !u.esSinAsesor && (u.detalle || []).length > 0;
            const expandido = expandible && this.ctExp.includes(u.usuarioId);
            out.push({
                ...u,
                key: u.usuarioId,
                // La fila "Sin asesor" no lleva numeración y va sombreada en ámbar
                idx: u.esSinAsesor ? '' : i + 1,
                filaCls: 'acf-row' + (u.esSinAsesor ? ' ct-sin-asesor' : ''),
                expandible,
                btn: expandido ? 'Cerrar' : 'Ampliar',
                contratosStyle: u.esSinAsesor ? '' : this.ctEscalaAmarilloStyle(u.contratos, maxContratos),
                gestionStyle: u.esSinAsesor ? '' : this.ctEscalaAmarilloStyle(u.contratosGestion, maxGestion),
                consultoriaStyle: u.esSinAsesor ? '' : this.ctEscalaAmarilloStyle(u.contratosConsultoria, maxConsultoria),
                mensualesStyle: u.esSinAsesor ? '' : this.ctEscalaStyle(u.mensuales, maxMensuales),
                trimestralesStyle: u.esSinAsesor ? '' : this.ctEscalaStyle(u.trimestrales, maxTrimestrales),
                siiStyle: u.esSinAsesor ? '' : this.ctEscalaStyle(u.sii, maxSii),
                anualesStyle: u.esSinAsesor ? '' : this.ctEscalaStyle(u.anuales, maxAnuales),
                modelo200Style: u.esSinAsesor ? '' : this.ctEscalaStyle(u.modelo200, maxModelo200),
                totalStyle: u.esSinAsesor ? '' : this.ctEscalaStyle(u.total, maxTotal),
                igualasStyle: u.esSinAsesor ? '' : this.ctEscalaVerdeStyle(u.igualasAnuales, maxIgualas),
                salarioStyle: u.esSinAsesor ? '' : this.ctEscalaVerdeStyle(u.salarioBrutoAnual, maxSalario),
                difStyle: u.esSinAsesor ? '' : this.ctEscalaVerdeStyle(u.diferencia, maxDiferencia),
                margenStyle: u.esSinAsesor ? '' : this.ctEscalaVerdeStyle(u.margen, maxMargen),
                igualasFmt: this.ctFmtEur(u.igualasAnuales),
                salarioFmt: this.ctFmtEur(u.salarioBrutoAnual),
                diferenciaFmt: this.ctFmtEur(u.diferencia),
                margenFmt: this.ctFmtPct(u.margen),
                // Igualas en azul (ingreso) y coste en rojo (gasto); diferencia y margen
                // en azul si son positivos y en rojo si el coste supera las igualas
                igualasCls: 'acf-td-der' + (u.igualasAnuales > 0 ? ' ct-azul' : ''),
                salarioCls: 'acf-td-der' + (u.salarioBrutoAnual != null ? ' ct-neg' : ''),
                difCls: this.ctSignoCls(u.diferencia),
                contratosFmt: this.fmtNumber(u.contratos || 0),
                gestionFmt: this.fmtNumber(u.contratosGestion || 0),
                consultoriaFmt: this.fmtNumber(u.contratosConsultoria || 0),
                mensualesFmt: this.fmtNumber(u.mensuales || 0),
                trimestralesFmt: this.fmtNumber(u.trimestrales || 0),
                anualesFmt: this.fmtNumber(u.anuales || 0),
                siiFmt: this.fmtNumber(u.sii || 0),
                modelo200Fmt: this.fmtNumber(u.modelo200 || 0),
                totalFmt: this.fmtNumber(u.total),
                movimientosFmt: u.esSinAsesor ? '—' : this.ctFmtMovs(u.movimientos),
                movsManualFmt: u.esSinAsesor ? '—' : this.ctFmtMovs(u.movsManual),
                movsAutoFmt: u.esSinAsesor ? '—' : this.ctFmtMovs(u.movsAuto),
                automatizacionFmt: u.esSinAsesor ? '—' : this.ctFmtPctMovs(u.automatizacion),
                autoCls: this.ctAutoCls(u.esSinAsesor ? null : u.automatizacion),
                // Tareas legales presentadas: el número abre la ventana con el detalle
                tareasLegalesFmt: u.esSinAsesor ? '—' : this.fmtNumber(u.tareasLegales || 0),
                tareasLegalesLink: !u.esSinAsesor && (u.tareasLegales || 0) > 0,
                // El nº de movimientos abre los gráficos de Sage de todos sus códigos ERP
                movsCodigos: (u.codigosErp || []).join(','),
                movsLink: !u.esSinAsesor && (u.movimientos || 0) > 0
            });
            if (!expandido) return;
            const resto = { mensuales: u.mensuales || 0, trimestrales: u.trimestrales || 0,
                anuales: u.anuales || 0, sii: u.sii || 0, modelo200: u.modelo200 || 0 };
            // Contratos propios y ajenos mezclados por nombre de empresa
            [...u.detalle].sort((a, b) => (a.empresa || '').localeCompare(b.empresa || '', 'es')).forEach(d => {
                out.push(this.ctFilaContrato(u, d));
                Object.keys(resto).forEach(k => { resto[k] -= d[k] || 0; });
            });
            // Obligaciones del usuario en contratos que llevan otros asesores:
            // no cuelgan de ningún contrato suyo, pero cuentan en sus totales
            if (Object.values(resto).some(v => v > 0)) {
                out.push(this.ctFilaContrato(u, {
                    contratoId: null, empresa: 'Obligaciones en contratos de otros asesores',
                    numero: '—', tipoServicio: null, cuotaMensual: null, codigoErp: null,
                    mensuales: Math.max(resto.mensuales, 0), trimestrales: Math.max(resto.trimestrales, 0),
                    anuales: Math.max(resto.anuales, 0), sii: Math.max(resto.sii, 0),
                    modelo200: Math.max(resto.modelo200, 0)
                }));
            }
        });
        return out;
    }

    // Fila de detalle de un contrato bajo su usuario: la empresa en la columna
    // del usuario, el nº de contrato (enlace) en la de empresa titular, y en el
    // resto lo que aporta ese contrato a cada columna
    ctFilaContrato(u, d) {
        const esAsesoria = d.tipoServicio === 'Asesoría';
        const total = (d.mensuales || 0) + (d.trimestrales || 0) + (d.anuales || 0) + (d.sii || 0);
        // Movimientos de Sage solo si el contrato es de gestión contable y fiscal con código
        // Movimientos de Sage de la empresa siempre que el contrato tenga código ERP, sea de
        // gestión o de consultoría y sea propio o ajeno (los totales del usuario siguen sumando
        // solo los códigos de sus contratos de gestión contable y fiscal)
        const movs = d.codigoErp != null ? this.ctMovimientosDe([d.codigoErp]) : null;
        const igualas = d.cuotaMensual == null ? null : Number(d.cuotaMensual) * 12;
        const vacio = '—';
        return {
            key: u.usuarioId + '·' + (d.contratoId || 'resto'),
            esDetalle: true,
            contratoId: d.contratoId,
            idx: '',
            // Contrato de otro asesor en el que este usuario lleva obligaciones: fila ajena,
            // con el nombre del asesor del contrato y sin contar en sus contratos
            filaCls: 'acf-row ct-detalle' + (d.ajeno ? ' ct-detalle-ajeno' : ''),
            mensualesStyle: '',
            trimestralesStyle: '',
            siiStyle: '',
            nombre: (d.empresa || 'Sin empresa') + (d.ajeno ? ' · contrato de ' + (d.asesorContrato || 'otro asesor') : ''),
            empresaTitular: d.numero || vacio,
            expandible: false,
            btn: '',
            contratosFmt: d.contratoId && !d.ajeno ? '1' : '',
            gestionFmt: d.contratoId && !d.ajeno ? (esAsesoria ? '1' : '') : '',
            consultoriaFmt: d.contratoId && !d.ajeno ? (d.tipoServicio === 'Consultoría' ? '1' : '') : '',
            mensualesFmt: d.mensuales ? this.fmtNumber(d.mensuales) : '',
            trimestralesFmt: d.trimestrales ? this.fmtNumber(d.trimestrales) : '',
            anualesFmt: d.anuales ? this.fmtNumber(d.anuales) : '',
            siiFmt: d.sii ? this.fmtNumber(d.sii) : '',
            modelo200Fmt: d.modelo200 ? this.fmtNumber(d.modelo200) : '',
            totalFmt: total ? this.fmtNumber(total) : '',
            // El nº de movimientos abre los gráficos de Sage de este código ERP
            movsCodigos: d.codigoErp == null ? '' : String(d.codigoErp),
            movsLink: !!movs && (movs.total || 0) > 0,
            movimientosFmt: movs ? this.ctFmtMovs(movs.total) : vacio,
            movsManualFmt: movs ? this.ctFmtMovs(movs.manual) : vacio,
            movsAutoFmt: movs ? this.ctFmtMovs(movs.auto) : vacio,
            automatizacionFmt: movs ? this.ctFmtPctMovs(movs.pct) : vacio,
            autoCls: this.ctAutoCls(movs ? movs.pct : null),
            igualasFmt: igualas == null ? vacio : this.ctFmtEur(igualas),
            igualasCls: 'acf-td-der' + (igualas > 0 ? ' ct-azul' : ''),
            salarioFmt: vacio, salarioCls: 'acf-td-der',
            diferenciaFmt: vacio, margenFmt: vacio, difCls: 'acf-td-der'
        };
    }
    get ctHayFilas() { return this.ctMostradas.length > 0; }
    // Fila de totales sobre los usuarios mostrados (sin la fila "Sin asesor")
    get ctTotales() {
        const filas = this.ctUsuariosMostrados;
        const suma = k => this.fmtNumber(filas.reduce((s, u) => s + (u[k] || 0), 0));
        const sumaNum = k => filas.reduce((s, u) => s + (u[k] || 0), 0);
        // El coste y la diferencia totales solo suman a quienes tienen ficha de empleado
        const igualas = sumaNum('igualasAnuales');
        const conCoste = filas.filter(u => u.salarioBrutoAnual != null);
        const salario = conCoste.reduce((s, u) => s + u.salarioBrutoAnual, 0);
        const igualasConCoste = conCoste.reduce((s, u) => s + u.igualasAnuales, 0);
        const diferencia = igualasConCoste - salario;
        return {
            usuarios: this.fmtNumber(filas.length) + (filas.length === 1 ? ' usuario' : ' usuarios'),
            igualas: this.ctFmtEur(igualas),
            igualasCls: 'acf-td-der' + (igualas > 0 ? ' ct-azul' : ''),
            salario: conCoste.length ? this.ctFmtEur(salario) : '—',
            salarioCls: 'acf-td-der' + (conCoste.length ? ' ct-neg' : ''),
            diferencia: conCoste.length ? this.ctFmtEur(diferencia) : '—',
            difCls: this.ctSignoCls(conCoste.length ? diferencia : null),
            margen: conCoste.length && igualasConCoste > 0 ? this.ctFmtPct((diferencia / igualasConCoste) * 100) : '—',
            contratos: suma('contratos'), gestion: suma('contratosGestion'),
            consultoria: suma('contratosConsultoria'), mensuales: suma('mensuales'),
            trimestrales: suma('trimestrales'), anuales: suma('anuales'),
            sii: suma('sii'), modelo200: suma('modelo200'), total: suma('total'),
            tareasLegales: suma('tareasLegales'),
            movimientos: this.ctMovs ? this.fmtNumber(sumaNum('movimientos')) : this.ctFmtMovs(null),
            movsManual: this.ctMovs ? this.fmtNumber(sumaNum('movsManual')) : this.ctFmtMovs(null),
            movsAuto: this.ctMovs ? this.fmtNumber(sumaNum('movsAuto')) : this.ctFmtMovs(null),
            // % de automatización global: automáticos sobre el total de los mostrados
            automatizacion: this.ctMovs && sumaNum('movimientos') > 0
                ? this.ctFmtPct((sumaNum('movsAuto') / sumaNum('movimientos')) * 100)
                : this.ctFmtPctMovs(null),
            autoCls: this.ctAutoCls(this.ctMovs && sumaNum('movimientos') > 0
                ? (sumaNum('movsAuto') / sumaNum('movimientos')) * 100 : null)
        };
    }

    // ===== Pestaña Buzón contable =====
    @track buzData = [];
    @track buzCargado = false;
    @track buzLoading = false;
    @track buzError = null;
    @track buzBusqueda = '';

    cargarBuz() {
        this.buzLoading = true;
        this.buzError = null;
        getBuzonContable()
            .then(res => { this.buzData = res || []; this.buzCargado = true; })
            .catch(err => { this.buzError = this.reduceError(err); })
            .finally(() => { this.buzLoading = false; });
    }

    handleBuzRefresh() { this.cargarBuz(); }
    handleBuzBusqueda(e) { this.buzBusqueda = e.detail.value; }

    // Filtros cruzados: tipo de documentación, asesor responsable y estado
    @track buzTipoSel = '';
    @track buzAsesorSel = '';
    @track buzEstadoSel = '';

    buzFiltrar(usarTipo, usarAsesor, usarEstado) {
        let filas = this.buzData;
        if (usarTipo && this.buzTipoSel) {
            filas = filas.filter(b => (b.tipoDoc || 'SIN') === this.buzTipoSel);
        }
        if (usarAsesor && this.buzAsesorSel) {
            filas = filas.filter(b => (b.asesor || 'SIN') === this.buzAsesorSel);
        }
        if (usarEstado && this.buzEstadoSel) {
            filas = filas.filter(b => (b.estado || 'SIN') === this.buzEstadoSel);
        }
        return filas;
    }

    // Caja de total: quita los filtros y vuelve a mostrar todo el buzón
    get buzKpiTotal() { return this.fmtNumber(this.buzData.length); }
    handleBuzTotal() {
        this.buzTipoSel = '';
        this.buzAsesorSel = '';
        this.buzEstadoSel = '';
        this.buzBusqueda = '';
    }

    colorEstadoBuzon(estado) {
        if (estado === 'Sin clasificar') return 'rojo';
        if (estado === 'Sin periodo abierto') return 'amarillo';
        return 'azul';
    }

    // Cajas dinámicas: una por estado con registros, en orden de flujo
    get buzKpis() {
        const presentes = new Set(this.buzData.map(b => b.estado || 'SIN'));
        const estados = ORDEN_ESTADOS_BUZON.filter(e => presentes.has(e));
        presentes.forEach(e => { if (!estados.includes(e)) estados.push(e); });
        // Los números respetan el resto de filtros, pero no el de la propia caja
        const base = this.buzFiltrar(true, true, false);
        return estados.map(estado => {
            const color = this.colorEstadoBuzon(estado);
            return {
                estado,
                etiqueta: estado === 'SIN' ? 'Sin estado' : estado,
                n: this.fmtNumber(base.filter(b => (b.estado || 'SIN') === estado).length),
                cls: 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
                    + (this.buzEstadoSel === estado ? ' acf-kpi-active-' + color : '')
            };
        });
    }
    handleBuzKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.buzEstadoSel = this.buzEstadoSel === k ? '' : k;
    }

    // Lista de la izquierda: total por tipo de documentación
    get buzTipos() {
        return this.listaValores(this.buzFiltrar(false, true, true), b => b.tipoDoc || 'SIN',
            b => b.tipoDoc || 'Sin tipo', this.buzTipoSel, 'Todos los tipos');
    }
    handleBuzTipo(e) {
        const k = e.currentTarget.dataset.key;
        this.buzTipoSel = this.buzTipoSel === k ? '' : k;
    }

    // Lista de la izquierda: total por asesor responsable, en orden alfabético
    get buzAsesores() {
        const [todos, ...resto] = this.listaValores(this.buzFiltrar(true, false, true),
            b => b.asesor || 'SIN', b => b.asesor || 'Sin asesor',
            this.buzAsesorSel, 'Todos los asesores');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }
    handleBuzAsesor(e) {
        const k = e.currentTarget.dataset.key;
        this.buzAsesorSel = this.buzAsesorSel === k ? '' : k;
    }

    // Desplegable de tipo de documentación junto al buscador (misma selección)
    get buzTipoOpciones() {
        const porTipo = new Map();
        this.buzFiltrar(false, true, true).forEach(b => {
            const t = b.tipoDoc || 'SIN';
            porTipo.set(t, (porTipo.get(t) || 0) + 1);
        });
        const lista = [...porTipo.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'es'))
            .map(([t, n]) => ({ label: (t === 'SIN' ? 'Sin tipo' : t) + ' (' + n + ')', value: t }));
        return [{ label: 'Todos los tipos', value: '' }, ...lista];
    }
    handleBuzTipoCombo(e) { this.buzTipoSel = e.detail.value; }

    get buzHasError() { return !!this.buzError; }
    get buzShow() { return this.esBalBuzon && !this.buzLoading && !this.buzError; }

    get buzMostradas() {
        return this.aplicarBusqueda(this.buzFiltrar(true, true, true), this.buzBusqueda);
    }

    // Orden alfabético al pinchar la cabecera: empresa, tipo de
    // documentación o asesor responsable (asc → desc → sin orden)
    @track buzOrdenCol = '';
    @track buzOrdenDir = 'asc';
    handleBuzOrden(e) {
        const col = e.currentTarget.dataset.col;
        if (this.buzOrdenCol !== col) {
            this.buzOrdenCol = col;
            this.buzOrdenDir = 'asc';
        } else if (this.buzOrdenDir === 'asc') {
            this.buzOrdenDir = 'desc';
        } else {
            this.buzOrdenCol = '';
        }
    }
    buzOrdenIcono(col) {
        if (this.buzOrdenCol !== col) return '↕';
        return this.buzOrdenDir === 'asc' ? '▲' : '▼';
    }
    get buzOrdenEmpresaIcono() { return this.buzOrdenIcono('empresa'); }
    get buzOrdenTipoIcono() { return this.buzOrdenIcono('tipoDoc'); }
    get buzOrdenEstadoIcono() { return this.buzOrdenIcono('estado'); }
    get buzOrdenAsesorIcono() { return this.buzOrdenIcono('asesor'); }

    get buzRows() {
        let filas = this.buzMostradas;
        if (this.buzOrdenCol) {
            const col = this.buzOrdenCol;
            const dir = this.buzOrdenDir === 'asc' ? 1 : -1;
            filas = [...filas].sort((a, b) =>
                dir * String(a[col] || '').localeCompare(String(b[col] || ''), 'es'));
        }
        const hoy = this.hoyIso();
        return filas.map((b, i) => ({
            ...b,
            key: b.id,
            idx: i + 1,
            fechaFmt: this.fmtFecha(b.fecha),
            // Días transcurridos desde la creación, en rojo cuando pasa de cero
            dias: this.diasDesde(b.fecha),
            diasCls: 'acf-td-cen' + (String(b.fecha) < hoy ? ' acf-vto-vencido' : ''),
            // Cada tipo de documentación con su cajita de color claro (el
            // mismo color siempre para el mismo nombre, por su hash)
            tipoDocCls: b.tipoDoc ? 'buz-tipo buz-tipo-' + this.hashPaleta(b.tipoDoc, 8) : '',
            sitSym: b.situacion === 'ok' ? '✓' : b.situacion === 'cruz' ? '✗' : '',
            sitCls: 'acf-td-cen ' + (b.situacion === 'ok' ? 'acf-ct-ok' : b.situacion === 'cruz' ? 'acf-ct-cruz' : '')
        }));
    }

    // Índice estable de paleta a partir de un texto
    hashPaleta(texto, n) {
        let h = 0;
        const s = String(texto || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
        return h % n;
    }

    get buzHayFilas() { return this.buzMostradas.length > 0; }
    get buzTotalLabel() { return this.fmtNumber(this.buzMostradas.length) + ' registros'; }
    get balTabActivaLabel() {
        if (this.balTabActiva === 'operativa') {
            const o = this.opeTabs.find(x => x.key === this.opeTabActiva);
            return o ? o.label : '';
        }
        const t = this.balTabs.find(x => x.key === this.balTabActiva);
        return t ? t.label : '';
    }

    // ===== Pestaña Contabilidad y/o Consultoría =====
    @track contabData = [];
    @track contabCargado = false;
    @track contabLoading = false;
    @track contabError = null;
    @track contabAsesorSel = '';
    @track contabPendFiltro = '';

    cargarContab() {
        this.contabLoading = true;
        this.contabError = null;
        getContabilidadesAbiertas()
            .then(res => { this.contabData = res || []; this.contabCargado = true; })
            .catch(err => { this.contabError = this.reduceError(err); })
            .finally(() => { this.contabLoading = false; });
    }

    handleContabRefresh() { this.cargarContab(); }

    get contabHasError() { return !!this.contabError; }
    get contabShow() { return this.esContabilidad && !this.contabLoading && !this.contabError; }

    // Filtro combinable: cada lista de la izquierda se calcula con los filtros de las demás
    contabFiltrar(usarPend, usarPeriodo, usarAsesor, usarTipo = true, usarTitular = true) {
        return this.contabData.filter(c => {
            if (this.contabVencidasActivo && !this.contabEsVencida(c)) return false;
            if (usarTitular && this.contabTitularSel
                && (c.empresaTitularUsuario || 'SIN') !== this.contabTitularSel) return false;
            if (usarTipo && this.contabTipoSel
                && (c.tipoServicio || 'SIN') !== this.contabTipoSel) return false;
            if (usarPend && this.contabPendFiltro === 'emit' && !this.contabPendiente(c.emitColor)) return false;
            if (usarPend && this.contabPendFiltro === 'rec' && !this.contabPendiente(c.recColor)) return false;
            if (usarPend && this.contabPendFiltro === 'ban' && !this.contabPendiente(c.banColor)) return false;
            // Documentación pendiente: facturas emitidas, recibidas o bancos aún por recibir
            if (usarPend && this.contabPendFiltro === 'doc' && !this.contabDocPendiente(c)) return false;
            if (usarPeriodo && this.contabPeriodoSel
                && this.contabPeriodoKey(c) !== this.contabPeriodoSel) return false;
            if (usarAsesor && this.contabAsesorSel
                && (c.asesorId || 'SIN') !== this.contabAsesorSel) return false;
            // Desplegable de asesores con incluir/excluir
            if (usarAsesor && this.contabAsesoresSel.length) {
                const casa = this.contabAsesoresSel.includes(c.asesorId || 'SIN');
                if (this.contabAsesoresModo === 'excluir' ? casa : !casa) return false;
            }
            return true;
        });
    }

    contabPeriodoKey(c) {
        return (c.ejercicio || 'Sin año') + '·' + (c.periodicidad || 'Sin periodicidad');
    }

    // Vencida si su mes efectivo es anterior al mes pasado (misma regla que el Apex)
    contabEsVencida(c) {
        const anio = Number(c.ejercicio) || 0;
        if (!anio) return false;
        const mes = (PERIODOS_CONTAB[c.periodicidad] || [99, 12])[1];
        const hoy = new Date();
        return (anio * 12 + mes) < (hoy.getFullYear() * 12 + hoy.getMonth());
    }

    // "Fiscal sin gestión contable" se muestra como "Consultoría" (solo visual)
    contabTipoVisual(t) {
        return t === 'Fiscal sin gestión contable' ? 'Consultoría' : t;
    }

    // Base de la lista de usuarios: pendientes + periodo
    get contabBase() {
        return this.contabFiltrar(true, true, false);
    }

    // ===== Lista de año - periodicidad, de más antigua a más reciente =====
    @track contabPeriodoSel = '';

    get contabPeriodos() {
        const base = this.contabFiltrar(true, false, true);
        const porPeriodo = new Map();
        base.forEach(c => {
            const k = this.contabPeriodoKey(c);
            if (!porPeriodo.has(k)) {
                porPeriodo.set(k, { anio: Number(c.ejercicio) || 0, periodicidad: c.periodicidad || 'Sin periodicidad', n: 0 });
            }
            porPeriodo.get(k).n++;
        });
        const lista = [...porPeriodo.entries()].map(([key, v]) => {
            const info = PERIODOS_CONTAB[v.periodicidad] || [99, 12];
            return {
                key,
                label: (v.anio || '¿?') + ' - ' + v.periodicidad,
                n: v.n,
                orden: v.anio * 100 + info[0],
                vencida: this.contabEsVencida({ ejercicio: v.anio, periodicidad: v.periodicidad })
            };
        }).sort((a, b) => a.orden - b.orden);
        const items = [{ key: '', label: 'Todos los periodos', n: base.length, vencida: false }, ...lista];
        return items.map(it => ({
            ...it,
            cls: (it.key === this.contabPeriodoSel ? 'acf-user-item acf-user-item-active' : 'acf-user-item')
                + (it.vencida ? ' acf-periodo-vencido' : '')
        }));
    }

    handleContabPeriodo(e) {
        const k = e.currentTarget.dataset.key;
        this.contabPeriodoSel = this.contabPeriodoSel === k ? '' : k;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    // Lista de la izquierda con los totales por empresa titular del registro,
    // entre los periodos y los usuarios
    @track contabTitularSel = '';

    get contabTitulares() {
        const base = this.contabFiltrar(true, true, true, true, false);
        const [todos, ...resto] = this.listaValores(base, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular', this.contabTitularSel, 'Todas las empresas');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleContabTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.contabTitularSel = this.contabTitularSel === k ? '' : k;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    // Lista de asesores a la izquierda: solo los presentes en el resultado filtrado
    get contabAsesores() {
        return this.listaAsesores(this.contabBase, this.contabAsesorSel);
    }

    handleContabAsesor(e) { this.contabAsesorSel = e.currentTarget.dataset.key; }

    // Filtro desplegable por asesor responsable (multiselección con incluir/excluir)
    @track contabAsesoresSel = [];
    @track contabAsesoresModo = 'incluir';
    @track showContabAsesorDd = false;

    get contabAsesorOptionsView() {
        const porAsesor = new Map();
        this.contabData.forEach(c => {
            const k = c.asesorId || 'SIN';
            if (!porAsesor.has(k)) porAsesor.set(k, c.asesor || 'Sin asesor');
        });
        return [...porAsesor.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.contabAsesoresSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get contabAsesorTriggerLabel() {
        if (!this.contabAsesoresSel.length) return 'Asesor responsable';
        let base = this.contabAsesoresSel.length + ' seleccionados';
        if (this.contabAsesoresSel.length === 1) {
            const opt = this.contabAsesorOptionsView.find(o => o.value === this.contabAsesoresSel[0]);
            base = opt ? opt.label : '1 seleccionado';
        }
        return this.contabAsesoresModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    toggleContabAsesorDd() { this.showContabAsesorDd = !this.showContabAsesorDd; }
    closeContabAsesorDd() { this.showContabAsesorDd = false; }
    handleContabAsesorToggle(e) {
        this.contabAsesoresSel = this.alternar(this.contabAsesoresSel, e.currentTarget.dataset.value);
    }
    handleContabAsesorTodos() { this.contabAsesoresSel = []; }
    handleContabAsesorModo(e) { this.contabAsesoresModo = e.currentTarget.dataset.modo; }
    get contabAsesorModoIncCls() {
        return 'ts-ms-link' + (this.contabAsesoresModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get contabAsesorModoExcCls() {
        return 'ts-ms-link' + (this.contabAsesoresModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    // Mis tareas recurrentes: alterna el filtro por asesor con el usuario conectado
    get contabMiosActivo() { return this.contabAsesorSel === USER_ID; }
    get contabMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.contabMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleContabMios() { this.contabAsesorSel = this.contabMiosActivo ? '' : USER_ID; }

    // Selección de asesor y periodo (para los números de las cajas)
    get contabFiltradas() {
        return this.contabFiltrar(false, true, true);
    }

    // Filtro por caja de pendientes (conmutable): emit / rec / ban
    handleContabKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.contabPendFiltro = this.contabPendFiltro === k ? '' : k;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    // La caja de total quita los filtros y vuelve a mostrar todas
    handleContabTotal() {
        this.contabPendFiltro = '';
        this.contabAsesorSel = '';
        this.contabAsesoresSel = [];
        this.contabAsesoresModo = 'incluir';
        this.contabPeriodoSel = '';
        this.contabBusqueda = '';
        this.contabVencidasActivo = false;
        this.contabTipoSel = '';
        this.contabTitularSel = '';
        this.contabAgruparPor = '';
    }

    @track contabBusqueda = '';
    handleContabBusqueda(e) { this.contabBusqueda = e.detail.value; }

    // Botón de solo vencidas y desplegable de tipo de servicio, a la derecha del buscador
    @track contabVencidasActivo = false;
    @track contabTipoSel = '';

    // El botón Vencidas lleva el total entre paréntesis y, con vencidas,
    // fondo rojo claro
    get contabVencN() {
        return this.contabData.filter(c => this.contabEsVencida(c)).length;
    }
    get contabVencBtnLabel() { return 'Vencidas (' + this.fmtNumber(this.contabVencN) + ')'; }
    get contabVencBtnCls() {
        return 'acf-btn-mios' + (this.contabVencN > 0 ? ' acf-btn-inc-rojo' : '')
            + (this.contabVencidasActivo
                ? (this.contabVencN > 0 ? ' acf-btn-inc-rojo-activo' : ' acf-btn-mios-activo') : '');
    }

    handleContabVencidas() {
        this.contabVencidasActivo = !this.contabVencidasActivo;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    // Botón Documentación pendiente: contabilidades con facturas emitidas, facturas recibidas
    // o bancos aún pendientes (cualquiera de los tres). Total entre paréntesis y, con alguna,
    // fondo rojo claro, como el de Vencidas; conmuta el filtro de pendientes ('doc')
    contabDocPendiente(c) {
        return this.contabPendiente(c.emitColor) || this.contabPendiente(c.recColor) || this.contabPendiente(c.banColor);
    }
    get contabDocN() { return this.contabData.filter(c => this.contabDocPendiente(c)).length; }
    get contabDocActivo() { return this.contabPendFiltro === 'doc'; }
    get contabDocBtnLabel() { return 'Documentación pendiente (' + this.fmtNumber(this.contabDocN) + ')'; }
    get contabDocBtnCls() {
        return 'acf-btn-mios' + (this.contabDocN > 0 ? ' acf-btn-inc-rojo' : '')
            + (this.contabDocActivo ? (this.contabDocN > 0 ? ' acf-btn-inc-rojo-activo' : ' acf-btn-mios-activo') : '');
    }
    handleContabDoc() {
        this.contabPendFiltro = this.contabDocActivo ? '' : 'doc';
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    handleContabTipo(e) {
        this.contabTipoSel = e.detail.value;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    get contabTipoOpciones() {
        const base = this.contabFiltrar(true, true, true, false);
        const porTipo = new Map();
        base.forEach(c => {
            const k = c.tipoServicio || 'SIN';
            porTipo.set(k, (porTipo.get(k) || 0) + 1);
        });
        const lista = [...porTipo.entries()]
            .map(([k, n]) => ({
                label: (this.contabTipoVisual(k === 'SIN' ? '' : k) || 'Sin tipo') + ' (' + n + ')',
                value: k
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'));
        return [{ label: 'Todos los tipos (' + base.length + ')', value: '' }, ...lista];
    }

    get contabMostradas() {
        return this.aplicarBusqueda(this.contabFiltrar(true, true, true), this.contabBusqueda);
    }

    // Pendiente = semáforo ni verde ni gris (el gris es "no incluido en servicio" o sin estado)
    contabPendiente(color) {
        return color !== 'verde' && color !== 'gris';
    }

    kpiCls(k, n) {
        return 'acf-kpi acf-kpi-rojo acf-kpi-click'
            + (this.contabPendFiltro === k ? ' acf-kpi-active' : '');
    }
    get contabKpiEmitCls() {
        return this.kpiCls('emit', this.contabFiltradas.filter(c => this.contabPendiente(c.emitColor)).length);
    }
    get contabKpiRecCls() {
        return this.kpiCls('rec', this.contabFiltradas.filter(c => this.contabPendiente(c.recColor)).length);
    }
    get contabKpiBanCls() {
        return this.kpiCls('ban', this.contabFiltradas.filter(c => this.contabPendiente(c.banColor)).length);
    }

    // Gráfico de barras por tipo de servicio contable y fiscal (sobre lo mostrado)
    get contabTiposServicio() {
        const filas = this.contabMostradas;
        const porTipo = new Map();
        const valorPorTipo = new Map(); // etiqueta visual -> valor real del picklist (para el filtro)
        filas.forEach(c => {
            const t = this.contabTipoVisual(c.tipoServicio) || 'Sin tipo';
            porTipo.set(t, (porTipo.get(t) || 0) + 1);
            if (!valorPorTipo.has(t)) valorPorTipo.set(t, c.tipoServicio || 'SIN');
        });
        const max = Math.max(1, ...porTipo.values());
        return [...porTipo.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
            .map(([label, n]) => {
                const value = valorPorTipo.get(label);
                const activo = this.contabTipoSel === value;
                return {
                    label,
                    value,
                    n: this.fmtNumber(n),
                    barStyle: 'width:' + Math.round((n / max) * 100) + '%',
                    verLabel: activo ? 'Quitar' : 'Ver',
                    verCls: 'acf-tipo-ver' + (activo ? ' acf-tipo-ver-activo' : '')
                };
            });
    }

    // Botón Ver de cada línea del gráfico: filtra el listado por ese tipo de
    // servicio (mismo filtro que el desplegable); pulsado de nuevo lo quita
    handleContabTipoVer(e) {
        const v = e.currentTarget.dataset.tipo;
        this.contabTipoSel = this.contabTipoSel === v ? '' : v;
        this.contabAsesorSel = this.validarSel(this.contabBase, this.contabAsesorSel);
    }

    // Fondo de color claro por tipo de servicio en la columna del listado
    contabTipoCls(visual) {
        const t = this.normalizar(visual);
        if (!t) return 'acf-chip acf-chip-neutro';
        if (t.startsWith('consultor')) return 'acf-chip acf-chip-warn';
        return 'acf-chip acf-chip-info';
    }

    // ===== Pestaña Precierres contables =====
    @track precData = [];
    @track precCargado = false;
    @track precLoading = false;
    @track precError = null;
    @track precAsesorSel = '';
    @track precEstadoFiltro = '';

    cargarPrec() {
        this.precLoading = true;
        this.precError = null;
        getPrecierresAbiertos()
            .then(res => { this.precData = res || []; this.precCargado = true; })
            .catch(err => { this.precError = this.reduceError(err); })
            .finally(() => { this.precLoading = false; });
    }

    handlePrecRefresh() { this.cargarPrec(); }

    get precHasError() { return !!this.precError; }
    get precShow() { return this.esPrecierres && !this.precLoading && !this.precError; }

    @track precTitularSel = '';

    get precBase() {
        let filas = this.precData;
        if (this.precTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.precTitularSel);
        if (!this.precEstadoFiltro) return filas;
        return filas.filter(c => c.estado === this.precEstadoFiltro);
    }

    get precAsesores() {
        return this.listaAsesores(this.precBase, this.precAsesorSel);
    }

    handlePrecAsesor(e) { this.precAsesorSel = e.currentTarget.dataset.key; }

    // Lista de la izquierda con los totales por empresa titular del registro
    get precTitulares() {
        let filas = this.precData;
        if (this.precEstadoFiltro) filas = filas.filter(c => c.estado === this.precEstadoFiltro);
        if (this.precAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.precAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular', this.precTitularSel, 'Todas las empresas');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handlePrecTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.precTitularSel = this.precTitularSel === k ? '' : k;
        this.precAsesorSel = this.validarSel(this.precBase, this.precAsesorSel);
    }

    get precFiltradas() {
        let filas = this.precData;
        if (this.precTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.precTitularSel);
        if (!this.precAsesorSel) return filas;
        return filas.filter(c => (c.asesorId || 'SIN') === this.precAsesorSel);
    }

    handlePrecKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.precEstadoFiltro = this.precEstadoFiltro === k ? '' : k;
        this.precAsesorSel = this.validarSel(this.precBase, this.precAsesorSel);
    }

    handlePrecTotal() {
        this.precEstadoFiltro = '';
        this.precAsesorSel = '';
        this.precBusqueda = '';
        this.precTitularSel = '';
    }

    @track precBusqueda = '';
    handlePrecBusqueda(e) { this.precBusqueda = e.detail.value; }

    get precMostradas() {
        const filas = !this.precAsesorSel ? this.precBase
            : this.precBase.filter(c => (c.asesorId || 'SIN') === this.precAsesorSel);
        return this.aplicarBusqueda(filas, this.precBusqueda);
    }

    get precRows() {
        return this.precMostradas.map((c, i) => ({
            ...c,
            key: c.id,
            idx: i + 1,
            estadoCls: 'acf-chip ' + (c.estado === 'Sin revisar' ? 'acf-chip-bad' : 'acf-chip-info')
        }));
    }

    get precHayFilas() { return this.precMostradas.length > 0; }

    // Pendientes para el total de la pestaña: estado distinto de Cancelado y Cerrado
    get precPendN() {
        return this.precData.filter(c => c.estado !== 'Cancelado' && c.estado !== 'Cerrado').length;
    }

    get precKpiTotal() { return this.fmtNumber(this.precData.length); }
    get precKpiSinRevisar() {
        return this.fmtNumber(this.precFiltradas.filter(c => c.estado === 'Sin revisar').length);
    }
    get precKpiEnCurso() {
        return this.fmtNumber(this.precFiltradas.filter(c => c.estado === 'En curso').length);
    }
    get precKpiSinCls() {
        return 'acf-kpi acf-kpi-rojo acf-kpi-click'
            + (this.precEstadoFiltro === 'Sin revisar' ? ' acf-kpi-active' : '');
    }
    get precKpiCursoCls() {
        return 'acf-kpi acf-kpi-azul acf-kpi-click'
            + (this.precEstadoFiltro === 'En curso' ? ' acf-kpi-active-azul' : '');
    }

    // ===== Pestaña Cierres Contables =====
    @track cieData = [];
    @track cieCargado = false;
    @track cieLoading = false;
    @track cieError = null;
    @track cieAsesorSel = '';
    @track cieEstadoFiltro = '';

    cargarCie() {
        this.cieLoading = true;
        this.cieError = null;
        getCierresAbiertos()
            .then(res => { this.cieData = res || []; this.cieCargado = true; })
            .catch(err => { this.cieError = this.reduceError(err); })
            .finally(() => { this.cieLoading = false; });
    }

    handleCieRefresh() { this.cargarCie(); }

    get cieHasError() { return !!this.cieError; }
    get cieShow() { return this.esCierres && !this.cieLoading && !this.cieError; }

    // Filtros de ejercicio y de estados (multiselección con incluir/excluir)
    @track cieEjercicioSel = '';
    @track cieEstadosSel = [];
    @track cieEstadosModo = 'incluir';
    @track showCieEstadoDd = false;
    @track cieTitularSel = '';

    cieFiltroComun(filas) {
        let out = this.cieAplicarPend(filas);
        if (this.cieTitularSel) out = out.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cieTitularSel);
        if (this.cieEjercicioSel) out = out.filter(c => (c.ejercicio || 'SIN') === this.cieEjercicioSel);
        if (this.cieEstadosSel.length) {
            out = this.cieEstadosModo === 'excluir'
                ? out.filter(c => !this.cieEstadosSel.includes(c.estado))
                : out.filter(c => this.cieEstadosSel.includes(c.estado));
        }
        return out;
    }

    get cieBase() {
        const filas = this.cieFiltroComun(this.cieData);
        if (!this.cieEstadoFiltro) return filas;
        return filas.filter(c => c.estado === this.cieEstadoFiltro);
    }

    // Usuarios en orden alfabético, con Todos los usuarios primero
    get cieAsesores() {
        const [todos, ...resto] = this.listaAsesores(this.cieBase, this.cieAsesorSel);
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCieAsesor(e) { this.cieAsesorSel = e.currentTarget.dataset.key; }

    // Mis cierres contables: alterna el filtro por asesor con el usuario conectado
    get cieMiosActivo() { return this.cieAsesorSel === USER_ID; }
    get cieMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.cieMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleCieMios() { this.cieAsesorSel = this.cieMiosActivo ? '' : USER_ID; }

    // Pendiente: fuera los cierres Completado, Pendiente cliente o En Auditoría.
    // Vencidos: los de ejercicio con el 30 de abril ya pasado
    // El botón Pendiente lleva el total entre paréntesis y, con pendientes,
    // fondo rojo claro
    get ciePendN() {
        return this.cieData.filter(c =>
            !['Completado', 'Pendiente cliente', 'En Auditoría'].includes(c.estado)).length;
    }
    get ciePendBtnLabel() { return 'Pendiente (' + this.fmtNumber(this.ciePendN) + ')'; }
    @track ciePendActivo = false;
    @track cieVencActivo = false;
    get ciePendBtnCls() {
        return 'acf-btn-mios' + (this.ciePendN > 0 ? ' acf-btn-inc-rojo' : '')
            + (this.ciePendActivo
                ? (this.ciePendN > 0 ? ' acf-btn-inc-rojo-activo' : ' acf-btn-mios-activo') : '');
    }
    get cieVencBtnCls() { return 'acf-btn-mios' + (this.cieVencActivo ? ' acf-btn-mios-activo' : ''); }
    handleCiePend() {
        this.ciePendActivo = !this.ciePendActivo;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }
    handleCieVenc() {
        this.cieVencActivo = !this.cieVencActivo;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }
    cieAplicarPend(filas) {
        let out = filas;
        if (this.cieVencActivo) out = out.filter(c => this.registroVencido(c.ejercicio, 4, 30));
        if (this.ciePendActivo) out = out.filter(c => !['Completado', 'Pendiente cliente', 'En Auditoría'].includes(c.estado));
        return out;
    }

    // Lista de la izquierda con los totales por ejercicio, de menor a mayor
    get cieEjercicios() {
        let filas = this.cieAplicarPend(this.cieData);
        if (this.cieTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cieTitularSel);
        if (this.cieEstadosSel.length) {
            filas = this.cieEstadosModo === 'excluir'
                ? filas.filter(c => !this.cieEstadosSel.includes(c.estado))
                : filas.filter(c => this.cieEstadosSel.includes(c.estado));
        }
        if (this.cieEstadoFiltro) filas = filas.filter(c => c.estado === this.cieEstadoFiltro);
        if (this.cieAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.cieAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.ejercicio || 'SIN',
            c => c.ejercicio || 'Sin ejercicio', this.cieEjercicioSel, 'Todos los ejercicios');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCieEjercicioLista(e) {
        const k = e.currentTarget.dataset.key;
        this.cieEjercicioSel = this.cieEjercicioSel === k ? '' : k;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }

    // Lista de la izquierda con los totales por empresa titular del registro
    get cieTitulares() {
        let filas = this.cieAplicarPend(this.cieData);
        if (this.cieEjercicioSel) filas = filas.filter(c => (c.ejercicio || 'SIN') === this.cieEjercicioSel);
        if (this.cieEstadosSel.length) {
            filas = this.cieEstadosModo === 'excluir'
                ? filas.filter(c => !this.cieEstadosSel.includes(c.estado))
                : filas.filter(c => this.cieEstadosSel.includes(c.estado));
        }
        if (this.cieEstadoFiltro) filas = filas.filter(c => c.estado === this.cieEstadoFiltro);
        if (this.cieAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.cieAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular', this.cieTitularSel, 'Todas las empresas');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCieTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.cieTitularSel = this.cieTitularSel === k ? '' : k;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }

    get cieFiltradas() {
        const filas = this.cieFiltroComun(this.cieData);
        if (!this.cieAsesorSel) return filas;
        return filas.filter(c => (c.asesorId || 'SIN') === this.cieAsesorSel);
    }

    handleCieKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.cieEstadoFiltro = this.cieEstadoFiltro === k ? '' : k;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }

    handleCieTotal() {
        this.cieEstadoFiltro = '';
        this.cieAsesorSel = '';
        this.cieBusqueda = '';
        this.cieEjercicioSel = '';
        this.cieEstadosSel = [];
        this.cieEstadosModo = 'incluir';
        this.cieTitularSel = '';
        this.cieAgrAsesor = false;
        this.ciePendActivo = false;
        this.cieVencActivo = false;
    }

    // Desplegable de ejercicio con recuento
    get cieEjercicioOpciones() {
        let filas = this.cieAplicarPend(this.cieData);
        if (this.cieTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cieTitularSel);
        if (this.cieEstadosSel.length) {
            filas = this.cieEstadosModo === 'excluir'
                ? filas.filter(c => !this.cieEstadosSel.includes(c.estado))
                : filas.filter(c => this.cieEstadosSel.includes(c.estado));
        }
        const porEj = new Map();
        filas.forEach(c => {
            const k = c.ejercicio || 'SIN';
            porEj.set(k, (porEj.get(k) || 0) + 1);
        });
        const lista = [...porEj.entries()]
            .map(([k, n]) => ({ label: (k === 'SIN' ? 'Sin ejercicio' : k) + ' (' + n + ')', value: k }))
            .sort((a, b) => a.value.localeCompare(b.value, 'es'));
        // La opción por defecto va sin número; los totales se ven al desplegar
        return [{ label: 'Todos los ejercicios', value: '' }, ...lista];
    }

    handleCieEjercicio(e) {
        this.cieEjercicioSel = e.detail.value;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }

    // Multiselección de estados con modo incluir/excluir
    handleCieEstadoModo(e) {
        this.cieEstadosModo = e.currentTarget.dataset.modo;
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }
    get cieEstadoModoIncCls() {
        return 'ts-ms-link' + (this.cieEstadosModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get cieEstadoModoExcCls() {
        return 'ts-ms-link' + (this.cieEstadosModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }
    get cieEstadoTriggerLabel() {
        const base = this.etiquetaMs(this.cieEstadosSel, 'Todos los estados');
        return this.cieEstadosSel.length && this.cieEstadosModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    get cieEstadoOptionsView() {
        return this.opcionesMs(this.cieData.map(c => c.estado || 'Sin estado'), this.cieEstadosSel);
    }
    toggleCieEstadoDd() { this.showCieEstadoDd = !this.showCieEstadoDd; }
    closeCieEstadoDd() { this.showCieEstadoDd = false; }
    handleCieEstadoToggle(e) {
        this.cieEstadosSel = this.alternar(this.cieEstadosSel, e.currentTarget.dataset.value);
        this.cieAsesorSel = this.validarSel(this.cieBase, this.cieAsesorSel);
    }
    handleCieEstadoTodos() { this.cieEstadosSel = []; }

    @track cieBusqueda = '';
    handleCieBusqueda(e) { this.cieBusqueda = e.detail.value; }

    get cieMostradas() {
        const filas = !this.cieAsesorSel ? this.cieBase
            : this.cieBase.filter(c => (c.asesorId || 'SIN') === this.cieAsesorSel);
        return this.aplicarBusqueda(filas, this.cieBusqueda);
    }

    // Agrupar el listado por asesor responsable
    @track cieAgrAsesor = false;
    get cieAgrAsesorCls() { return 'acf-btn-agrupar' + (this.cieAgrAsesor ? ' acf-btn-agrupar-activo' : ''); }
    handleCieAgrAsesor() { this.cieAgrAsesor = !this.cieAgrAsesor; }

    get cieRows() {
        const base = this.cieMostradas.map(c => ({
            ...c,
            key: c.id,
            estadoCls: this.chipEstado(c.estado)
        }));
        return this.agruparPorAsesor(base, this.cieAgrAsesor);
    }

    get cieHayFilas() { return this.cieMostradas.length > 0; }

    get cieKpiTotal() { return this.fmtNumber(this.cieData.length); }
    cieKpiNum(estado) {
        return this.fmtNumber(this.cieFiltradas.filter(c => c.estado === estado).length);
    }
    cieKpiCls(estado, color) {
        return 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
            + (this.cieEstadoFiltro === estado ? ' acf-kpi-active-' + color : '');
    }
    get cieKpiSinComenzar() { return this.cieKpiNum('Sin comenzar'); }
    get cieKpiEnCurso() { return this.cieKpiNum('En curso'); }
    get cieKpiPendCliente() { return this.cieKpiNum('Pendiente cliente'); }
    get cieKpiAuditoria() { return this.cieKpiNum('En Auditoría'); }
    get cieKpiSinComenzarCls() { return this.cieKpiCls('Sin comenzar', 'rojo'); }
    get cieKpiEnCursoCls() { return this.cieKpiCls('En curso', 'azul'); }
    get cieKpiPendClienteCls() { return this.cieKpiCls('Pendiente cliente', 'amarillo'); }
    get cieKpiAuditoriaCls() { return this.cieKpiCls('En Auditoría', 'gris'); }

    // ===== Pestaña Libros Contables =====
    @track libData = [];
    @track libCargado = false;
    @track libLoading = false;
    @track libError = null;
    @track libAsesorSel = '';
    @track libEstadoFiltro = '';

    cargarLib() {
        this.libLoading = true;
        this.libError = null;
        getLibrosAbiertos()
            .then(res => { this.libData = res || []; this.libCargado = true; })
            .catch(err => { this.libError = this.reduceError(err); })
            .finally(() => { this.libLoading = false; });
    }

    handleLibRefresh() { this.cargarLib(); }

    get libHasError() { return !!this.libError; }
    get libShow() { return this.esLibros && !this.libLoading && !this.libError; }

    // Filtros de ejercicio y de estados (multiselección con incluir/excluir)
    @track libEjercicioSel = '';
    @track libEstadosSel = [];
    @track libEstadosModo = 'incluir';
    @track showLibEstadoDd = false;
    @track libTitularSel = '';

    libFiltroComun(filas) {
        let out = this.libAplicarPend(filas);
        if (this.libTitularSel) out = out.filter(c => (c.empresaTitularUsuario || 'SIN') === this.libTitularSel);
        if (this.libEjercicioSel) out = out.filter(c => (c.ejercicio || 'SIN') === this.libEjercicioSel);
        if (this.libEstadosSel.length) {
            out = this.libEstadosModo === 'excluir'
                ? out.filter(c => !this.libEstadosSel.includes(c.estado))
                : out.filter(c => this.libEstadosSel.includes(c.estado));
        }
        return out;
    }

    get libBase() {
        const filas = this.libFiltroComun(this.libData);
        if (!this.libEstadoFiltro) return filas;
        return filas.filter(c => c.estado === this.libEstadoFiltro);
    }

    // Usuarios en orden alfabético, con Todos los usuarios primero
    get libAsesores() {
        const [todos, ...resto] = this.listaAsesores(this.libBase, this.libAsesorSel);
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleLibAsesor(e) { this.libAsesorSel = e.currentTarget.dataset.key; }

    // Mis libros contables: alterna el filtro por asesor con el usuario conectado
    get libMiosActivo() { return this.libAsesorSel === USER_ID; }
    get libMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.libMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleLibMios() { this.libAsesorSel = this.libMiosActivo ? '' : USER_ID; }

    // Pendiente: solo los libros cuyo estado no es Presentado ni Cerrado.
    // Vencidos: los de ejercicio con el 30 de abril ya pasado
    // El botón Pendiente lleva el total entre paréntesis y, con pendientes,
    // fondo rojo claro
    get libPendN() {
        return this.libData.filter(c => c.estado !== 'Presentado' && c.estado !== 'Cerrado').length;
    }
    get libPendBtnLabel() { return 'Pendiente (' + this.fmtNumber(this.libPendN) + ')'; }
    @track libPendActivo = false;
    @track libVencActivo = false;
    get libPendBtnCls() {
        return 'acf-btn-mios' + (this.libPendN > 0 ? ' acf-btn-inc-rojo' : '')
            + (this.libPendActivo
                ? (this.libPendN > 0 ? ' acf-btn-inc-rojo-activo' : ' acf-btn-mios-activo') : '');
    }
    get libVencBtnCls() { return 'acf-btn-mios' + (this.libVencActivo ? ' acf-btn-mios-activo' : ''); }
    handleLibPend() {
        this.libPendActivo = !this.libPendActivo;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }
    handleLibVenc() {
        this.libVencActivo = !this.libVencActivo;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }
    libAplicarPend(filas) {
        let out = filas;
        if (this.libVencActivo) out = out.filter(c => this.registroVencido(c.ejercicio, 4, 30));
        if (this.libPendActivo) out = out.filter(c => c.estado !== 'Presentado' && c.estado !== 'Cerrado');
        return out;
    }

    // Lista de la izquierda con los totales por ejercicio, sincronizada con
    // el desplegable de ejercicio del buscador
    get libEjercicios() {
        let filas = this.libAplicarPend(this.libData);
        if (this.libTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.libTitularSel);
        if (this.libEstadosSel.length) {
            filas = this.libEstadosModo === 'excluir'
                ? filas.filter(c => !this.libEstadosSel.includes(c.estado))
                : filas.filter(c => this.libEstadosSel.includes(c.estado));
        }
        if (this.libEstadoFiltro) filas = filas.filter(c => c.estado === this.libEstadoFiltro);
        if (this.libAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.libAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.ejercicio || 'SIN',
            c => c.ejercicio || 'Sin ejercicio', this.libEjercicioSel, 'Todos los ejercicios');
        // De menor a mayor ejercicio
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleLibEjercicioLista(e) {
        const k = e.currentTarget.dataset.key;
        this.libEjercicioSel = this.libEjercicioSel === k ? '' : k;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }

    // Lista de la izquierda con los totales por empresa titular del registro
    get libTitulares() {
        let filas = this.libAplicarPend(this.libData);
        if (this.libEjercicioSel) filas = filas.filter(c => (c.ejercicio || 'SIN') === this.libEjercicioSel);
        if (this.libEstadosSel.length) {
            filas = this.libEstadosModo === 'excluir'
                ? filas.filter(c => !this.libEstadosSel.includes(c.estado))
                : filas.filter(c => this.libEstadosSel.includes(c.estado));
        }
        if (this.libEstadoFiltro) filas = filas.filter(c => c.estado === this.libEstadoFiltro);
        if (this.libAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.libAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular', this.libTitularSel, 'Todas las empresas');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleLibTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.libTitularSel = this.libTitularSel === k ? '' : k;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }

    get libFiltradas() {
        const filas = this.libFiltroComun(this.libData);
        if (!this.libAsesorSel) return filas;
        return filas.filter(c => (c.asesorId || 'SIN') === this.libAsesorSel);
    }

    handleLibKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.libEstadoFiltro = this.libEstadoFiltro === k ? '' : k;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }

    handleLibTotal() {
        this.libEstadoFiltro = '';
        this.libAsesorSel = '';
        this.libBusqueda = '';
        this.libEjercicioSel = '';
        this.libEstadosSel = [];
        this.libEstadosModo = 'incluir';
        this.libTitularSel = '';
        this.libAgrAsesor = false;
        this.libPendActivo = false;
        this.libVencActivo = false;
    }

    // Desplegable de ejercicio, del más reciente al más antiguo, con recuento
    get libEjercicioOpciones() {
        let filas = this.libAplicarPend(this.libData);
        if (this.libTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.libTitularSel);
        if (this.libEstadosSel.length) {
            filas = this.libEstadosModo === 'excluir'
                ? filas.filter(c => !this.libEstadosSel.includes(c.estado))
                : filas.filter(c => this.libEstadosSel.includes(c.estado));
        }
        const porEj = new Map();
        filas.forEach(c => {
            const k = c.ejercicio || 'SIN';
            porEj.set(k, (porEj.get(k) || 0) + 1);
        });
        const lista = [...porEj.entries()]
            .map(([k, n]) => ({ label: (k === 'SIN' ? 'Sin ejercicio' : k) + ' (' + n + ')', value: k }))
            .sort((a, b) => b.value.localeCompare(a.value, 'es'));
        // La opción por defecto va sin número; los totales se ven al desplegar
        return [{ label: 'Todos los ejercicios', value: '' }, ...lista];
    }

    handleLibEjercicio(e) {
        this.libEjercicioSel = e.detail.value;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }

    // Multiselección de estados con modo incluir/excluir
    handleLibEstadoModo(e) {
        this.libEstadosModo = e.currentTarget.dataset.modo;
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }
    get libEstadoModoIncCls() {
        return 'ts-ms-link' + (this.libEstadosModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get libEstadoModoExcCls() {
        return 'ts-ms-link' + (this.libEstadosModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }
    get libEstadoTriggerLabel() {
        const base = this.etiquetaMs(this.libEstadosSel, 'Todos los estados');
        return this.libEstadosSel.length && this.libEstadosModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    get libEstadoOptionsView() {
        return this.opcionesMs(this.libData.map(c => c.estado || 'Sin estado'), this.libEstadosSel);
    }
    toggleLibEstadoDd() { this.showLibEstadoDd = !this.showLibEstadoDd; }
    closeLibEstadoDd() { this.showLibEstadoDd = false; }
    handleLibEstadoToggle(e) {
        this.libEstadosSel = this.alternar(this.libEstadosSel, e.currentTarget.dataset.value);
        this.libAsesorSel = this.validarSel(this.libBase, this.libAsesorSel);
    }
    handleLibEstadoTodos() { this.libEstadosSel = []; }

    @track libBusqueda = '';
    handleLibBusqueda(e) { this.libBusqueda = e.detail.value; }

    get libMostradas() {
        const filas = !this.libAsesorSel ? this.libBase
            : this.libBase.filter(c => (c.asesorId || 'SIN') === this.libAsesorSel);
        return this.aplicarBusqueda(filas, this.libBusqueda);
    }

    // Agrupar el listado por asesor responsable
    @track libAgrAsesor = false;
    get libAgrAsesorCls() { return 'acf-btn-agrupar' + (this.libAgrAsesor ? ' acf-btn-agrupar-activo' : ''); }
    handleLibAgrAsesor() { this.libAgrAsesor = !this.libAgrAsesor; }

    get libRows() {
        const base = this.libMostradas.map(c => ({
            ...c,
            key: c.id,
            estadoCls: this.chipEstado(c.estado)
        }));
        return this.agruparPorAsesor(base, this.libAgrAsesor);
    }

    get libHayFilas() { return this.libMostradas.length > 0; }

    get libKpiTotal() { return this.fmtNumber(this.libData.length); }
    libKpiNum(estado) {
        return this.fmtNumber(this.libFiltradas.filter(c => c.estado === estado).length);
    }
    libKpiCls(estado, color) {
        return 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
            + (this.libEstadoFiltro === estado ? ' acf-kpi-active-' + color : '');
    }
    get libKpiCierrePend() { return this.libKpiNum('Cierre pendiente'); }
    get libKpiPresentarLibro() { return this.libKpiNum('Presentar libro'); }
    get libKpiPresentado() { return this.libKpiNum('Presentado'); }
    get libKpiIncidencias() { return this.libKpiNum('Incidencias'); }
    // Cierre pendiente, Presentar libro e Incidencias avisan con el número en rojo
    get libKpiCierrePendCls() { return this.libKpiCls('Cierre pendiente', 'rojo'); }
    get libKpiPresentarLibroCls() { return this.libKpiCls('Presentar libro', 'rojo'); }
    get libKpiPresentadoCls() { return this.libKpiCls('Presentado', 'verde'); }
    get libKpiIncidenciasCls() { return this.libKpiCls('Incidencias', 'rojo'); }

    // ===== Pestaña Cuentas anuales =====
    @track cuData = [];
    @track cuCargado = false;
    @track cuLoading = false;
    @track cuError = null;
    @track cuAsesorSel = '';
    @track cuEstadoFiltro = '';

    cargarCu() {
        this.cuLoading = true;
        this.cuError = null;
        getCuentasAbiertas()
            .then(res => { this.cuData = res || []; this.cuCargado = true; })
            .catch(err => { this.cuError = this.reduceError(err); })
            .finally(() => { this.cuLoading = false; });
    }

    handleCuRefresh() { this.cargarCu(); }

    get cuHasError() { return !!this.cuError; }
    get cuShow() { return this.esCuentas && !this.cuLoading && !this.cuError; }

    // Filtros de ejercicio y de estados (multiselección) junto al buscador
    @track cuEjercicioSel = '';
    @track cuEstadosSel = [];
    @track showCuEstadoDd = false;
    @track cuTitularSel = '';
    // Orden de la columna Empresa: '' (orden de llegada), 'asc' o 'desc'
    @track cuOrdenEmpresa = '';

    // Filtros comunes a la lista de usuarios, las cajas y el listado; la
    // multiselección de estados puede incluir o excluir los marcados
    cuFiltroComun(filas) {
        let out = this.cuAplicarPend(filas);
        if (this.cuTitularSel) out = out.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cuTitularSel);
        if (this.cuEjercicioSel) out = out.filter(c => (c.ejercicio || 'SIN') === this.cuEjercicioSel);
        if (this.cuEstadosSel.length) {
            out = this.cuEstadosModo === 'excluir'
                ? out.filter(c => !this.cuEstadosSel.includes(c.estado))
                : out.filter(c => this.cuEstadosSel.includes(c.estado));
        }
        if (this.cuAsesoresSel.length) {
            out = this.cuAsesoresModo === 'excluir'
                ? out.filter(c => !this.cuAsesoresSel.includes(c.asesorId || 'SIN'))
                : out.filter(c => this.cuAsesoresSel.includes(c.asesorId || 'SIN'));
        }
        if (this.cuGruposSel.length) out = out.filter(c => this.cuGruposSel.includes(c.grupo || 'Sin grupo'));
        return out;
    }

    get cuBase() {
        const filas = this.cuFiltroComun(this.cuData);
        if (!this.cuEstadoFiltro) return filas;
        return filas.filter(c => c.estado === this.cuEstadoFiltro);
    }

    // Usuarios en orden alfabético, con Todos los usuarios primero
    get cuAsesores() {
        const [todos, ...resto] = this.listaAsesores(this.cuBase, this.cuAsesorSel);
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCuAsesor(e) { this.cuAsesorSel = e.currentTarget.dataset.key; }

    // Mis cuentas anuales: alterna el filtro por asesor con el usuario conectado
    get cuMiosActivo() { return this.cuAsesorSel === USER_ID; }
    get cuMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.cuMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleCuMios() { this.cuAsesorSel = this.cuMiosActivo ? '' : USER_ID; }

    // Pendiente: solo las cuentas cuyo estado no es Presentado ni Cerrado.
    // Vencidas: las de ejercicio con el 30 de julio ya pasado
    @track cuPendActivo = false;
    @track cuVencActivo = false;
    // El botón Pendiente lleva el total entre paréntesis y, con pendientes,
    // fondo rojo claro
    get cuPendN() {
        return this.cuData.filter(c => c.estado !== 'Presentado' && c.estado !== 'Cerrado').length;
    }
    get cuPendBtnLabel() { return 'Pendiente (' + this.fmtNumber(this.cuPendN) + ')'; }
    get cuPendBtnCls() {
        return 'acf-btn-mios' + (this.cuPendN > 0 ? ' acf-btn-inc-rojo' : '')
            + (this.cuPendActivo
                ? (this.cuPendN > 0 ? ' acf-btn-inc-rojo-activo' : ' acf-btn-mios-activo') : '');
    }
    get cuVencBtnCls() { return 'acf-btn-mios' + (this.cuVencActivo ? ' acf-btn-mios-activo' : ''); }
    handleCuPend() {
        this.cuPendActivo = !this.cuPendActivo;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    handleCuVenc() {
        this.cuVencActivo = !this.cuVencActivo;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    cuAplicarPend(filas) {
        let out = filas;
        if (this.cuVencActivo) out = out.filter(c => this.registroVencido(c.ejercicio, 7, 30));
        if (this.cuPendActivo) out = out.filter(c => c.estado !== 'Presentado' && c.estado !== 'Cerrado');
        return out;
    }

    // Lista de la izquierda con los totales por ejercicio, sincronizada con
    // el desplegable de ejercicio del buscador
    get cuEjercicios() {
        let filas = this.cuAplicarPend(this.cuData);
        if (this.cuTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cuTitularSel);
        if (this.cuEstadosSel.length) {
            filas = this.cuEstadosModo === 'excluir'
                ? filas.filter(c => !this.cuEstadosSel.includes(c.estado))
                : filas.filter(c => this.cuEstadosSel.includes(c.estado));
        }
        if (this.cuEstadoFiltro) filas = filas.filter(c => c.estado === this.cuEstadoFiltro);
        if (this.cuAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.cuAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.ejercicio || 'SIN',
            c => c.ejercicio || 'Sin ejercicio', this.cuEjercicioSel, 'Todos los ejercicios');
        // De menor a mayor ejercicio
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCuEjercicioLista(e) {
        const k = e.currentTarget.dataset.key;
        this.cuEjercicioSel = this.cuEjercicioSel === k ? '' : k;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }

    // Lista de la izquierda con los totales por empresa titular del registro
    get cuTitulares() {
        let filas = this.cuAplicarPend(this.cuData);
        if (this.cuEjercicioSel) filas = filas.filter(c => (c.ejercicio || 'SIN') === this.cuEjercicioSel);
        if (this.cuEstadosSel.length) {
            filas = this.cuEstadosModo === 'excluir'
                ? filas.filter(c => !this.cuEstadosSel.includes(c.estado))
                : filas.filter(c => this.cuEstadosSel.includes(c.estado));
        }
        if (this.cuEstadoFiltro) filas = filas.filter(c => c.estado === this.cuEstadoFiltro);
        if (this.cuAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.cuAsesorSel);
        const [todos, ...resto] = this.listaValores(filas, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular', this.cuTitularSel, 'Todas las empresas');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleCuTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.cuTitularSel = this.cuTitularSel === k ? '' : k;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }

    get cuFiltradas() {
        const filas = this.cuFiltroComun(this.cuData);
        if (!this.cuAsesorSel) return filas;
        return filas.filter(c => (c.asesorId || 'SIN') === this.cuAsesorSel);
    }

    handleCuKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.cuEstadoFiltro = this.cuEstadoFiltro === k ? '' : k;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }

    handleCuTotal() {
        this.cuEstadoFiltro = '';
        this.cuAsesorSel = '';
        this.cuBusqueda = '';
        this.cuEjercicioSel = '';
        this.cuEstadosSel = [];
        this.cuEstadosModo = 'incluir';
        this.cuOrdenEmpresa = '';
        this.cuTitularSel = '';
        this.cuAgrAsesor = false;
        this.cuPendActivo = false;
        this.cuVencActivo = false;
        this.cuAsesoresSel = [];
        this.cuAsesoresModo = 'incluir';
        this.cuGruposSel = [];
    }

    @track cuBusqueda = '';
    handleCuBusqueda(e) { this.cuBusqueda = e.detail.value; }

    get cuMostradas() {
        const filas = !this.cuAsesorSel ? this.cuBase
            : this.cuBase.filter(c => (c.asesorId || 'SIN') === this.cuAsesorSel);
        const buscadas = this.aplicarBusqueda(filas, this.cuBusqueda);
        if (!this.cuOrdenEmpresa) return buscadas;
        const dir = this.cuOrdenEmpresa === 'asc' ? 1 : -1;
        return [...buscadas].sort((a, b) =>
            dir * String(a.empresa || '').localeCompare(String(b.empresa || ''), 'es'));
    }

    // La cabecera de Empresa alterna A→Z, Z→A y el orden de llegada
    handleCuOrdenEmpresa() {
        this.cuOrdenEmpresa = this.cuOrdenEmpresa === 'asc' ? 'desc'
            : (this.cuOrdenEmpresa === 'desc' ? '' : 'asc');
    }

    get cuOrdenEmpresaIcono() {
        return this.cuOrdenEmpresa === 'asc' ? '▲' : (this.cuOrdenEmpresa === 'desc' ? '▼' : '↕');
    }

    // Desplegable de ejercicio, del más reciente al más antiguo, con recuento
    get cuEjercicioOpciones() {
        let filas = this.cuAplicarPend(this.cuData);
        if (this.cuTitularSel) filas = filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.cuTitularSel);
        if (this.cuEstadosSel.length) filas = filas.filter(c => this.cuEstadosSel.includes(c.estado));
        const porEj = new Map();
        filas.forEach(c => {
            const k = c.ejercicio || 'SIN';
            porEj.set(k, (porEj.get(k) || 0) + 1);
        });
        const lista = [...porEj.entries()]
            .map(([k, n]) => ({ label: (k === 'SIN' ? 'Sin ejercicio' : k) + ' (' + n + ')', value: k }))
            .sort((a, b) => b.value.localeCompare(a.value, 'es'));
        // La opción por defecto va sin número; los totales se ven al desplegar
        return [{ label: 'Todos los ejercicios', value: '' }, ...lista];
    }

    handleCuEjercicio(e) {
        this.cuEjercicioSel = e.detail.value;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }

    // Multiselección de estados, en el orden de flujo de las cajas, con modo
    // incluir (solo los marcados) o excluir (todos menos los marcados)
    @track cuEstadosModo = 'incluir';
    handleCuEstadoModo(e) {
        this.cuEstadosModo = e.currentTarget.dataset.modo;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    get cuEstadoModoIncCls() {
        return 'ts-ms-link' + (this.cuEstadosModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get cuEstadoModoExcCls() {
        return 'ts-ms-link' + (this.cuEstadosModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }

    get cuEstadoTriggerLabel() {
        const base = this.etiquetaMs(this.cuEstadosSel, 'Todos los estados');
        return this.cuEstadosSel.length && this.cuEstadosModo === 'excluir' ? 'Excluir: ' + base : base;
    }

    get cuEstadoOptionsView() {
        const presentes = new Set(this.cuData.map(c => c.estado));
        const estados = ORDEN_ESTADOS_CUENTAS.filter(e => presentes.has(e));
        presentes.forEach(e => { if (e && !estados.includes(e)) estados.push(e); });
        return estados.map(v => ({
            value: v,
            label: v,
            optionClass: this.cuEstadosSel.includes(v) ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
        }));
    }

    toggleCuEstadoDd() { this.showCuEstadoDd = !this.showCuEstadoDd; }
    closeCuEstadoDd() { this.showCuEstadoDd = false; }
    handleCuEstadoToggle(e) {
        this.cuEstadosSel = this.alternar(this.cuEstadosSel, e.currentTarget.dataset.value);
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    handleCuEstadoTodos() { this.cuEstadosSel = []; }

    // Multiselección de asesores con modo incluir/excluir
    @track cuAsesoresSel = [];
    @track cuAsesoresModo = 'incluir';
    @track showCuAsesorDd = false;

    get cuAsesorOptionsView() {
        const porAsesor = new Map();
        this.cuAplicarPend(this.cuData).forEach(c => {
            const k = c.asesorId || 'SIN';
            if (!porAsesor.has(k)) porAsesor.set(k, c.asesor || 'Sin asesor');
        });
        return [...porAsesor.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.cuAsesoresSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get cuAsesorTriggerLabel() {
        if (!this.cuAsesoresSel.length) return 'Todos los asesores';
        const base = this.cuAsesoresSel.length === 1
            ? ((this.cuAsesorOptionsView.find(o => o.value === this.cuAsesoresSel[0]) || {}).label
                || '1 seleccionado')
            : this.cuAsesoresSel.length + ' seleccionados';
        return this.cuAsesoresModo === 'excluir' ? 'Excluir: ' + base : base;
    }
    get cuAsesorModoIncCls() {
        return 'ts-ms-link' + (this.cuAsesoresModo === 'incluir' ? ' ts-ms-link-activo' : '');
    }
    get cuAsesorModoExcCls() {
        return 'ts-ms-link' + (this.cuAsesoresModo === 'excluir' ? ' ts-ms-link-activo' : '');
    }
    toggleCuAsesorDd() { this.showCuAsesorDd = !this.showCuAsesorDd; }
    closeCuAsesorDd() { this.showCuAsesorDd = false; }
    handleCuAsesorToggle(e) {
        this.cuAsesoresSel = this.alternar(this.cuAsesoresSel, e.currentTarget.dataset.value);
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    handleCuAsesorTodos() { this.cuAsesoresSel = []; }
    handleCuAsesorModo(e) {
        this.cuAsesoresModo = e.currentTarget.dataset.modo;
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }

    // Multiselección de grupo empresarial
    @track cuGruposSel = [];
    @track showCuGrupoDd = false;

    get cuGrupoOptionsView() {
        return this.opcionesMs(this.cuAplicarPend(this.cuData).map(c => c.grupo || 'Sin grupo'),
            this.cuGruposSel);
    }
    get cuGrupoTriggerLabel() { return this.etiquetaMs(this.cuGruposSel, 'Todos los grupos'); }
    toggleCuGrupoDd() { this.showCuGrupoDd = !this.showCuGrupoDd; }
    closeCuGrupoDd() { this.showCuGrupoDd = false; }
    handleCuGrupoToggle(e) {
        this.cuGruposSel = this.alternar(this.cuGruposSel, e.currentTarget.dataset.value);
        this.cuAsesorSel = this.validarSel(this.cuBase, this.cuAsesorSel);
    }
    handleCuGrupoTodos() { this.cuGruposSel = []; }

    // Agrupar el listado por asesor responsable
    @track cuAgrAsesor = false;
    get cuAgrAsesorCls() { return 'acf-btn-agrupar' + (this.cuAgrAsesor ? ' acf-btn-agrupar-activo' : ''); }
    handleCuAgrAsesor() { this.cuAgrAsesor = !this.cuAgrAsesor; }

    get cuRows() {
        const base = this.cuMostradas.map(c => ({
            ...c,
            key: c.id,
            estadoCls: this.chipEstado(c.estado)
        }));
        return this.agruparPorAsesor(base, this.cuAgrAsesor);
    }

    get cuHayFilas() { return this.cuMostradas.length > 0; }

    get cuKpiTotal() { return this.fmtNumber(this.cuData.length); }

    // Cajas dinámicas: una por estado con registros, en orden de flujo
    get cuKpis() {
        const presentes = new Set(this.cuData.map(c => c.estado));
        const estados = ORDEN_ESTADOS_CUENTAS.filter(e => presentes.has(e));
        this.cuData.forEach(c => {
            if (!ORDEN_ESTADOS_CUENTAS.includes(c.estado) && !estados.includes(c.estado)) estados.push(c.estado);
        });
        return estados.map(estado => {
            const color = this.colorEstadoCuentas(estado);
            return {
                estado,
                // Cajas con rótulo propio en vez del nombre corto del estado
                etiqueta: estado === 'Enviada Certif.' ? 'Enviada Certificación'
                    : (estado === 'Preparar Certif.' ? 'Enviar preparar certificación' : estado),
                n: this.fmtNumber(this.cuFiltradas.filter(c => c.estado === estado).length),
                cls: 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
                    + (this.cuEstadoFiltro === estado ? ' acf-kpi-active-' + color : '')
            };
        });
    }

    colorEstadoCuentas(estado) {
        if (estado === 'Cierre pendiente') return 'rojo';
        if (estado === 'Presentado') return 'verde';
        if (estado === 'Incidencias') return 'amarillo';
        return 'azul';
    }

    // Helpers compartidos por las pestañas de listados por estado
    listaAsesores(datos, seleccion) {
        const porAsesor = new Map();
        datos.forEach(c => {
            const k = c.asesorId || 'SIN';
            if (!porAsesor.has(k)) porAsesor.set(k, { nombre: c.asesor || SIN_ASESOR, n: 0 });
            porAsesor.get(k).n++;
        });
        const lista = [...porAsesor.entries()]
            .map(([k, v]) => ({ key: k, nombre: v.nombre, n: v.n }))
            .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
        const items = [{ key: '', nombre: 'Todos los usuarios', n: datos.length }, ...lista];
        return items.map(it => ({
            ...it,
            cls: it.key === seleccion ? 'acf-user-item acf-user-item-active' : 'acf-user-item'
        }));
    }

    // ===== Pestaña Rentas =====
    @track renData = [];
    @track renCargado = false;
    @track renLoading = false;
    @track renError = null;
    @track renAsesorSel = '';
    @track renEstadoFiltro = '';

    cargarRen() {
        this.renLoading = true;
        this.renError = null;
        getRentasAbiertas()
            .then(res => { this.renData = res || []; this.renCargado = true; })
            .catch(err => { this.renError = this.reduceError(err); })
            .finally(() => { this.renLoading = false; });
    }

    handleRenRefresh() { this.cargarRen(); }

    get renHasError() { return !!this.renError; }
    get renShow() { return this.esRentas && !this.renLoading && !this.renError; }

    get renBase() {
        if (!this.renEstadoFiltro) return this.renData;
        return this.renData.filter(c => c.estado === this.renEstadoFiltro);
    }

    get renAsesores() {
        return this.listaAsesores(this.renBase, this.renAsesorSel);
    }

    handleRenAsesor(e) { this.renAsesorSel = e.currentTarget.dataset.key; }

    get renFiltradas() {
        if (!this.renAsesorSel) return this.renData;
        return this.renData.filter(c => (c.asesorId || 'SIN') === this.renAsesorSel);
    }

    handleRenKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.renEstadoFiltro = this.renEstadoFiltro === k ? '' : k;
        this.renAsesorSel = this.validarSel(this.renBase, this.renAsesorSel);
    }

    handleRenTotal() {
        this.renEstadoFiltro = '';
        this.renAsesorSel = '';
        this.renBusqueda = '';
    }

    @track renBusqueda = '';
    handleRenBusqueda(e) { this.renBusqueda = e.detail.value; }

    get renMostradas() {
        const filas = !this.renAsesorSel ? this.renBase
            : this.renBase.filter(c => (c.asesorId || 'SIN') === this.renAsesorSel);
        return this.aplicarBusqueda(filas, this.renBusqueda);
    }

    get renRows() {
        return this.renMostradas.map((c, i) => ({
            ...c,
            key: c.id,
            idx: i + 1,
            estadoCls: this.chipEstado(c.estado)
        }));
    }

    get renHayFilas() { return this.renMostradas.length > 0; }

    // Pendientes para el total de la pestaña: estado distinto de Cerrado
    get renPendN() {
        return this.renData.filter(c => c.estado !== 'Cerrado').length;
    }

    get renKpiTotal() { return this.fmtNumber(this.renData.length); }

    // Cajas fijas: los siete estados abiertos de renta en orden de flujo
    get renKpis() {
        return ESTADOS_RENTA.map(estado => {
            const color = this.colorEstadoRenta(estado);
            return {
                estado,
                n: this.fmtNumber(this.renFiltradas.filter(c => c.estado === estado).length),
                cls: 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
                    + (this.renEstadoFiltro === estado ? ' acf-kpi-active-' + color : '')
            };
        });
    }

    colorEstadoRenta(estado) {
        if (estado === 'Sin formulario') return 'rojo';
        if (estado === 'Descargar datos' || estado === 'Asignar') return 'amarillo';
        if (estado === 'Aceptado') return 'verde';
        return 'azul';
    }

    // ===== Pestaña Expedientes =====
    @track expData = [];
    @track expCargado = false;
    @track expLoading = false;
    @track expError = null;
    @track expAsesorSel = '';
    @track expTitularSel = '';
    @track expMateriaSel = '';

    cargarExp() {
        this.expLoading = true;
        this.expError = null;
        getExpedientesAbiertos()
            .then(res => { this.expData = res || []; this.expCargado = true; })
            .catch(err => { this.expError = this.reduceError(err); })
            .finally(() => { this.expLoading = false; });
    }

    handleExpRefresh() { this.cargarExp(); }

    get expHasError() { return !!this.expError; }
    get expShow() { return this.esExpedientes && !this.expLoading && !this.expError; }

    // Filtro combinable: cada lista se calcula con los filtros de las otras dos
    expFiltrar(usarTitular, usarMateria, usarAsesor) {
        return this.expData.filter(c => {
            if (this.expInactivosActivo && c.asesorActivo !== false) return false;
            if (this.expRevisionActivo && !this.expNecesitaRevision(c)) return false;
            if (usarTitular && this.expTitularSel && (c.empresaTitular || 'SIN') !== this.expTitularSel) return false;
            if (usarMateria && this.expMateriaSel && (c.materia || 'SIN') !== this.expMateriaSel) return false;
            if (usarAsesor && this.expAsesorSel && (c.asesorId || 'SIN') !== this.expAsesorSel) return false;
            return true;
        });
    }

    // Un expediente necesita revisión si no tiene tareas abiertas y nunca se
    // actualizó, o si su última actualización es de hace más de 3 meses
    expNecesitaRevision(c) {
        const abiertas = c.tareasAbiertas || 0;
        if (abiertas === 0 && !c.ultimaTarea) return true;
        return !!c.ultimaTarea && String(c.ultimaTarea) < this.hace3MesesIso();
    }

    hace3MesesIso() {
        const h = new Date();
        h.setMonth(h.getMonth() - 3);
        const mm = String(h.getMonth() + 1).padStart(2, '0');
        const dd = String(h.getDate()).padStart(2, '0');
        return `${h.getFullYear()}-${mm}-${dd}`;
    }

    get expTitulares() {
        return this.listaValores(this.expFiltrar(false, true, true),
            c => c.empresaTitular || 'SIN', c => c.empresaTitular || 'Sin empresa titular',
            this.expTitularSel, 'Todas las empresas');
    }

    get expMaterias() {
        return this.listaValores(this.expFiltrar(true, false, true),
            c => c.materia || 'SIN', c => c.materia || 'Sin materia',
            this.expMateriaSel, 'Todas las materias');
    }

    get expAsesores() {
        return this.listaAsesores(this.expFiltrar(true, true, false), this.expAsesorSel);
    }

    handleExpTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.expTitularSel = this.expTitularSel === k ? '' : k;
        this.expAsesorSel = this.validarSel(this.expFiltrar(true, true, false), this.expAsesorSel);
    }

    handleExpMateria(e) {
        const k = e.currentTarget.dataset.key;
        this.expMateriaSel = this.expMateriaSel === k ? '' : k;
        this.expAsesorSel = this.validarSel(this.expFiltrar(true, true, false), this.expAsesorSel);
    }

    handleExpAsesor(e) { this.expAsesorSel = e.currentTarget.dataset.key; }

    // Mis expedientes: alterna el filtro por asesor con el usuario conectado
    get expMiosActivo() { return this.expAsesorSel === USER_ID; }
    get expMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.expMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleExpMios() { this.expAsesorSel = this.expMiosActivo ? '' : USER_ID; }

    // Filtros de expedientes con asesor inactivo y de expedientes que necesitan revisión
    @track expInactivosActivo = false;
    @track expRevisionActivo = false;
    get expInactBtnCls() { return 'acf-btn-mios' + (this.expInactivosActivo ? ' acf-btn-mios-activo' : ''); }
    get expRevBtnCls() { return 'acf-btn-mios' + (this.expRevisionActivo ? ' acf-btn-mios-activo' : ''); }
    handleExpInactivos() {
        this.expInactivosActivo = !this.expInactivosActivo;
        this.expAsesorSel = this.validarSel(this.expFiltrar(true, true, false), this.expAsesorSel);
    }
    handleExpRevision() {
        this.expRevisionActivo = !this.expRevisionActivo;
        this.expAsesorSel = this.validarSel(this.expFiltrar(true, true, false), this.expAsesorSel);
    }

    // Nuevo expediente con el botón personalizado existente: el flujo de creación guiada
    handleExpNuevo() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/flow/Expediente_Creaci_n_guiada' }
        });
    }

    handleExpTotal() {
        this.expAsesorSel = '';
        this.expTitularSel = '';
        this.expMateriaSel = '';
        this.expBusqueda = '';
        this.expInactivosActivo = false;
        this.expRevisionActivo = false;
    }

    @track expBusqueda = '';
    handleExpBusqueda(e) { this.expBusqueda = e.detail.value; }

    // Ordenación del listado por la fecha de apertura: alterna descendente/ascendente
    @track expOrdenFecha = '';
    handleExpOrdenFecha() { this.expOrdenFecha = this.expOrdenFecha === 'desc' ? 'asc' : 'desc'; }
    get expOrdenFlecha() {
        return this.expOrdenFecha === 'asc' ? '↑' : this.expOrdenFecha === 'desc' ? '↓' : '';
    }

    get expMostradas() {
        const filas = this.aplicarBusqueda(this.expFiltrar(true, true, true), this.expBusqueda);
        if (!this.expOrdenFecha) return filas;
        const dir = this.expOrdenFecha === 'asc' ? 1 : -1;
        return [...filas].sort((a, b) =>
            (String(a.fechaApertura || '') < String(b.fechaApertura || '') ? -1 : 1) * dir);
    }

    // Desplegables de asesor responsable y área junto a los botones del listado;
    // comparten selección con las listas laterales de usuarios y materias
    // El desplegable va por orden alfabético, con Todos los usuarios primero
    get expAsesorOpciones() {
        const [todos, ...resto] = this.listaAsesores(this.expFiltrar(true, true, false), this.expAsesorSel);
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto].map(it => ({ label: it.nombre + ' (' + it.n + ')', value: it.key }));
    }
    get expMateriaOpciones() {
        return this.listaValores(this.expFiltrar(true, false, true),
            c => c.materia || 'SIN', c => c.materia || 'Sin materia',
            this.expMateriaSel, 'Todas las áreas')
            .map(it => ({ label: it.nombre + ' (' + it.n + ')', value: it.key }));
    }
    handleExpAsesorCombo(e) { this.expAsesorSel = e.detail.value; }
    handleExpMateriaCombo(e) {
        this.expMateriaSel = e.detail.value;
        this.expAsesorSel = this.validarSel(this.expFiltrar(true, true, false), this.expAsesorSel);
    }

    // Con Ver mis expedientes, Usuarios inactivos o Revisión activos se
    // muestra encima del listado el total de líneas afectadas
    get expFiltroResumen() {
        const filtros = [];
        if (this.expMiosActivo) filtros.push('mis expedientes');
        if (this.expInactivosActivo) filtros.push('usuarios inactivos');
        if (this.expRevisionActivo) filtros.push('revisión');
        if (!filtros.length) return '';
        const n = this.expMostradas.length;
        return this.fmtNumber(n) + (n === 1 ? ' expediente' : ' expedientes')
            + ' · ' + filtros.join(' + ');
    }

    // Lista genérica de valores con recuento (empresa titular, materia)
    listaValores(datos, claveFn, etiquetaFn, seleccion, etiquetaTodos) {
        const porValor = new Map();
        datos.forEach(c => {
            const k = claveFn(c);
            if (!porValor.has(k)) porValor.set(k, { nombre: etiquetaFn(c), n: 0 });
            porValor.get(k).n++;
        });
        const lista = [...porValor.entries()]
            .map(([k, v]) => ({ key: k, nombre: v.nombre, n: v.n }))
            .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
        const items = [{ key: '', nombre: etiquetaTodos, n: datos.length }, ...lista];
        return items.map(it => ({
            ...it,
            cls: it.key === seleccion ? 'acf-user-item acf-user-item-active' : 'acf-user-item'
        }));
    }

    get expRows() {
        return this.expMostradas.map((c, i) => {
            const revisar = this.expNecesitaRevision(c);
            return {
                ...c,
                key: c.id,
                idx: i + 1,
                estadoCls: this.chipEstado(c.estado),
                fechaAperturaFmt: this.fmtFecha(c.fechaApertura),
                revisarTxt: revisar ? 'Revisar' : '',
                revisarCls: revisar ? 'acf-chip acf-chip-revisar' : '',
                tareasAbiertasFmt: this.fmtNumber(c.tareasAbiertas || 0),
                // Con tareas abiertas el número va dentro de un círculo rojo
                tareasBadgeCls: (c.tareasAbiertas || 0) > 0 ? 'acf-tareas-circulo' : '',
                // La fecha del último cierre solo aplica a expedientes sin tareas abiertas
                ultimaFmt: (c.tareasAbiertas || 0) === 0 ? this.fmtFecha(c.ultimaTarea) : '',
                ...this.simbolosContrato(c)
            };
        });
    }

    get expHayFilas() { return this.expMostradas.length > 0; }
    get expKpiTotal() { return this.fmtNumber(this.expData.length); }

    // ===== Pestaña Próximos Vtos. legales =====
    @track vtoData = [];
    @track vtoCargado = false;
    @track vtoLoading = false;
    @track vtoError = null;
    @track vtoAsesorSel = '';
    // Al entrar en la pestaña queda marcado por defecto Total próximamente
    @track vtoTipoFiltro = 'proximos';
    @track vtoBusqueda = '';
    @track vtoFechaFiltro = '';
    // Subvista de la pestaña: lista o calendario mensual
    @track vtoVista = 'lista';
    @track vtoCalAnio = new Date().getFullYear();
    @track vtoCalMes = new Date().getMonth() + 1;

    cargarVto() {
        this.vtoLoading = true;
        this.vtoError = null;
        getVencimientosLegalesLista()
            .then(res => { this.vtoData = res || []; this.vtoCargado = true; })
            .catch(err => { this.vtoError = this.reduceError(err); })
            .finally(() => { this.vtoLoading = false; });
    }

    handleVtoRefresh() { this.cargarVto(); this.cargarVenc(); }

    get vtoHasError() { return !!this.vtoError; }
    get vtoShow() { return this.esVtos && !this.vtoLoading && !this.vtoError; }

    // Tipo según la fecha de vencimiento: vencido / hoy / próximamente
    vtoTipo(fecha) {
        const hoy = this.hoyIso();
        const f = String(fecha);
        if (f < hoy) return 'vencidos';
        if (f === hoy) return 'hoy';
        return 'proximos';
    }

    get vtoBase() {
        let filas = this.vtoData;
        if (this.vtoFechaFiltro) filas = filas.filter(c => String(c.fecha) === this.vtoFechaFiltro);
        if (this.vtoDesde) filas = filas.filter(c => String(c.fecha) >= this.vtoDesde);
        if (this.vtoHasta) filas = filas.filter(c => String(c.fecha) <= this.vtoHasta);
        if (this.vtoTipoFiltro === 'delante') {
            filas = filas.filter(c => this.vtoTipo(c.fecha) !== 'vencidos');
        } else if (this.vtoTipoFiltro) {
            filas = filas.filter(c => this.vtoTipo(c.fecha) === this.vtoTipoFiltro);
        }
        return filas;
    }

    get vtoFechaLabel() { return 'Vencimiento del ' + this.fmtFecha(this.vtoFechaFiltro); }
    get hayVtoFechaFiltro() { return !!this.vtoFechaFiltro; }
    handleVtoFechaClear() { this.vtoFechaFiltro = ''; }

    // Rango de fecha de vencimiento desde/hasta; al fijarlo se quita el
    // filtro de las cajas para que también entren los vencidos del rango
    @track vtoDesde = '';
    @track vtoHasta = '';
    handleVtoDesde(e) {
        this.vtoDesde = e.detail.value || '';
        if (this.vtoDesde || this.vtoHasta) this.vtoTipoFiltro = '';
    }
    handleVtoHasta(e) {
        this.vtoHasta = e.detail.value || '';
        if (this.vtoDesde || this.vtoHasta) this.vtoTipoFiltro = '';
    }

    // Total por empresa titular de la ficha del usuario asignado, encima de
    // la lista de usuarios y cruzado con ella
    @track vtoTitularSel = '';

    vtoAplicarTitular(filas) {
        if (!this.vtoTitularSel) return filas;
        return filas.filter(c => (c.empresaTitularUsuario || 'SIN') === this.vtoTitularSel);
    }

    get vtoTitulares() {
        const filas = !this.vtoAsesorSel ? this.vtoBase
            : this.vtoBase.filter(c => (c.asesorId || 'SIN') === this.vtoAsesorSel);
        return this.listaValores(filas, c => c.empresaTitularUsuario || 'SIN',
            c => c.empresaTitularUsuario || 'Sin empresa titular',
            this.vtoTitularSel, 'Todas las empresas');
    }

    handleVtoTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.vtoTitularSel = this.vtoTitularSel === k ? '' : k;
        this.vtoAsesorSel = this.validarSel(this.vtoAplicarTitular(this.vtoBase), this.vtoAsesorSel);
    }

    get vtoAsesores() {
        return this.listaAsesores(this.vtoAplicarTitular(this.vtoBase), this.vtoAsesorSel);
    }

    handleVtoAsesor(e) { this.vtoAsesorSel = e.currentTarget.dataset.key; }

    // Ver mis vencimientos: alterna el filtro por asesor con el usuario conectado
    get vtoMiosActivo() { return this.vtoAsesorSel === USER_ID; }
    get vtoMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.vtoMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleVtoMios() { this.vtoAsesorSel = this.vtoMiosActivo ? '' : USER_ID; }

    get vtoFiltradas() {
        const filas = this.vtoAplicarTitular(this.vtoData);
        if (!this.vtoAsesorSel) return filas;
        return filas.filter(c => (c.asesorId || 'SIN') === this.vtoAsesorSel);
    }

    handleVtoKpi(e) {
        const k = e.currentTarget.dataset.kpi;
        this.vtoTipoFiltro = this.vtoTipoFiltro === k ? '' : k;
        this.vtoAsesorSel = this.validarSel(this.vtoBase, this.vtoAsesorSel);
    }

    handleVtoTotal() {
        this.vtoTipoFiltro = '';
        this.vtoAsesorSel = '';
        this.vtoBusqueda = '';
        this.vtoFechaFiltro = '';
        this.vtoDesde = '';
        this.vtoHasta = '';
        this.vtoTitularSel = '';
        this.vtoAgruparPor = '';
    }

    handleVtoBusqueda(e) { this.vtoBusqueda = e.detail.value; }

    get vtoMostradas() {
        let filas = this.vtoAplicarTitular(this.vtoBase);
        if (this.vtoAsesorSel) filas = filas.filter(c => (c.asesorId || 'SIN') === this.vtoAsesorSel);
        return this.aplicarBusqueda(filas, this.vtoBusqueda);
    }

    // ===== Subvistas Lista / Calendario =====
    get esVtoLista() { return this.vtoVista === 'lista'; }
    get esVtoCalendario() { return this.vtoVista === 'calendario'; }
    get vtoTabListaCls() {
        return this.esVtoLista ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    get vtoTabCalCls() {
        return this.esVtoCalendario ? 'lm-subtab lm-subtab-active' : 'lm-subtab';
    }
    handleVtoVista(e) { this.vtoVista = e.currentTarget.dataset.vista; }

    handleVtoMesPrev() {
        if (this.vtoCalMes === 1) { this.vtoCalMes = 12; this.vtoCalAnio--; }
        else this.vtoCalMes--;
    }
    handleVtoMesNext() {
        if (this.vtoCalMes === 12) { this.vtoCalMes = 1; this.vtoCalAnio++; }
        else this.vtoCalMes++;
    }

    get vtoCalTitulo() {
        return MESES[this.vtoCalMes - 1] + ' ' + this.vtoCalAnio;
    }

    get vtoCalDiasSemana() {
        return ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    }

    // Celdas del mes: solo el número de vencimientos; el calendario respeta el
    // usuario seleccionado y el buscador, pero no los filtros de caja ni de fecha
    get vtoCalCeldas() {
        const y = this.vtoCalAnio;
        const m = this.vtoCalMes;
        const base = this.aplicarBusqueda(this.vtoFiltradas, this.vtoBusqueda);
        const prefijo = `${y}-${String(m).padStart(2, '0')}-`;
        const porDia = {};
        base.forEach(c => {
            const f = String(c.fecha);
            if (f.startsWith(prefijo)) porDia[f] = (porDia[f] || 0) + 1;
        });

        const hoyIso = this.hoyIso();
        const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lunes = 0
        const diasMes = new Date(y, m, 0).getDate();
        const celdas = [];
        for (let i = 0; i < offset; i++) {
            celdas.push({ key: 'v' + i, cls: 'acf-cal-celda acf-cal-vacia' });
        }
        for (let d = 1; d <= diasMes; d++) {
            const fecha = prefijo + String(d).padStart(2, '0');
            const n = porDia[fecha] || 0;
            const finde = celdas.length % 7 >= 5;
            let cls = 'acf-cal-celda';
            if (finde) cls += ' acf-cal-finde';
            if (fecha === hoyIso) cls += ' acf-cal-hoy';
            if (n > 0) cls += ' acf-cal-con';
            celdas.push({
                key: fecha,
                fecha,
                dia: d,
                num: n > 0 ? this.fmtNumber(n) : '',
                cls
            });
        }
        while (celdas.length % 7 !== 0) {
            celdas.push({ key: 'f' + celdas.length, cls: 'acf-cal-celda acf-cal-vacia' });
        }
        return celdas;
    }

    // Pinchar un día con vencimientos vuelve a la lista filtrada por esa fecha
    handleVtoCalDia(e) {
        const fecha = e.currentTarget.dataset.fecha;
        if (!fecha) return;
        const celda = this.vtoCalCeldas.find(c => c.fecha === fecha);
        if (!celda || !celda.num) return;
        this.vtoTipoFiltro = '';
        this.vtoFechaFiltro = fecha;
        this.vtoVista = 'lista';
    }

    // Agrupado del listado: por asesor o por empresa titular del usuario
    @track vtoAgruparPor = '';
    handleVtoAgrAsesor() { this.vtoAgruparPor = this.vtoAgruparPor === 'asesor' ? '' : 'asesor'; }
    handleVtoAgrTitular() { this.vtoAgruparPor = this.vtoAgruparPor === 'titular' ? '' : 'titular'; }
    get vtoAgrAsesorCls() {
        return 'acf-btn-agrupar' + (this.vtoAgruparPor === 'asesor' ? ' acf-btn-agrupar-activo' : '');
    }
    get vtoAgrTitularCls() {
        return 'acf-btn-agrupar' + (this.vtoAgruparPor === 'titular' ? ' acf-btn-agrupar-activo' : '');
    }

    get vtoRows() {
        const hoy = this.hoyIso();
        const base = this.vtoMostradas.map(c => ({
            ...c,
            key: c.id,
            fechaFmt: this.fmtFecha(c.fecha),
            fechaCls: String(c.fecha) < hoy ? 'acf-td-izq acf-vto-vencido'
                : (String(c.fecha) === hoy ? 'acf-td-izq acf-vto-hoy' : 'acf-td-izq'),
            dias: this.diasDesdeHoy(c.fecha),
            ...this.simbolosContrato(c)
        }));
        const clave = this.vtoAgruparPor === 'asesor' ? (c => c.asesor || 'Sin asesor')
            : (this.vtoAgruparPor === 'titular'
                ? (c => c.empresaTitularUsuario || 'Sin empresa titular') : null);
        return this.agruparFilas(base, clave);
    }

    // Símbolos de los contratos fiscal y laboral de la empresa (Ok / Cruz)
    simbolosContrato(c) {
        const sym = v => (v === 'ok' ? '✓' : v === 'cruz' ? '✗' : '');
        const cls = v => 'acf-td-cen ' + (v === 'ok' ? 'acf-ct-ok' : v === 'cruz' ? 'acf-ct-cruz' : '');
        return {
            cfSym: sym(c.contratoFiscal),
            cfCls: cls(c.contratoFiscal),
            clSym: sym(c.contratoLaboral),
            clCls: cls(c.contratoLaboral)
        };
    }

    // Días desde hoy hasta la fecha (negativo si ya está vencida)
    diasDesdeHoy(fecha) {
        if (!fecha) return '';
        const [y, m, d] = String(fecha).split('-').map(Number);
        const h = new Date();
        const diff = (Date.UTC(y, m - 1, d) - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000;
        return this.fmtNumber(Math.round(diff));
    }

    get vtoHayFilas() { return this.vtoMostradas.length > 0; }

    get vtoKpiTotal() { return this.fmtNumber(this.vtoData.length); }
    vtoKpiNum(tipo) {
        return this.fmtNumber(this.vtoFiltradas.filter(c => this.vtoTipo(c.fecha) === tipo).length);
    }
    vtoKpiCls(tipo, color) {
        return 'acf-kpi acf-kpi-' + color + ' acf-kpi-click'
            + (this.vtoTipoFiltro === tipo ? ' acf-kpi-active-' + color : '');
    }
    get vtoKpiVencidos() { return this.vtoKpiNum('vencidos'); }
    get vtoKpiHoy() { return this.vtoKpiNum('hoy'); }
    get vtoKpiProximos() { return this.vtoKpiNum('proximos'); }
    get vtoKpiVencidosCls() { return this.vtoKpiCls('vencidos', 'rojo'); }
    get vtoKpiHoyCls() { return this.vtoKpiCls('hoy', 'azul'); }
    get vtoKpiProximosCls() { return this.vtoKpiCls('proximos', 'verde'); }

    // ===== Pestaña Contratos contables y fiscal =====
    @track ccData = [];
    @track ccCargado = false;
    @track ccLoading = false;
    @track ccError = null;
    @track ccBusqueda = '';
    @track ccTitularesSel = [];
    @track ccAsesoresSel = [];
    @track ccTiposSel = [];
    @track ccCensosSel = [];
    @track ccServiciosSel = [];   // tipo de servicio (visual: Asesoría / Consultoría...)
    @track ccGruposSel = [];      // grupo empresarial
    @track showCcServicioDd = false;
    @track showCcGrupoDd = false;
    @track showCcTitularDd = false;
    @track showCcAsesorDd = false;
    @track showCcTipoDd = false;
    @track showCcCensoDd = false;

    cargarCc() {
        this.ccLoading = true;
        this.ccError = null;
        getContratosCF()
            .then(res => { this.ccData = res || []; this.ccCargado = true; })
            .catch(err => { this.ccError = this.reduceError(err); })
            .finally(() => { this.ccLoading = false; });
        // Evolución de contratos vivos por meses, en paralelo al listado
        this.cargarCcMeses();
    }

    // Cajas y gráficos por empresa de la cabecera; se recalculan en el servidor
    // con los filtros de titular gestión, asesor responsable y tipo de empresa
    // (el gráfico de 12 meses va siempre fijo con todos los contratos)
    cargarCcMeses() {
        getContratosCFMeses({
            titulares: this.ccTitularesSel,
            asesores: this.ccAsesoresSel,
            tipos: this.ccTiposSel
        })
            .then(res => { this.ccMeses = res; })
            .catch(() => { this.ccMeses = null; });
    }

    // Caja de total y gráfico de contratos vivos al cierre de cada mes
    @track ccMeses = null;
    get hayCcMeses() { return !!(this.ccMeses && (this.ccMeses.meses || []).length); }
    get ccTotalHoy() { return this.fmtNumber((this.ccMeses && this.ccMeses.totalHoy) || 0); }
    get ccTotalConsultoria() { return this.fmtNumber((this.ccMeses && this.ccMeses.totalConsultoria) || 0); }
    get ccTotalContableFiscal() { return this.fmtNumber((this.ccMeses && this.ccMeses.totalContableFiscal) || 0); }
    get ccTotalAsesores() { return this.fmtNumber((this.ccMeses && this.ccMeses.totalAsesores) || 0); }

    // Porcentaje de cada tipo de contrato sobre el total de contratos vivos
    ccPct(n) {
        const total = (this.ccMeses && this.ccMeses.totalHoy) || 0;
        return total ? Math.round((n * 100) / total) + '%' : '';
    }
    get ccPctConsultoria() { return this.ccPct((this.ccMeses && this.ccMeses.totalConsultoria) || 0); }
    get ccPctContableFiscal() { return this.ccPct((this.ccMeses && this.ccMeses.totalContableFiscal) || 0); }

    // Barras horizontales de contratos vivos por empresa titular gestión;
    // pinchar una barra filtra el listado por esa empresa titular
    get ccPorTitular() {
        const arr = (this.ccMeses && this.ccMeses.porTitular) || [];
        const max = Math.max(1, ...arr.map(e => e.n || 0));
        return arr.map(e => {
            const activa = this.ccTitularesSel.length === 1 && this.ccTitularesSel[0] === e.nombre;
            return {
                key: e.nombre,
                nombre: e.nombre,
                n: this.fmtNumber(e.n || 0),
                barStyle: 'width:' + Math.max(2, Math.round((e.n || 0) / max * 100)) + '%',
                filaCls: 'cc-tit-fila' + (activa ? ' cc-tit-fila-activa' : '')
            };
        });
    }
    handleCcTitularBar(e) {
        const t = e.currentTarget.dataset.titular;
        const activa = this.ccTitularesSel.length === 1 && this.ccTitularesSel[0] === t;
        this.ccTitularesSel = activa ? [] : [t];
        this.cargarCcMeses();
    }

    // Barras horizontales solo informativas (facturación y comercial)
    ccBarras(lista) {
        const arr = lista || [];
        const max = Math.max(1, ...arr.map(e => e.n || 0));
        return arr.map(e => ({
            key: e.nombre,
            nombre: e.nombre,
            n: this.fmtNumber(e.n || 0),
            barStyle: 'width:' + Math.max(2, Math.round((e.n || 0) / max * 100)) + '%'
        }));
    }
    get ccPorFacturacion() { return this.ccBarras(this.ccMeses && this.ccMeses.porFacturacion); }
    get ccPorComercial() { return this.ccBarras(this.ccMeses && this.ccMeses.porComercial); }
    get ccPlantilla() {
        const arr = (this.ccMeses && this.ccMeses.meses) || [];
        const valores = arr.map(p => p.n || 0);
        const max = Math.max(...valores, 0);
        const min = Math.min(...valores);
        const escala = n => max === min ? 80 : 60 + Math.round((n - min) / (max - min) * 40);
        // Barra apilada: activos abajo (azul) e inactivos arriba (naranja), a
        // escala del total del mes
        return arr.map(p => {
            const n = p.n || 0;
            const act = p.activos || 0;
            const inact = p.inactivos || 0;
            const total = act + inact || n || 1;
            return {
                key: p.anio + '-' + p.mes,
                mes: String(p.mes).padStart(2, '0'),
                n: this.fmtNumber(n),
                barStyle: 'height:' + escala(n) + '%',
                actStyle: 'height:' + Math.round((act / total) * 100) + '%',
                inactStyle: 'height:' + Math.round((inact / total) * 100) + '%',
                titulo: this.fmtNumber(act) + ' activos · ' + this.fmtNumber(inact) + ' inactivos'
            };
        });
    }
    get ccPlantillaAnios() {
        const arr = (this.ccMeses && this.ccMeses.meses) || [];
        const grupos = [];
        arr.forEach(p => {
            const ultimo = grupos[grupos.length - 1];
            if (ultimo && ultimo.anio === p.anio) ultimo.n++;
            else grupos.push({ anio: p.anio, n: 1 });
        });
        return grupos.map(g => ({
            anio: g.anio,
            style: 'width:' + (g.n / Math.max(1, arr.length) * 100) + '%'
        }));
    }

    handleCcRefresh() { this.cargarCc(); }
    handleCcBusqueda(e) { this.ccBusqueda = e.detail.value; }

    get ccHasError() { return !!this.ccError; }
    get ccShow() { return this.esContratosCF && !this.ccLoading && !this.ccError; }

    get ccMostradas() {
        let filas = this.ccData;
        if (this.ccTitularesSel.length) {
            filas = filas.filter(c => this.ccTitularesSel.includes(c.empresaTitularGestion || 'Sin empresa titular'));
        }
        if (this.ccAsesoresSel.length) {
            filas = filas.filter(c => this.ccAsesoresSel.includes(c.asesorId || 'SIN'));
        }
        if (this.ccTiposSel.length) {
            filas = filas.filter(c => this.ccTiposSel.includes(c.tipoEmpresa || 'Sin tipo'));
        }
        if (this.ccCensosSel.length) {
            filas = filas.filter(c => this.ccCensosSel.includes(c.censo || 'Sin censo'));
        }
        if (this.ccServiciosSel.length) {
            filas = filas.filter(c => this.ccServiciosSel.includes(this.ccServicioClave(c)));
        }
        if (this.ccGruposSel.length) {
            filas = filas.filter(c => this.ccGruposSel.includes(this.ccGrupoClave(c)));
        }
        if (this.ccColFiltro) {
            filas = filas.filter(c => (Number(c[this.ccColFiltro]) || 0) > 0);
        }
        return this.aplicarBusqueda(filas, this.ccBusqueda);
    }

    // ===== Multiselección de empresa titular de gestión =====
    get ccTitularOptionsView() {
        return this.opcionesMs(
            this.ccData.map(c => c.empresaTitularGestion || 'Sin empresa titular'), this.ccTitularesSel);
    }
    get ccTitularTriggerLabel() { return this.etiquetaMs(this.ccTitularesSel, 'Todas'); }
    toggleCcTitularDd() { this.showCcTitularDd = !this.showCcTitularDd; }
    closeCcTitularDd() { this.showCcTitularDd = false; }
    handleCcTitularToggle(e) {
        this.ccTitularesSel = this.alternar(this.ccTitularesSel, e.currentTarget.dataset.value);
        this.cargarCcMeses();
    }
    handleCcTitularTodas() {
        this.ccTitularesSel = [];
        this.cargarCcMeses();
    }

    // ===== Multiselección de tipo de empresa =====
    get ccTipoOptionsView() {
        return this.opcionesMs(this.ccData.map(c => c.tipoEmpresa || 'Sin tipo'), this.ccTiposSel);
    }
    get ccTipoTriggerLabel() { return this.etiquetaMs(this.ccTiposSel, 'Todos'); }
    toggleCcTipoDd() { this.showCcTipoDd = !this.showCcTipoDd; }
    closeCcTipoDd() { this.showCcTipoDd = false; }
    handleCcTipoToggle(e) {
        this.ccTiposSel = this.alternar(this.ccTiposSel, e.currentTarget.dataset.value);
        this.cargarCcMeses();
    }
    handleCcTipoTodos() {
        this.ccTiposSel = [];
        this.cargarCcMeses();
    }

    // ===== Multiselección de situación censal AEAT =====
    get ccCensoOptionsView() {
        return this.opcionesMs(this.ccData.map(c => c.censo || 'Sin censo'), this.ccCensosSel);
    }
    get ccCensoTriggerLabel() { return this.etiquetaMs(this.ccCensosSel, 'Todos'); }
    toggleCcCensoDd() { this.showCcCensoDd = !this.showCcCensoDd; }
    closeCcCensoDd() { this.showCcCensoDd = false; }
    handleCcCensoToggle(e) {
        this.ccCensosSel = this.alternar(this.ccCensosSel, e.currentTarget.dataset.value);
    }
    handleCcCensoTodos() { this.ccCensosSel = []; }

    // ===== Multiselección de tipo de servicio =====
    ccServicioClave(c) { return this.tipoServicioChip(c.tipoServicio).servicioLabel || 'Sin tipo de servicio'; }
    get ccServicioOptionsView() {
        return this.opcionesMs(this.ccData.map(c => this.ccServicioClave(c)), this.ccServiciosSel);
    }
    get ccServicioTriggerLabel() { return this.etiquetaMs(this.ccServiciosSel, 'Todos'); }
    toggleCcServicioDd() { this.showCcServicioDd = !this.showCcServicioDd; }
    closeCcServicioDd() { this.showCcServicioDd = false; }
    handleCcServicioToggle(e) {
        this.ccServiciosSel = this.alternar(this.ccServiciosSel, e.currentTarget.dataset.value);
    }
    handleCcServicioTodos() { this.ccServiciosSel = []; }

    // ===== Multiselección de grupo empresarial =====
    ccGrupoClave(c) { return String(c.grupo || '').trim() || 'Sin grupo'; }
    get ccGrupoOptionsView() {
        return this.opcionesMs(this.ccData.map(c => this.ccGrupoClave(c)), this.ccGruposSel);
    }
    get ccGrupoTriggerLabel() { return this.etiquetaMs(this.ccGruposSel, 'Todos'); }
    toggleCcGrupoDd() { this.showCcGrupoDd = !this.showCcGrupoDd; }
    closeCcGrupoDd() { this.showCcGrupoDd = false; }
    handleCcGrupoToggle(e) {
        this.ccGruposSel = this.alternar(this.ccGruposSel, e.currentTarget.dataset.value);
    }
    handleCcGrupoTodos() { this.ccGruposSel = []; }

    // ===== Multiselección de asesor responsable =====
    get ccAsesorOptionsView() {
        const porAsesor = new Map();
        this.ccData.forEach(c => {
            const k = c.asesorId || 'SIN';
            if (!porAsesor.has(k)) porAsesor.set(k, c.asesor || 'Sin asesor');
        });
        return [...porAsesor.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([value, label]) => ({
                value,
                label,
                optionClass: this.ccAsesoresSel.includes(value)
                    ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
            }));
    }
    get ccAsesorTriggerLabel() {
        if (!this.ccAsesoresSel.length) return 'Todos';
        if (this.ccAsesoresSel.length === 1) {
            const opt = this.ccAsesorOptionsView.find(o => o.value === this.ccAsesoresSel[0]);
            return opt ? opt.label : '1 seleccionado';
        }
        return this.ccAsesoresSel.length + ' seleccionados';
    }
    toggleCcAsesorDd() { this.showCcAsesorDd = !this.showCcAsesorDd; }
    closeCcAsesorDd() { this.showCcAsesorDd = false; }
    handleCcAsesorToggle(e) {
        this.ccAsesoresSel = this.alternar(this.ccAsesoresSel, e.currentTarget.dataset.value);
        this.cargarCcMeses();
    }
    handleCcAsesorTodos() {
        this.ccAsesoresSel = [];
        this.cargarCcMeses();
    }

    // Mis contratos: alterna el filtro de asesores con el usuario conectado
    get ccMiosActivo() {
        return this.ccAsesoresSel.length === 1 && this.ccAsesoresSel[0] === USER_ID;
    }
    get ccMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.ccMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleCcMios() {
        this.ccAsesoresSel = this.ccMiosActivo ? [] : [USER_ID];
        this.cargarCcMeses();
    }

    // ===== Filtro por columna de recuento (como en visión por usuarios) =====
    @track ccColFiltro = '';

    get ccCols() {
        const labels = {
            contabilidades: 'Tareas recurrentes', precierres: 'Precierres contables',
            cierres: 'Cierres contables', libros: 'Libros contables', cuentas: 'Cuentas anuales',
            rentas: 'Rentas', expedientes: 'Expedientes', casos: 'Casos', tareas: 'Tareas'
        };
        const inicioBloque = ['contabilidades', 'rentas', 'casos'];
        return COLS_CC.map(campo => ({
            campo,
            label: labels[campo],
            cls: 'acf-th-click' + (this.ccColFiltro === campo ? ' acf-th-activo' : '')
                + (inicioBloque.includes(campo) ? ' acf-sep' : '')
        }));
    }

    handleCcCol(e) {
        const campo = e.currentTarget.dataset.campo;
        this.ccColFiltro = this.ccColFiltro === campo ? '' : campo;
    }

    // Botón Analítica del listado de contratos: de momento sin destino
    handleCcAnalitica(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Desde visión por usuarios: número de contratos → esta pestaña prefiltrada
    handleVisionContratos(e) {
        e.preventDefault();
        e.stopPropagation();
        this.menuActivo = 'balances';
        this.balTabActiva = 'contratoscf';
        if (!this.ccCargado) this.cargarCc();
        this.ccBusqueda = '';
        this.ccTitularesSel = [];
        this.ccColFiltro = '';
        const usuario = e.currentTarget.dataset.usuario || '';
        this.ccAsesoresSel = usuario ? [usuario] : [];
    }

    ccCeldas(src) {
        // Vencidos de la línea, en pequeño bajo el número (mismas reglas que
        // la Visión general)
        const VENC_CC = {
            contabilidades: ['contabVencidas', 'venc.'],
            precierres: ['precVencidos', 'venc.'],
            cierres: ['cierVencidos', 'venc.'],
            libros: ['librosVencidos', 'venc.'],
            cuentas: ['cuentasVencidas', 'venc.']
        };
        return COLS_CC.map(campo => {
            let venc = '';
            if (VENC_CC[campo]) {
                const n = Number(src[VENC_CC[campo][0]]) || 0;
                if (n > 0) venc = this.fmtNumber(n) + ' ' + VENC_CC[campo][1];
            }
            return {
                key: campo,
                val: this.celda(src[campo]),
                venc,
                cls: 'acf-num acf-num-azul'
                    + (['contabilidades', 'rentas', 'casos'].includes(campo) ? ' acf-sep' : '')
            };
        });
    }

    // Agrupación opcional por grupo empresarial (Sin grupo para las que no tienen)
    // Agrupado del listado: por grupo empresarial, tipo de servicio o asesor
    @track ccAgruparPor = '';
    handleCcAgrupar() { this.ccAgruparPor = this.ccAgruparPor === 'grupo' ? '' : 'grupo'; }
    handleCcAgruparTipo() { this.ccAgruparPor = this.ccAgruparPor === 'tipo' ? '' : 'tipo'; }
    handleCcAgruparAsesor() {
        this.ccAgruparPor = this.ccAgruparPor === 'asesor' ? '' : 'asesor';
        // Al agrupar por asesor la lista arranca plegada
        this.ccGruposAbiertos = [];
    }

    // Grupos de asesor abiertos; agrupado por asesor la lista va plegada y
    // cada asesor (o el botón Ampliar todo) despliega sus contratos
    @track ccGruposAbiertos = [];
    get ccEsAgrAsesor() { return this.ccAgruparPor === 'asesor'; }
    get ccGrupoClaves() {
        const claves = new Set();
        this.ccMostradas.forEach(c => claves.add(String(c.asesor || '').trim() || 'Sin asesor'));
        return [...claves];
    }
    get ccTodoAmpliado() {
        const claves = this.ccGrupoClaves;
        return claves.length > 0 && claves.every(k => this.ccGruposAbiertos.includes(k));
    }
    get ccAmpliarTodoLabel() { return this.ccTodoAmpliado ? 'Plegar todo' : 'Ampliar todo'; }
    handleCcAmpliarTodo() {
        this.ccGruposAbiertos = this.ccTodoAmpliado ? [] : this.ccGrupoClaves;
    }
    handleCcGrupoAmpliar(e) {
        this.ccGruposAbiertos = this.alternar(this.ccGruposAbiertos, e.currentTarget.dataset.grupo);
    }
    get ccAgruparCls() {
        return 'acf-btn-agrupar' + (this.ccAgruparPor === 'grupo' ? ' acf-btn-agrupar-activo' : '');
    }
    get ccAgruparTipoCls() {
        return 'acf-btn-agrupar' + (this.ccAgruparPor === 'tipo' ? ' acf-btn-agrupar-activo' : '');
    }
    get ccAgruparAsesorCls() {
        return 'acf-btn-agrupar' + (this.ccAgruparPor === 'asesor' ? ' acf-btn-agrupar-activo' : '');
    }

    // Limpiar: deja los filtros y botones como al llegar a la pestaña
    handleCcLimpiar() {
        this.ccBusqueda = '';
        this.ccTitularesSel = [];
        this.ccAsesoresSel = [];
        this.ccTiposSel = [];
        this.ccCensosSel = [];
        this.ccServiciosSel = [];
        this.ccGruposSel = [];
        this.ccColFiltro = '';
        this.ccAgruparPor = '';
        this.ccGruposAbiertos = [];
        this.cargarCcMeses();
    }

    ccFila(c, idx) {
        return {
            ...c,
            key: c.id,
            idx,
            esGrupo: false,
            clase: 'acf-row',
            celdas: this.ccCeldas(c),
            // Situación censal AEAT: Activa en verde claro, Inactiva en naranja
            censoCls: this.normalizar(c.censo) === 'activa' ? 'acf-chip acf-chip-ok'
                : (this.normalizar(c.censo) === 'inactiva' ? 'acf-chip acf-chip-naranja' : ''),
            ...this.gradoDificultad(c.gradoDificultad),
            ...this.tipoServicioChip(c.tipoServicio)
        };
    }

    get ccFilas() {
        if (!this.ccAgruparPor) {
            return this.ccMostradas.map((c, i) => this.ccFila(c, i + 1));
        }
        // Clave del agrupado: grupo empresarial, tipo de servicio (visual) o asesor
        const modo = this.ccAgruparPor;
        const sinClave = modo === 'tipo' ? 'Sin tipo de servicio'
            : (modo === 'asesor' ? 'Sin asesor' : 'Sin grupo');
        const claveDe = c => {
            if (modo === 'tipo') return this.tipoServicioChip(c.tipoServicio).servicioLabel || sinClave;
            if (modo === 'asesor') return String(c.asesor || '').trim() || sinClave;
            return String(c.grupo || '').trim() || sinClave;
        };
        const porGrupo = new Map();
        this.ccMostradas.forEach(c => {
            const g = claveDe(c);
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g).push(c);
        });
        const claves = [...porGrupo.keys()].sort((a, b) => {
            if (a === sinClave) return 1;
            if (b === sinClave) return -1;
            return a.localeCompare(b, 'es');
        });
        const items = [];
        let idx = 0;
        claves.forEach(g => {
            const miembros = porGrupo.get(g);
            const tot = {};
            [...COLS_CC, ...COLS_CC_VENC].forEach(k => { tot[k] = 0; });
            miembros.forEach(c => {
                [...COLS_CC, ...COLS_CC_VENC].forEach(k => { tot[k] += Number(c[k]) || 0; });
            });
            // Agrupado por asesor: el desglose va plegado y se abre por grupo
            const abierto = modo !== 'asesor' || this.ccGruposAbiertos.includes(g);
            items.push({
                key: 'g·' + g,
                esGrupo: true,
                esGrupoAsesor: modo === 'asesor',
                grupoClave: g,
                abiertoLabel: abierto ? 'Cerrar' : 'Ampliar',
                etiqueta: g + ' · ' + this.fmtNumber(miembros.length)
                    + (miembros.length === 1 ? ' contrato' : ' contratos'),
                clase: 'acf-grupo-empresa',
                celdas: this.ccCeldas(tot)
            });
            if (abierto) miembros.forEach(c => { idx++; items.push(this.ccFila(c, idx)); });
        });
        return items;
    }

    // ¿Es un contrato contable y fiscal? En los datos el tipo de servicio es "Asesoría"
    // (antes "Contable y Fiscal"); la consultoría (fiscal sin gestión contable) queda fuera
    ccEsContableFiscal(label) {
        const t = this.normalizar(label);
        return t.startsWith('contable') || t.startsWith('asesoria');
    }

    // Fiscal sin gestión contable se muestra como Consultoría en chip amarillo
    tipoServicioChip(v) {
        if (this.normalizar(v).startsWith('fiscal sin gestion')) {
            return { servicioLabel: 'Consultoría', servicioCls: 'acf-chip acf-chip-warn' };
        }
        return { servicioLabel: v, servicioCls: '' };
    }

    // El grado de dificultad se resume en un chip: Complicado (rojo) o Estándar (verde)
    gradoDificultad(v) {
        const t = this.normalizar(v);
        if (t.startsWith('complicado')) return { gradoLabel: 'Complicado', gradoCls: 'acf-chip acf-chip-bad' };
        if (t.startsWith('estandar')) return { gradoLabel: 'Estándar', gradoCls: 'acf-chip acf-chip-ok' };
        return { gradoLabel: v, gradoCls: '' };
    }

    get ccTotales() {
        const tot = {};
        [...COLS_CC, ...COLS_CC_VENC].forEach(k => { tot[k] = 0; });
        let consultoria = 0;
        let complicados = 0;
        this.ccMostradas.forEach(c => {
            [...COLS_CC, ...COLS_CC_VENC].forEach(k => { tot[k] += Number(c[k]) || 0; });
            if (this.normalizar(c.tipoServicio).startsWith('fiscal sin gestion')) consultoria++;
            if (this.normalizar(c.gradoDificultad).startsWith('complicado')) complicados++;
        });
        return {
            empresas: `${this.fmtNumber(this.ccMostradas.length)} contratos`,
            consultoria: `${this.fmtNumber(consultoria)} Consultoría`,
            complicados: `${this.fmtNumber(complicados)} Complicados`,
            celdas: this.ccCeldas(tot)
        };
    }

    get ccHayFilas() { return this.ccMostradas.length > 0; }

    // ===== Activos / inactivos (situación censal) de las cajas de Contratos =====
    // Misma base que los totales de las cajas: contratos abiertos con los
    // filtros de titular, asesor y tipo de empresa aplicados
    get ccBaseCajas() {
        let filas = this.ccData;
        if (this.ccTitularesSel.length) {
            filas = filas.filter(c => this.ccTitularesSel.includes(c.empresaTitularGestion || 'Sin empresa titular'));
        }
        if (this.ccAsesoresSel.length) filas = filas.filter(c => this.ccAsesoresSel.includes(c.asesorId || 'SIN'));
        if (this.ccTiposSel.length) filas = filas.filter(c => this.ccTiposSel.includes(c.tipoEmpresa || 'Sin tipo'));
        return filas;
    }
    ccCensoLabel(filas) {
        const act = filas.filter(c => this.normalizar(c.censo) === 'activa').length;
        const inact = filas.filter(c => this.normalizar(c.censo) === 'inactiva').length;
        return this.fmtNumber(act) + (act === 1 ? ' activo' : ' activos') + ' · '
            + this.fmtNumber(inact) + (inact === 1 ? ' inactivo' : ' inactivos');
    }
    get ccCensoTotalLabel() { return this.ccCensoLabel(this.ccBaseCajas); }
    get ccCensoConsultoriaLabel() {
        return this.ccCensoLabel(this.ccBaseCajas.filter(c => this.ccServicioClave(c) === 'Consultoría'));
    }
    get ccCensoContableLabel() {
        return this.ccCensoLabel(this.ccBaseCajas.filter(c => this.ccServicioClave(c) !== 'Consultoría'));
    }

    // Orden por tipo de servicio en la Visión tecnológica: '', 'asc' o 'desc'
    @track ccTecOrden = '';
    handleCcTecOrdenServicio() {
        this.ccTecOrden = this.ccTecOrden === 'asc' ? 'desc' : (this.ccTecOrden === 'desc' ? '' : 'asc');
    }
    get ccTecOrdenServicioCls() { return 'acf-th-izq acf-th-click' + (this.ccTecOrden ? ' acf-th-ordenado' : ''); }
    get ccTecOrdenServicioLabel() {
        return 'Tipo servicio' + (this.ccTecOrden === 'asc' ? ' ▲' : (this.ccTecOrden === 'desc' ? ' ▼' : ''));
    }

    // ===== Subpestañas de Contratos: Visión general (listado), Visión tecnológica y Visión fiscal =====
    @track ccVista = 'general';
    handleCcVista(e) { this.ccVista = e.currentTarget.dataset.vista; }
    get ccVistaGeneral() { return this.ccVista === 'general'; }
    get ccVistaTec() { return this.ccVista === 'tecnologica'; }
    get ccVistaFis() { return this.ccVista === 'fiscal'; }
    get ccVistaGenCls() { return 'lm-subtab' + (this.ccVistaGeneral ? ' lm-subtab-active' : ''); }
    get ccVistaTecCls() { return 'lm-subtab' + (this.ccVistaTec ? ' lm-subtab-active' : ''); }
    // La pestaña Visión fiscal lleva entre paréntesis el total de avisos de control interno
    // de todo el listado y va en rojo claro si hay alguno
    get ccVistaFisCls() {
        return 'lm-subtab' + (this.ccVistaFis ? ' lm-subtab-active' : '')
            + (this.ccFisAvisosTotal > 0 ? ' lm-subtab-rojo' : '');
    }
    get ccVistaFisLabel() { return 'Visión fiscal (' + this.fmtNumber(this.ccFisAvisosTotal) + ')'; }
    // Total de avisos de control interno del listado mostrado: cada contrato suma uno por
    // cada campo vacío entre Territorio fiscal, Operador intracomunitario y Consolidación fiscal
    get ccFisAvisosTotal() {
        return (this.ccMostradas || []).reduce((s, c) => s + (c.territorioFiscal ? 0 : 1)
            + (c.operadorIntracomunitario ? 0 : 1) + (c.consolidacionFiscal ? 0 : 1), 0);
    }

    // Situación censal AEAT como chip: Activa en verde, Inactiva en naranja
    censoChip(v) {
        const t = this.normalizar(v);
        if (t === 'activa') return { censoLabel: 'Activa', censoCls: 'acf-chip acf-chip-ok' };
        if (t === 'inactiva') return { censoLabel: 'Inactiva', censoCls: 'acf-chip acf-chip-naranja' };
        return { censoLabel: v || '', censoCls: '' };
    }

    // Chip Sí/No: verde para Sí, gris para No o vacío
    chipSiNo(v) {
        const t = this.normalizar(v);
        if (t === 'si' || t === 'sí') return { label: 'Sí', cls: 'acf-chip acf-chip-ok' };
        if (t === 'no') return { label: 'No', cls: 'acf-chip acf-chip-neutro' };
        return { label: v || '', cls: '' };
    }

    // Numera de 1 en adelante las filas de contrato visibles (las filas de grupo no cuentan)
    ccNumerar(rows) {
        let n = 0;
        return rows.map(c => (c.esGrupo ? c : { ...c, n: ++n }));
    }

    // Filas de la Visión tecnológica: mismos contratos que el listado (filtros y
    // buscador incluidos), con los campos técnicos del contrato
    get ccTecRows() {
        const filas = this.ccTecFilasPlanas;
        if (!this.ccAgruparPor) return this.ccNumerar(filas);
        const modo = this.ccAgruparPor;
        const sinClave = modo === 'tipo' ? 'Sin tipo de servicio'
            : (modo === 'asesor' ? 'Sin asesor' : 'Sin grupo');
        const claveDe = c => {
            if (modo === 'tipo') return this.tipoServicioChip(c.tipoServicio).servicioLabel || sinClave;
            if (modo === 'asesor') return String(c.asesor || '').trim() || sinClave;
            return String(c.grupo || '').trim() || sinClave;
        };
        const porGrupo = new Map();
        filas.forEach(c => {
            const g = claveDe(c);
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g).push(c);
        });
        const claves = [...porGrupo.keys()].sort((a, b) => {
            if (a === sinClave) return 1;
            if (b === sinClave) return -1;
            return a.localeCompare(b, 'es');
        });
        const items = [];
        claves.forEach(g => {
            const miembros = porGrupo.get(g);
            const abierto = modo !== 'asesor' || this.ccGruposAbiertos.includes(g);
            items.push({
                key: 'g·' + g,
                esGrupo: true,
                esGrupoAsesor: modo === 'asesor',
                grupoClave: g,
                abiertoLabel: abierto ? 'Cerrar' : 'Ampliar',
                etiqueta: g + ' · ' + this.fmtNumber(miembros.length)
                    + (miembros.length === 1 ? ' contrato' : ' contratos')
            });
            if (abierto) miembros.forEach(c => items.push(c));
        });
        return this.ccNumerar(items);
    }

    // Filas de la Visión fiscal: los mismos contratos y agrupación que la Visión tecnológica
    // (nº, empresa, grupo, censo, asesor, tipo de servicio y grado de dificultad) más las
    // columnas de Control interno y sus avisos, calculados en ccTecFilasPlanas
    get ccFisRows() { return this.ccTecRows; }

    get ccTecFilasPlanas() {
        let base = this.ccMostradas;
        if (this.ccTecOrden) {
            const dir = this.ccTecOrden === 'asc' ? 1 : -1;
            base = [...base].sort((a, b) => dir * this.ccServicioClave(a).localeCompare(this.ccServicioClave(b), 'es')
                || String(a.empresa || '').localeCompare(String(b.empresa || ''), 'es'));
        }
        return base.map((c, i) => {
            const erp = this.chipSiNo(c.contabEnErp);
            const portal = this.chipSiNo(c.accesoPortal);
            const caja = this.chipSiNo(c.hojaCaja);
            // Avisos tecnológicos: el software de facturas emitidas debe estar informado en todo
            // contrato, y en los contables y fiscales (Asesoría) también las tres recepciones
            // (emitidas, recibidas, bancos). Triángulo rojo delante de la empresa y en cada celda vacía
            const chipServicio = this.tipoServicioChip(c.tipoServicio);
            const esCf = this.ccEsContableFiscal(chipServicio.servicioLabel);
            const faltaSw = !c.softwareFacturacion;
            const faltaRecE = esCf && !c.recepEmitidas;
            const faltaRecR = esCf && !c.recepRecibidas;
            const faltaRecB = esCf && !c.recepBancos;
            const tecAvisos = [];
            if (faltaSw) tecAvisos.push('Sin software de facturas emitidas');
            if (faltaRecE) tecAvisos.push('Sin recepción de facturas emitidas');
            if (faltaRecR) tecAvisos.push('Sin recepción de facturas recibidas');
            if (faltaRecB) tecAvisos.push('Sin recepción de bancos');
            // Avisos de control interno (Visión fiscal): Territorio fiscal, Operador
            // intracomunitario y Consolidación fiscal deben estar informados en todo contrato.
            // Triángulo con el nº de avisos delante de la empresa y otro en cada celda vacía
            const faltaTerr = !c.territorioFiscal;
            const faltaOper = !c.operadorIntracomunitario;
            const faltaConsol = !c.consolidacionFiscal;
            const fisAvisos = [];
            if (faltaTerr) fisAvisos.push('Sin territorio fiscal');
            if (faltaOper) fisAvisos.push('Sin operador intracomunitario');
            if (faltaConsol) fisAvisos.push('Sin consolidación fiscal');
            return {
                ...c,
                key: c.id,
                idx: i + 1,
                ...chipServicio,
                hayTecAviso: tecAvisos.length > 0,
                tecAvisoTitle: tecAvisos.join('\n'),
                faltaSw, faltaRecE, faltaRecR, faltaRecB,
                hayFisAviso: fisAvisos.length > 0,
                fisAvisosN: fisAvisos.length,
                fisAvisoTitle: fisAvisos.join('\n'),
                faltaTerr, faltaOper, faltaConsol,
                ...this.gradoDificultad(c.gradoDificultad),
                ...this.censoChip(c.censo),
                erpLabel: erp.label, erpCls: erp.cls,
                portalLabel: portal.label, portalCls: portal.cls,
                cajaLabel: caja.label, cajaCls: caja.cls
            };
        });
    }

    // ===== Buscador por empresa y asesor de los listados =====
    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Busca por empresa, asesor, grupo y, en las listas que lo tienen (vencimientos legales), por asunto
    aplicarBusqueda(filas, q) {
        const t = this.normalizar(q);
        if (!t) return filas;
        return filas.filter(c => this.normalizar(c.empresa).includes(t)
            || this.normalizar(c.asesor).includes(t)
            || this.normalizar(c.grupo).includes(t)
            || this.normalizar(c.asunto).includes(t));
    }

    // Vencido si hoy es posterior al día y mes límite del año del ejercicio
    // (misma regla que los avisos de vencidos de la Visión general)
    registroVencido(ejercicio, mes, dia) {
        const anio = Number(ejercicio);
        if (!anio) return false;
        const limite = new Date(anio, mes - 1, dia);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        return hoy > limite;
    }

    // Agrupa las filas de un listado por la clave indicada en orden alfabético,
    // con una fila de grupo y su subtotal; sin clave, solo numera las filas
    agruparFilas(filas, claveFn) {
        if (!claveFn) return filas.map((c, i) => ({ ...c, idx: i + 1 }));
        const grupos = new Map();
        filas.forEach(c => {
            const k = claveFn(c);
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(c);
        });
        const out = [];
        [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(g => {
            const filasG = grupos.get(g);
            out.push({ key: 'g·' + g, esGrupo: true, etiqueta: g + ' (' + this.fmtNumber(filasG.length) + ')' });
            filasG.forEach((c, i) => out.push({ ...c, idx: i + 1 }));
        });
        return out;
    }

    agruparPorAsesor(filas, agrupar) {
        return this.agruparFilas(filas, agrupar ? (c => c.asesor || 'Sin asesor') : null);
    }

    // Si el asesor seleccionado desaparece del resultado filtrado, vuelve a Todos
    validarSel(base, seleccion) {
        if (!seleccion) return '';
        return base.some(c => (c.asesorId || 'SIN') === seleccion) ? seleccion : '';
    }

    chipEstado(estado) {
        if (['Sin revisar', 'Sin comenzar', 'Cierre pendiente', 'Sin formulario'].includes(estado)) {
            return 'acf-chip acf-chip-bad';
        }
        if (['En curso', 'En Curso', 'Presentar libro', 'Preparar Certif.', 'Revisar Certif.', 'Enviada Certif.',
             'Preparar cuentas', 'Presentar', 'Presupuestar', 'Presupuestado'].includes(estado)) {
            return 'acf-chip acf-chip-info';
        }
        if (['Pendiente cliente', 'Incidencias', 'Descargar datos', 'Asignar'].includes(estado)) {
            return 'acf-chip acf-chip-warn';
        }
        if (estado === 'Presentado' || estado === 'Aceptado') return 'acf-chip acf-chip-ok';
        if (estado === 'Abierto') return 'acf-chip acf-chip-info';
        return 'acf-chip acf-chip-neutro';
    }

    // Agrupar el listado por asesor responsable, grupo empresarial o contacto contable
    @track contabAgruparPor = '';
    contabAgrBtnCls(k) { return 'acf-btn-agrupar' + (this.contabAgruparPor === k ? ' acf-btn-agrupar-activo' : ''); }
    get contabAgrAsesorCls() { return this.contabAgrBtnCls('asesor'); }
    get contabAgrGrupoCls() { return this.contabAgrBtnCls('grupo'); }
    get contabAgrContactoCls() { return this.contabAgrBtnCls('contacto'); }
    handleContabAgrAsesor() { this.contabAgruparPor = this.contabAgruparPor === 'asesor' ? '' : 'asesor'; }
    handleContabAgrGrupo() { this.contabAgruparPor = this.contabAgruparPor === 'grupo' ? '' : 'grupo'; }
    handleContabAgrContacto() { this.contabAgruparPor = this.contabAgruparPor === 'contacto' ? '' : 'contacto'; }

    // ===== Orden por columna del listado de Tareas recurrentes =====
    // Un clic ordena ascendente, otro descendente y el tercero vuelve al orden original
    @track contabOrdenCol = '';
    @track contabOrdenDir = 'asc';
    handleContabOrden(e) {
        const col = e.currentTarget.dataset.col;
        if (this.contabOrdenCol !== col) { this.contabOrdenCol = col; this.contabOrdenDir = 'asc'; }
        else if (this.contabOrdenDir === 'asc') this.contabOrdenDir = 'desc';
        else { this.contabOrdenCol = ''; this.contabOrdenDir = 'asc'; }
    }

    get contabCabeceras() {
        const defs = [
            { key: 'fecha', label: 'Fecha de creación', base: 'acf-th-izq' },
            { key: 'numero', label: 'Nº', base: 'acf-th-izq' },
            { key: 'ejercicio', label: 'Año', base: 'acf-th-izq' },
            { key: 'periodicidad', label: 'Periodo', base: 'acf-th-izq' },
            { key: 'riesgo', label: 'Riesgo', base: 'acf-th-cen' },
            { key: 'tipo', label: 'Tipo de servicio', base: 'acf-th-izq' },
            { key: 'empresa', label: 'Empresa', base: 'acf-th-izq' },
            { key: 'asesor', label: 'Asesor', base: 'acf-th-izq' },
            { key: 'titular', label: 'Empresa titular', sub: 'asesor', base: 'acf-th-izq acf-th-2l' },
            { key: 'emitidas', label: 'F. Emitidas', sub: 'Estado | Recepción', base: 'acf-th-izq acf-th-2l' },
            { key: 'recibidas', label: 'F. Recibidas', sub: 'Estado | Recepción', base: 'acf-th-izq acf-th-2l' },
            { key: 'bancos', label: 'Bancos', sub: 'Estado | Recepción', base: 'acf-th-izq acf-th-2l' },
            { key: 'check', label: 'Check', base: 'acf-th-cen' }
        ];
        const flecha = this.contabOrdenDir === 'asc' ? ' ▲' : ' ▼';
        return defs.map(d => ({
            ...d,
            label: d.label + (this.contabOrdenCol === d.key ? flecha : ''),
            cls: d.base + ' acf-th-click' + (this.contabOrdenCol === d.key ? ' acf-th-ordenado' : '')
        }));
    }

    // Valor de comparación de cada columna; los semáforos ordenan por color
    // (rojo, azul, verde, gris) y después por el texto de recepción
    contabOrdenValor(c, col) {
        const semaforo = (color, recep) =>
            ({ rojo: 0, azul: 1, verde: 2, gris: 3 }[color] ?? 4) + '·' + (recep || '');
        switch (col) {
            case 'fecha': return String(c.fecha || '');
            case 'numero': return String(c.numero || '');
            case 'ejercicio': return String(c.ejercicio || '');
            case 'periodicidad': return String((PERIODOS_CONTAB[c.periodicidad] || [99])[0]).padStart(5, '0');
            case 'riesgo': return this.contabEsVencida(c) ? '0' : '1';
            case 'tipo': return this.contabTipoVisual(c.tipoServicio) || 'zzz';
            case 'empresa': return String(c.empresa || '');
            case 'asesor': return String(c.asesor || '');
            case 'titular': return String(c.empresaTitularUsuario || '');
            case 'emitidas': return semaforo(c.emitColor, c.emitRecep);
            case 'recibidas': return semaforo(c.recColor, c.recRecep);
            case 'bancos': return semaforo(c.banColor, c.banRecep);
            case 'check': return String(c.chkColor || '') + '·' + String(c.checklist || '');
            default: return '';
        }
    }

    get contabRows() {
        const RAYA = '-----------------------';
        const base = this.contabMostradas.map(c => {
            // En Consultoría los círculos grises (sin servicio) llevan una raya
            // en vez del texto de recepción
            const consult = this.normalizar(this.contabTipoVisual(c.tipoServicio)).startsWith('consultor');
            const emitRecep = c.emitRecep || (consult && c.emitColor === 'gris' ? RAYA : '');
            const recRecep = c.recRecep || (consult && c.recColor === 'gris' ? RAYA : '');
            const banRecep = c.banRecep || (consult && c.banColor === 'gris' ? RAYA : '');
            return {
            ...c,
            emitRecep, recRecep, banRecep,
            key: c.id,
            tipoServicio: this.contabTipoVisual(c.tipoServicio),
            tipoCls: this.contabTipoCls(this.contabTipoVisual(c.tipoServicio)),
            vencida: this.contabEsVencida(c),
            fechaFmt: this.fmtFecha(c.fecha),
            emitCls: 'acf-dot acf-dot-' + c.emitColor,
            recCls: 'acf-dot acf-dot-' + c.recColor,
            banCls: 'acf-dot acf-dot-' + c.banColor,
            chkCls: 'acf-dot acf-dot-' + c.chkColor,
            // Con texto de recepción el círculo va alineado a la izquierda; sin él, centrado
            emitTdCls: emitRecep ? 'acf-td-izq acf-td-recep' : 'acf-td-cen',
            recTdCls: recRecep ? 'acf-td-izq acf-td-recep' : 'acf-td-cen',
            banTdCls: banRecep ? 'acf-td-izq acf-td-recep' : 'acf-td-cen'
            };
        });
        if (this.contabOrdenCol) {
            const dir = this.contabOrdenDir === 'asc' ? 1 : -1;
            const col = this.contabOrdenCol;
            base.sort((a, b) => dir * this.contabOrdenValor(a, col)
                .localeCompare(this.contabOrdenValor(b, col), 'es', { numeric: true }));
        }
        const modo = this.contabAgruparPor;
        const clave = modo === 'asesor' ? (c => c.asesor || 'Sin asesor')
            : (modo === 'grupo' ? (c => c.grupo || 'Sin grupo empresarial')
                : (modo === 'contacto' ? (c => c.contacto || 'Sin contacto contable') : null));
        return this.agruparFilas(base, clave);
    }

    get contabHayFilas() { return this.contabMostradas.length > 0; }

    // KPIs: total global y pendientes (semáforo ni verde ni gris) sobre la selección
    get contabKpiTotal() { return this.fmtNumber(this.contabData.length); }
    get contabKpiEmit() {
        return this.fmtNumber(this.contabFiltradas.filter(c => this.contabPendiente(c.emitColor)).length);
    }
    get contabKpiRec() {
        return this.fmtNumber(this.contabFiltradas.filter(c => this.contabPendiente(c.recColor)).length);
    }
    get contabKpiBan() {
        return this.fmtNumber(this.contabFiltradas.filter(c => this.contabPendiente(c.banColor)).length);
    }

    fmtFecha(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).split('-');
        return `${Number(d)}/${Number(m)}/${y}`;
    }

    // El resumen de la Visión general se carga la primera vez que se entra
    // en Área Contable y Fiscal, no al abrir la página
    @track visCargado = false;

    cargar() {
        this.loading = true;
        this.error = null;
        getResumen()
            .then(res => { this.datos = res || []; this.visCargado = true; })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.loading = false; });
        this.cargarVenc();
    }

    handleRefresh() { this.cargar(); }

    // ===== Vencimientos legales (semana actual y siguiente) =====
    @track vencDias = [];
    @track vencSinPresentar = 0;
    @track vencSenalPorDelante = 0;

    cargarVenc() {
        getVencimientosLegales()
            .then(res => {
                this.vencDias = (res && res.dias) || [];
                this.vencSinPresentar = (res && res.sinPresentar) || 0;
                this.vencSenalPorDelante = (res && res.senalamientos) || 0;
            })
            .catch(() => { this.vencDias = []; this.vencSinPresentar = 0; this.vencSenalPorDelante = 0; });
    }

    get vencCeldas() {
        const hoyIso = this.hoyIso();
        return this.vencDias.map(d => {
            const fecha = String(d.fecha);
            const [y, m, dd] = fecha.split('-').map(Number);
            const diaSemana = DIAS_SEMANA[new Date(y, m - 1, dd).getDay()];
            const finde = diaSemana === 'sábado' || diaSemana === 'domingo';
            const esHoy = fecha === hoyIso;
            const pasado = fecha < hoyIso;
            const n = Number(d.n) || 0;
            const s = Number(d.s) || 0;

            let cls = 'acf-venc-celda';
            if (esHoy) cls += ' acf-venc-hoy';
            else if (pasado && n > 0) cls += ' acf-venc-alerta';
            else if (finde) cls += ' acf-venc-finde';
            // Fondo rojo si el día tiene vencimientos o señalamientos
            if (n > 0 || s > 0) cls += ' acf-venc-rojo';

            let resto; let textoCls = 'acf-venc-texto';
            if (n > 0) textoCls += ' acf-venc-link';
            if (pasado) {
                if (n > 0) {
                    resto = n === 1 ? 'vencimiento no presentado' : 'vencimientos no presentados';
                    textoCls += ' acf-venc-texto-alerta';
                } else {
                    resto = 'Todo presentado';
                    textoCls += ' acf-venc-texto-muted';
                }
            } else if (n > 0) {
                resto = n === 1 ? 'vencimiento' : 'vencimientos';
                textoCls += ' acf-venc-texto-rojo';
            } else {
                resto = '— vencimientos';
                textoCls += ' acf-venc-texto-muted';
            }

            return {
                key: fecha,
                cls,
                textoCls,
                esHoy,
                aviso: pasado && n > 0,
                num: n > 0 ? this.fmtNumber(n) : '',
                etiqueta: diaSemana + ' ' + dd + ' ' + MESES[m - 1] + (esHoy ? ' · hoy' : ''),
                resto,
                vencTitle: n > 0 ? 'Ver los vencimientos de este día' : '',
                // Señalamientos legales del día (eventos): enlazan a su pestaña,
                // con el número al mismo tamaño que el de los vencimientos
                senal: s > 0 ? this.fmtNumber(s) + (s === 1 ? ' señalamiento' : ' señalamientos') : '',
                senalNum: s > 0 ? this.fmtNumber(s) : '',
                senalTexto: s > 0 ? (s === 1 ? 'señalamiento' : 'señalamientos') : ''
            };
        });
    }

    // Las píldoras del calendario abren la pestaña de próximos vencimientos prefiltrada
    handleVencSinPresentar() { this.abrirVtosConTipo('vencidos'); }
    handleVencPorDelante() { this.abrirVtosConTipo('delante'); }

    abrirVtosConTipo(tipo) {
        this.menuActivo = 'operativa';
        this.opTabActiva = 'vtos';
        if (!this.vtoCargado) this.cargarVto();
        this.vtoAsesorSel = '';
        this.vtoBusqueda = '';
        this.vtoFechaFiltro = '';
        this.vtoTipoFiltro = tipo;
    }

    // Un día con vencimientos abre la pestaña de próximos vencimientos filtrada por esa fecha
    handleVencDia(e) {
        const fecha = e.currentTarget.dataset.fecha;
        const celda = this.vencDias.find(d => String(d.fecha) === fecha);
        if (!celda || !(Number(celda.n) > 0)) return;
        this.menuActivo = 'operativa';
        this.opTabActiva = 'vtos';
        if (!this.vtoCargado) this.cargarVto();
        this.vtoTipoFiltro = '';
        this.vtoAsesorSel = '';
        this.vtoBusqueda = '';
        this.vtoFechaFiltro = fecha;
    }

    get vencPorDelante() {
        const hoyIso = this.hoyIso();
        return this.vencDias
            .filter(d => String(d.fecha) >= hoyIso)
            .reduce((acc, d) => acc + (Number(d.n) || 0), 0);
    }
    get vencPorDelanteLabel() { return this.fmtNumber(this.vencPorDelante) + ' vencimientos por delante'; }
    get vencSinPresentarLabel() { return this.fmtNumber(this.vencSinPresentar) + ' sin presentar'; }
    get vencSenalLabel() {
        return this.fmtNumber(this.vencSenalPorDelante)
            + (this.vencSenalPorDelante === 1 ? ' señalamiento por delante' : ' señalamientos por delante');
    }
    get hayVencSinPresentar() { return this.vencSinPresentar > 0; }
    get hayVencCeldas() { return this.vencCeldas.length > 0; }

    // Calendario de la pestaña Vencimientos legales: solo vencimientos (sin señalamientos)
    get vtoCeldas() {
        return this.vencCeldas.map(v => ({
            ...v,
            senal: '',
            cls: v.cls.replace(' acf-venc-rojo', '') + (v.num ? ' acf-venc-rojo' : '')
        }));
    }

    // Calendario de la pestaña Señalamientos legales: solo señalamientos (sin vencimientos)
    get senCeldas() {
        return this.vencCeldas.map(v => ({
            ...v,
            aviso: false,
            cls: v.cls.replace(' acf-venc-rojo', '').replace(' acf-venc-alerta', '')
                + (v.senalNum ? ' acf-venc-rojo' : '')
        }));
    }

    // Los señalamientos del calendario abren la pestaña Señalamientos legales
    abrirSenalamientos() {
        this.menuActivo = 'operativa';
        this.opTabActiva = 'senalamientos';
        if (!this.senCargado) this.cargarSen();
        this.senAsesorSel = '';
        this.senFechaFiltro = '';
    }
    handleVencSenalPorDelante() { this.abrirSenalamientos(); }
    // Un día con señalamientos abre la pestaña prefiltrada por esa fecha
    handleVencSenalDia(e) {
        const fecha = e.currentTarget.dataset.fecha;
        const celda = this.vencDias.find(d => String(d.fecha) === fecha);
        if (!celda || !(Number(celda.s) > 0)) return;
        this.abrirSenalamientos();
        this.senFechaFiltro = fecha;
    }

    hoyIso() {
        const h = new Date();
        const mm = String(h.getMonth() + 1).padStart(2, '0');
        const dd = String(h.getDate()).padStart(2, '0');
        return `${h.getFullYear()}-${mm}-${dd}`;
    }

    // ===== Pestaña Mi situación =====
    @track misTareas = [];
    @track miResumen = null;
    @track misCargado = false;
    @track misLoading = false;
    @track misError = null;
    @track misOrigenSel = '';
    @track misBusqueda = '';
    // El arranque trae solo las 25 tareas más antiguas; el total y el desglose
    // por origen llegan del servidor para que las cifras sean las reales
    @track misTotal = 0;
    @track misOrigenesSrv = [];
    @track misCompletas = false;

    cargarMis() {
        this.misLoading = true;
        this.misError = null;
        getMisTareas()
            .then(res => {
                this.misTareas = res || [];
                this.misTotal = this.misTareas.length;
                this.misCompletas = true;
                this.misCargado = true;
            })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
    }

    // Trae el listado completo al pulsar Ver todas, buscar o filtrar por origen
    cargarMisTodas() {
        if (this.misCompletas || this.misLoading) return;
        this.misLoading = true;
        getMisTareas()
            .then(res => { this.misTareas = res || []; this.misCompletas = true; })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
    }

    // Refresca la carga rápida y el resumen de fondo a la vez
    handleMisRefresh() { this.cargarInicio(); }

    get misHasError() { return !!this.misError; }
    // La estructura de Detalle se pinta al instante; los bloques de datos se
    // rellenan cuando responde la llamada rápida (la ruleta va encima)
    get misShow() { return this.esMiSituacion && !this.misError; }

    // Cajas con mis totales: primero la fila de la carga rápida y, cuando el
    // resumen completo llega en segundo plano, la fila actualizada de este
    get miFila() {
        return this.datos.find(f => f.usuarioId === USER_ID) || this.miResumen || {};
    }

    get misCajas() {
        const f = this.miFila;
        const cajas = [
            // Mis leads: pendientes o atendidos, no convertidos, de los que soy propietario
            { key: 'leads', titulo: 'Mis leads', n: f.leads, venc: 0, sufijo: '', tab: 'leads' },
            { key: 'contabilidades', titulo: 'Mis contabilidades', n: f.contabilidades, venc: f.contabVencidas, sufijo: 'vencidas', tab: 'contabilidad' },
            { key: 'buzon', titulo: 'Mi buzón contable', n: f.buzon, venc: 0, sufijo: '', tab: '' },
            { key: 'precierres', titulo: 'Mis precierres', n: f.precierres, venc: f.precVencidos, sufijo: 'vencidos', tab: 'precierres' },
            { key: 'libros', titulo: 'Mis libros', n: f.libros, venc: f.librosVencidos, sufijo: 'vencidos', tab: 'libros' },
            { key: 'cuentas', titulo: 'Mis cuentas', n: f.cuentas, venc: f.cuentasVencidas, sufijo: 'vencidas', tab: 'cuentas' },
            { key: 'rentas', titulo: 'Mis rentas', n: f.rentas, venc: 0, sufijo: '', tab: 'rentas' },
            { key: 'expedientes', titulo: 'Mis expedientes', n: f.expedientes, venc: 0, sufijo: '', tab: 'expedientes' },
            { key: 'casos', titulo: 'Mis casos', n: f.casos, venc: 0, sufijo: '', tab: 'casos' },
            { key: 'oportunidades', titulo: 'Mis oportunidades', n: f.oportunidades, venc: f.oppVencidas, sufijo: 'vencidas', tab: 'oportunidades' },
            { key: 'vencimientos', titulo: 'Mis vencimientos', n: f.vencimientos, venc: f.vencVencidos, sufijo: 'vencidos', tab: 'vtos' }
        ];
        return cajas.map(c => {
            const venc = (Number(c.venc) || 0) > 0 ? this.fmtNumber(c.venc) + ' ' + c.sufijo : '';
            // Leads, buzón, expedientes y casos avisan en rojo con solo tener número
            const alerta = ['leads', 'buzon', 'expedientes', 'casos'].includes(c.key)
                && (Number(c.n) || 0) > 0;
            // Mis vencimientos: con registros o vencidos, caja en rojo intenso con letras blancas
            const intenso = c.key === 'vencimientos' && ((Number(c.n) || 0) > 0 || (Number(c.venc) || 0) > 0);
            return {
                key: c.key,
                titulo: c.titulo,
                n: this.fmtNumber(c.n || 0),
                venc,
                tab: c.tab,
                // Las cajas con vencidas (o con alerta) se marcan en rojo suave
                cls: 'acf-mis-caja' + (c.tab ? ' acf-mis-caja-click' : '')
                    + (venc || alerta ? ' acf-mis-caja-peligro' : '')
                    + (intenso ? ' acf-mis-caja-intenso' : '')
            };
        });
    }

    handleMisCaja(e) {
        const tab = e.currentTarget.dataset.tab;
        if (!tab) return;
        this.abrirTabConUsuario(tab, USER_ID);
    }

    // Accesos rápidos de la parte superior. El recuento de notificaciones y
    // el fichaje del registro horario se conectarán más adelante.
    @track notifPendientes = 0;

    @track incidAbiertas = 0;

    // Notificaciones e Incidencia informática llevan su total entre paréntesis
    // y la caja en rojo claro cuando hay registros
    get misAccesos() {
        return MIS_ACCESOS.map(a => {
            let n = null;
            if (a.key === 'notificaciones') n = this.notifPendientes;
            if (a.key === 'incidencia') n = this.incidAbiertas;
            const label = n === null ? a.label : a.label + ' (' + this.fmtNumber(n) + ')';
            return {
                ...a,
                label,
                esTimer: a.tipo === 'timer',
                chipCls: 'acf-acceso-icono' + (a.chip ? ' acf-acceso-chip-' + a.chip : ''),
                cls: 'acf-acceso' + (a.url ? ' acf-acceso-click' : '') + (n > 0 ? ' acf-acceso-rojo' : ''),
                badge: ''
            };
        });
    }

    handleAcceso(e) {
        const url = e.currentTarget.dataset.url;
        if (!url) return;
        // Las URLs externas se abren en pestaña nueva; las relativas navegan
        // dentro del sitio (Experience Cloud)
        if (url.startsWith('http')) {
            window.open(url, '_blank');
            return;
        }
        this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url } });
    }

    // Situación de las imputaciones de horas de semanas anteriores.
    // La lógica de cálculo se definirá más adelante; de momento, 0 días
    // pendientes = todo al día.
    @track imputDiasPendientes = 0;

    get imputCajaCls() {
        return 'acf-imput-caja ' + (this.imputDiasPendientes > 0 ? 'acf-imput-caja-roja' : 'acf-imput-caja-verde');
    }
    get imputTexto() {
        const n = this.imputDiasPendientes;
        if (!n) return 'Todo al día';
        return 'Falta' + (n === 1 ? '' : 'n') + ' ' + n + ' día' + (n === 1 ? '' : 's') + ' por imputar';
    }
    get imputSub() {
        return this.imputDiasPendientes > 0 ? 'Revísalo cuanto antes.' : 'Gracias por ser tan diligente.';
    }

    // Tareas agrupadas por origen (columna izquierda). Con el listado recortado
    // los recuentos salen del desglose del servidor; con todo cargado, del local
    get misOrigenes() {
        let lista;
        if (this.misCompletas) {
            const porOrigen = new Map();
            this.misTareas.forEach(t => {
                const k = t.origen || 'Sin origen';
                porOrigen.set(k, (porOrigen.get(k) || 0) + 1);
            });
            lista = [...porOrigen.entries()].map(([k, n]) => ({ key: k, nombre: k, n }));
        } else {
            lista = this.misOrigenesSrv.map(o => ({ key: o.nombre, nombre: o.nombre, n: o.n }));
        }
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        const total = this.misCompletas ? this.misTareas.length : this.misTotal;
        const items = [{ key: '', nombre: 'Todos los orígenes', n: total }, ...lista];
        return items.map(it => ({
            ...it,
            cls: it.key === this.misOrigenSel ? 'acf-user-item acf-user-item-active' : 'acf-user-item'
        }));
    }

    handleMisOrigen(e) {
        this.misOrigenSel = e.currentTarget.dataset.key;
        if (this.misOrigenSel) this.cargarMisTodas();
    }

    // Nueva tarea con la pantalla estándar de creación de Salesforce
    handleMisNuevaTarea() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Task', actionName: 'new' }
        });
    }
    // Realizar telemarketing: abre en una ventana el flujo Telemarketing. Llamadas, el mismo
    // que lanza el botón Realizar telemarketing del objeto Tareas; al terminar el flujo se
    // cierra la ventana y se refresca la lista de tareas
    @track tmkAbierto = false;
    handleTmkAbrir() { this.tmkAbierto = true; }
    handleTmkCerrar() { this.tmkAbierto = false; }
    handleTmkEstado(e) {
        const estado = e.detail && e.detail.status;
        if (estado === 'FINISHED' || estado === 'FINISHED_SCREEN') {
            this.tmkAbierto = false;
            this.handleMisRefresh();
        }
    }
    handleMisTotal() { this.misOrigenSel = ''; }
    handleMisBusqueda(e) {
        this.misBusqueda = e.detail.value;
        if (this.misBusqueda) this.cargarMisTodas();
    }
    handleMisVerTodas() { this.cargarMisTodas(); }

    // Mis próximas tareas: abiertas con vencimiento posterior a hoy
    @track misProximas = false;
    @track misProxTareas = [];
    @track misProxCargado = false;
    get misProxBtnCls() {
        return 'acf-btn-mios acf-btn-vis-mios' + (this.misProximas ? ' acf-btn-vis-mios-activo' : '');
    }
    handleMisProximas() {
        this.misProximas = !this.misProximas;
        if (!this.misProximas || this.misProxCargado) return;
        this.misLoading = true;
        getMisTareasProximas()
            .then(res => { this.misProxTareas = res || []; this.misProxCargado = true; })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
    }

    get misFiltradas() {
        const base = this.misProximas ? this.misProxTareas : this.misTareas;
        if (!this.misOrigenSel) return base;
        return base.filter(t => (t.origen || 'Sin origen') === this.misOrigenSel);
    }

    get misMostradas() {
        const t = this.normalizar(this.misBusqueda);
        if (!t) return this.misFiltradas;
        return this.misFiltradas.filter(c => this.normalizar(c.asunto).includes(t)
            || this.normalizar(c.empresa).includes(t)
            || this.normalizar(c.origen).includes(t)
            || this.normalizar(c.relNombre).includes(t));
    }

    get misRows() {
        const hoy = this.hoyIso();
        return this.misMostradas.map((t, i) => ({
            ...t,
            key: t.id,
            idx: i + 1,
            fechaFmt: this.fmtFecha(t.fecha),
            fechaCls: String(t.fecha) < hoy ? 'acf-td-izq acf-vto-vencido'
                : (String(t.fecha) === hoy ? 'acf-td-izq acf-vto-hoy' : 'acf-td-izq'),
            vtoLegalFmt: this.fmtFecha(t.vtoLegal),
            riesgoCls: 'acf-dot acf-dot-' + (t.riesgo || 'gris')
        }));
    }

    get misHayFilas() { return this.misMostradas.length > 0; }
    get misKpiTotal() {
        return this.fmtNumber(this.misCompletas ? this.misTareas.length : this.misTotal);
    }
    // Botón Ver todas bajo el listado, solo mientras el listado esté recortado
    // y sin filtros de origen o búsqueda que ya lo carguen solos
    get misHayMas() {
        return !this.misProximas && !this.misCompletas && this.misTotal > this.misTareas.length
            && !this.misOrigenSel && !this.misBusqueda;
    }
    get misVerTodasLabel() { return 'Ver todas (' + this.fmtNumber(this.misTotal) + ')'; }

    // ===== Pestaña Tareas: abiertas de todos los usuarios hasta hoy =====
    @track tarData = [];
    @track tarCargado = false;
    @track tarLoading = false;
    @track tarError = null;
    @track tarActivoSel = '';   // '' | 'si' | 'no' (estado del propietario)
    @track tarUsuarioSel = '';
    @track tarOrigenSel = '';
    @track tarBusqueda = '';

    cargarTar() {
        this.tarLoading = true;
        this.tarError = null;
        getTareasTodas()
            .then(res => { this.tarData = res || []; this.tarCargado = true; })
            .catch(err => { this.tarError = this.reduceError(err); })
            .finally(() => { this.tarLoading = false; });
    }

    handleTarRefresh() { this.cargarTar(); }
    handleTarBusqueda(e) { this.tarBusqueda = e.detail.value; }
    get tarHasError() { return !!this.tarError; }
    get tarShow() { return this.esTareasEquipo && !this.tarLoading && !this.tarError; }

    // Cada lista de la izquierda se calcula con los filtros de las demás
    tarFiltrar(usarActivo, usarUsuario, usarOrigen, usarTitular = true) {
        let filas = this.tarData;
        if (usarActivo && this.tarActivoSel) {
            filas = filas.filter(t => (t.ownerActivo ? 'si' : 'no') === this.tarActivoSel);
        }
        if (usarUsuario && this.tarUsuarioSel) {
            filas = filas.filter(t => (t.ownerId || 'SIN') === this.tarUsuarioSel);
        }
        if (usarOrigen && this.tarOrigenSel) {
            filas = filas.filter(t => (t.origen || 'Sin origen') === this.tarOrigenSel);
        }
        if (usarTitular && this.tarTitularSel) {
            filas = filas.filter(t => (t.empresaTitularUsuario || 'SIN') === this.tarTitularSel);
        }
        return filas;
    }

    // Total por empresa titular de la ficha del usuario propietario
    @track tarTitularSel = '';

    get tarTitulares() {
        return this.listaValores(this.tarFiltrar(true, true, true, false),
            t => t.empresaTitularUsuario || 'SIN', t => t.empresaTitularUsuario || 'Sin empresa titular',
            this.tarTitularSel, 'Todas las empresas');
    }

    handleTarTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.tarTitularSel = this.tarTitularSel === k ? '' : k;
        this.tarValidarUsuario();
    }

    get tarKpiTotal() { return this.fmtNumber(this.tarData.length); }
    handleTarTotal() {
        this.tarActivoSel = '';
        this.tarUsuarioSel = '';
        this.tarOrigenSel = '';
        this.tarBusqueda = '';
        this.tarVerTodas = false;
        this.tarTitularSel = '';
    }

    // Total por usuarios activos e inactivos, pinchable; la fila de
    // inactivos avisa en rojo
    get tarActivos() {
        const filas = this.tarFiltrar(false, true, true);
        const nAct = filas.filter(t => t.ownerActivo).length;
        const item = (key, nombre, n) => ({
            key, nombre, n: this.fmtNumber(n),
            cls: 'acf-user-item' + (key === 'no' ? ' tar-item-rojo' : '')
                + (this.tarActivoSel === key ? ' acf-user-item-active' : '')
        });
        return [item('si', 'Usuarios activos', nAct),
                item('no', 'Usuarios inactivos', filas.length - nAct)];
    }

    handleTarActivo(e) {
        const k = e.currentTarget.dataset.key;
        this.tarActivoSel = this.tarActivoSel === k ? '' : k;
        this.tarValidarUsuario();
    }

    // Si el usuario elegido desaparece del resultado filtrado, vuelve a Todos
    tarValidarUsuario() {
        if (this.tarUsuarioSel
            && !this.tarFiltrar(true, false, true).some(t => (t.ownerId || 'SIN') === this.tarUsuarioSel)) {
            this.tarUsuarioSel = '';
        }
    }

    // Total por usuarios, en orden alfabético con Todos primero
    get tarUsuarios() {
        const [todos, ...resto] = this.listaValores(this.tarFiltrar(true, false, true),
            t => t.ownerId || 'SIN', t => t.ownerNombre || 'Sin usuario',
            this.tarUsuarioSel, 'Todos los usuarios');
        resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return [todos, ...resto];
    }

    handleTarUsuario(e) {
        const k = e.currentTarget.dataset.key;
        this.tarUsuarioSel = this.tarUsuarioSel === k ? '' : k;
    }

    // Total por orígenes, de más a menos tareas
    get tarOrigenes() {
        return this.listaValores(this.tarFiltrar(true, true, false),
            t => t.origen || 'Sin origen', t => t.origen || 'Sin origen',
            this.tarOrigenSel, 'Todos los orígenes');
    }

    handleTarOrigen(e) {
        const k = e.currentTarget.dataset.key;
        this.tarOrigenSel = this.tarOrigenSel === k ? '' : k;
        this.tarValidarUsuario();
    }

    // Desplegable de usuarios junto a Nueva tarea (misma selección que la lista)
    get tarUsuarioOpciones() {
        const porU = new Map();
        this.tarFiltrar(true, false, true).forEach(t => {
            const k = t.ownerId || 'SIN';
            if (!porU.has(k)) porU.set(k, { nombre: t.ownerNombre || 'Sin usuario', n: 0 });
            porU.get(k).n++;
        });
        const lista = [...porU.entries()]
            .map(([value, v]) => ({ label: v.nombre + ' (' + v.n + ')', value }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'));
        return [{ label: 'Todos los usuarios', value: '' }, ...lista];
    }

    handleTarUsuarioCombo(e) { this.tarUsuarioSel = e.detail.value; }

    get tarMostradas() {
        const filas = this.tarFiltrar(true, true, true);
        const t = this.normalizar(this.tarBusqueda);
        if (!t) return filas;
        return filas.filter(c => this.normalizar(c.asunto).includes(t)
            || this.normalizar(c.empresa).includes(t)
            || this.normalizar(c.origen).includes(t)
            || this.normalizar(c.relNombre).includes(t)
            || this.normalizar(c.ownerNombre).includes(t));
    }

    // El listado enseña las 50 primeras; Ver todas lo despliega entero
    @track tarVerTodas = false;
    handleTarVerTodas() { this.tarVerTodas = true; }
    get tarHayMas() { return !this.tarVerTodas && this.tarMostradas.length > 50; }
    get tarVerTodasLabel() { return 'Ver todas (' + this.fmtNumber(this.tarMostradas.length) + ')'; }

    get tarRows() {
        const hoy = this.hoyIso();
        const visibles = this.tarVerTodas ? this.tarMostradas : this.tarMostradas.slice(0, 50);
        return visibles.map((t, i) => ({
            ...t,
            key: t.id,
            idx: i + 1,
            fechaFmt: this.fmtFecha(t.fecha),
            fechaCls: String(t.fecha) < hoy ? 'acf-td-izq acf-vto-vencido'
                : (String(t.fecha) === hoy ? 'acf-td-izq acf-vto-hoy' : 'acf-td-izq'),
            vtoLegalFmt: this.fmtFecha(t.vtoLegal),
            riesgoCls: 'acf-dot acf-dot-' + (t.riesgo || 'gris')
        }));
    }

    get tarHayFilas() { return this.tarMostradas.length > 0; }

    // ===== Pestaña Señalamientos legales =====
    @track senData = [];
    @track senCargado = false;
    @track senLoading = false;
    @track senError = null;
    @track senAsesorSel = '';
    @track senFechaFiltro = '';

    cargarSen() {
        this.senLoading = true;
        this.senError = null;
        getSenalamientosLegales()
            .then(res => { this.senData = res || []; this.senCargado = true; })
            .catch(err => { this.senError = this.reduceError(err); })
            .finally(() => { this.senLoading = false; });
    }

    handleSenRefresh() { this.cargarSen(); }

    get senHasError() { return !!this.senError; }
    get senShow() { return this.esSenalamientos && !this.senLoading && !this.senError; }

    // Base del listado: con filtro de fecha, los señalamientos que cubren ese
    // día; sin él, los de hoy en adelante
    get senBase() {
        if (this.senFechaFiltro) {
            return this.senData.filter(s => this.fechaIsoLocal(s.inicio) <= this.senFechaFiltro
                && this.senFechaFiltro <= this.fechaIsoLocal(s.fin || s.inicio));
        }
        const hoy = this.hoyIso();
        return this.senData.filter(s => this.fechaIsoLocal(s.inicio) >= hoy);
    }

    get senFechaLabel() { return 'Señalamientos del ' + this.fmtFecha(this.senFechaFiltro); }
    get haySenFechaFiltro() { return !!this.senFechaFiltro; }
    handleSenFechaClear() { this.senFechaFiltro = ''; }

    get senAsesores() {
        return this.listaAsesores(this.senBase, this.senAsesorSel);
    }

    handleSenAsesor(e) { this.senAsesorSel = e.currentTarget.dataset.key; }
    handleSenTotal() {
        this.senAsesorSel = '';
        this.senFechaFiltro = '';
        this.senAgrAsesor = false;
    }

    // Mis señalamientos: alterna el filtro por asesor con el usuario conectado
    get senMiosActivo() { return this.senAsesorSel === USER_ID; }
    get senMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.senMiosActivo ? ' acf-btn-vis-mios-activo' : ''); }
    handleSenMios() { this.senAsesorSel = this.senMiosActivo ? '' : USER_ID; }

    // Agrupar el listado por persona asignada
    @track senAgrAsesor = false;
    get senAgrAsesorCls() { return 'acf-btn-agrupar' + (this.senAgrAsesor ? ' acf-btn-agrupar-activo' : ''); }
    handleSenAgrAsesor() { this.senAgrAsesor = !this.senAgrAsesor; }

    get senFiltradas() {
        if (!this.senAsesorSel) return this.senBase;
        return this.senBase.filter(s => (s.asesorId || 'SIN') === this.senAsesorSel);
    }

    get senRows() {
        const base = this.senFiltradas.map(s => ({
            ...s,
            key: s.id,
            inicioFmt: this.fmtFechaHora(s.inicio),
            finFmt: this.fmtFechaHora(s.fin)
        }));
        return this.agruparPorAsesor(base, this.senAgrAsesor);
    }

    get senHayFilas() { return this.senFiltradas.length > 0; }
    get senKpiTotal() { return this.fmtNumber(this.senBase.length); }

    // Fecha y hora locales a partir del datetime ISO del servidor
    fmtFechaHora(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const p = n => String(n).padStart(2, '0');
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    // Fecha local yyyy-mm-dd a partir del datetime ISO del servidor
    fechaIsoLocal(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // ===== Pestaña Leads: candidatos no convertidos en Pendiente o Atendido =====
    @track leadData = [];
    @track leadCargado = false;
    @track leadLoading = false;
    @track leadError = null;
    @track leadBusqueda = '';
    @track leadTipoSel = ''; // tipo de lead marcado en la columna izquierda ('' = todos)
    @track leadUsuarioSel = ''; // usuario propietario marcado en la columna izquierda ('' = todos)
    @track leadEventoSel = ''; // valor de Evento marcado (SI / NO / SIN = sin informar; '' = todos)
    @track leadEstadoSel = ''; // estado marcado (PENDIENTE / ATENDIDO; '' = todos), en la lista y en las cajas de arriba

    cargarLead() {
        this.leadLoading = true;
        this.leadError = null;
        getLeadsAbiertos()
            .then(res => { this.leadData = res || []; this.leadCargado = true; })
            .catch(err => { this.leadError = this.reduceError(err); })
            .finally(() => { this.leadLoading = false; });
    }
    handleLeadRefresh() { this.cargarLead(); }
    handleLeadBusqueda(e) { this.leadBusqueda = e.detail.value; }
    get leadHasError() { return !!this.leadError; }
    get leadShow() { return this.esLeads && !this.leadLoading && !this.leadError; }

    // Leads que pasan el buscador (nombre, empresa, email, tipo, formulario, estado y
    // propietario): base del listado y de las dos listas de la columna izquierda
    get leadBase() {
        const t = this.normalizar(this.leadBusqueda);
        return this.leadData.filter(l => !t || [l.nombre, l.empresa, l.email, l.tipo, l.formulario, l.estado, l.propietario]
            .some(v => this.normalizar(v).includes(t)));
    }
    // Columna izquierda: total de leads cargados, acumulado por usuario propietario y
    // reparto por tipo de lead; las dos listas son pinchables y se filtran entre sí
    get leadTotal() { return this.fmtNumber(this.leadData.length); }
    leadClaveUsuario(l) { return l.propietarioId || l.propietario || 'SIN'; }
    // Evento del lead: Sí / No o sin informar, con la clave normalizada para el filtro
    leadClaveEvento(l) {
        const v = this.normalizar(l.evento);
        if (v === 'si') return 'SI';
        if (v === 'no') return 'NO';
        return 'SIN';
    }
    leadEtiquetaEvento(l) {
        const k = this.leadClaveEvento(l);
        return k === 'SI' ? 'Sí' : (k === 'NO' ? 'No' : 'Sin informar');
    }
    leadPasaEvento(l) { return !this.leadEventoSel || this.leadClaveEvento(l) === this.leadEventoSel; }
    // Estado del lead: Atendido o Pendiente (cualquier otro estado abierto cuenta como pendiente)
    leadClaveEstado(l) { return this.normalizar(l.estado).startsWith('atendido') ? 'ATENDIDO' : 'PENDIENTE'; }
    leadEtiquetaEstado(l) { return this.leadClaveEstado(l) === 'ATENDIDO' ? 'Atendido' : 'Pendiente'; }
    leadPasaEstado(l) { return !this.leadEstadoSel || this.leadClaveEstado(l) === this.leadEstadoSel; }
    get leadUsuarios() {
        const base = this.leadBase.filter(l => !this.leadTipoSel || (l.tipo || 'SIN') === this.leadTipoSel)
            .filter(l => this.leadPasaEvento(l)).filter(l => this.leadPasaEstado(l));
        return this.listaValores(base,
            l => this.leadClaveUsuario(l), l => l.propietario || 'Sin propietario',
            this.leadUsuarioSel, 'Todos los usuarios');
    }
    handleLeadUsuario(e) {
        const k = e.currentTarget.dataset.key;
        this.leadUsuarioSel = this.leadUsuarioSel === k ? '' : k;
    }
    get leadTipos() {
        const base = this.leadBase.filter(l => !this.leadUsuarioSel || this.leadClaveUsuario(l) === this.leadUsuarioSel)
            .filter(l => this.leadPasaEvento(l)).filter(l => this.leadPasaEstado(l));
        return this.listaValores(base,
            l => l.tipo || 'SIN', l => l.tipo || 'Sin tipo de lead',
            this.leadTipoSel, 'Todos los tipos');
    }
    handleLeadTipo(e) {
        const k = e.currentTarget.dataset.key;
        this.leadTipoSel = this.leadTipoSel === k ? '' : k;
    }
    // Reparto por Evento (Sí / No / Sin informar), cruzado con el usuario y el tipo marcados
    get leadEventos() {
        const base = this.leadBase
            .filter(l => !this.leadTipoSel || (l.tipo || 'SIN') === this.leadTipoSel)
            .filter(l => !this.leadUsuarioSel || this.leadClaveUsuario(l) === this.leadUsuarioSel)
            .filter(l => this.leadPasaEstado(l));
        return this.listaValores(base,
            l => this.leadClaveEvento(l), l => this.leadEtiquetaEvento(l),
            this.leadEventoSel, 'Todos');
    }
    handleLeadEvento(e) {
        const k = e.currentTarget.dataset.key;
        this.leadEventoSel = this.leadEventoSel === k ? '' : k;
    }
    // Leads que pasan el usuario, el tipo y el evento marcados: base de la lista Estado y de las cajas
    get leadBaseEstado() {
        return this.leadBase
            .filter(l => !this.leadTipoSel || (l.tipo || 'SIN') === this.leadTipoSel)
            .filter(l => !this.leadUsuarioSel || this.leadClaveUsuario(l) === this.leadUsuarioSel)
            .filter(l => this.leadPasaEvento(l));
    }
    get leadEstados() {
        return this.listaValores(this.leadBaseEstado,
            l => this.leadClaveEstado(l), l => this.leadEtiquetaEstado(l),
            this.leadEstadoSel, 'Todos los estados');
    }
    // Cajas de arriba: Pendiente en ámbar y Atendido en verde, con el mismo filtro que la lista
    get leadKpisEstado() {
        const base = this.leadBaseEstado;
        const defs = [
            { key: 'PENDIENTE', label: 'Pendientes', color: 'amarillo' },
            { key: 'ATENDIDO', label: 'Atendidos', color: 'verde' }
        ];
        return defs.map(d => {
            const n = base.filter(l => this.leadClaveEstado(l) === d.key).length;
            const activo = this.leadEstadoSel === d.key;
            return {
                key: d.key, label: d.label, n: this.fmtNumber(n),
                cls: 'acf-kpi acf-kpi-' + d.color + ' acf-kpi-click' + (activo ? ' acf-kpi-active-' + d.color : ''),
                title: activo ? 'Pinchar para quitar el filtro' : 'Mostrar solo los leads ' + d.label.toLowerCase()
            };
        });
    }
    handleLeadEstado(e) {
        const k = e.currentTarget.dataset.key;
        this.leadEstadoSel = this.leadEstadoSel === k ? '' : k;
    }
    // Filas del listado (ya vienen del más reciente al más antiguo), con el buscador,
    // el usuario y el tipo marcados aplicados
    get leadRows() {
        return this.leadBase
            .filter(l => !this.leadTipoSel || (l.tipo || 'SIN') === this.leadTipoSel)
            .filter(l => !this.leadUsuarioSel || this.leadClaveUsuario(l) === this.leadUsuarioSel)
            .filter(l => this.leadPasaEvento(l))
            .filter(l => this.leadPasaEstado(l))
            .map((l, i) => ({
                ...l,
                key: l.id,
                num: i + 1,
                propietario: l.propietario || '—',
                fecha: this.fmtFecha(l.fechaCreacion),
                // Días naturales transcurridos desde la creación hasta hoy (mismo cálculo que Oportunidades)
                dias: this.diasDesde(l.fechaCreacion),
                // Situación: círculo verde si el lead es de hoy, rojo si es de días anteriores
                sitCls: 'acf-dot ' + (this.diasDesde(l.fechaCreacion) === 0 ? 'acf-dot-verde' : 'acf-dot-rojo'),
                sitTitle: this.diasDesde(l.fechaCreacion) === 0 ? 'Creado hoy'
                    : 'Creado hace ' + this.fmtNumber(this.diasDesde(l.fechaCreacion)) + (this.diasDesde(l.fechaCreacion) === 1 ? ' día' : ' días'),
                // Atendido en verde, Pendiente en ámbar
                estadoCls: 'acf-chip ' + (this.normalizar(l.estado).startsWith('atendido') ? 'acf-chip-ok' : 'acf-chip-warn')
            }));
    }
    get leadHay() { return this.leadRows.length > 0; }

    // ===== Pestaña Oportunidades =====
    @track opoData = [];
    @track opoCargado = false;
    @track opoLoading = false;
    @track opoError = null;
    @track opoAsesorSel = '';
    @track opoEstadoSel = '';
    @track opoTipoSel = '';
    @track opoSubtipoSel = '';
    @track opoPlazoSel = '';
    @track opoAntigSel = ''; // tramo de antigüedad marcado (a10 / a30 / a60 / a60m; '' = todos)
    @track opoTipoOrden = 'num';
    @track opoSubtipoOrden = 'num';
    // Subpestañas Listado/Gráficos, buscador y filtros del listado
    @track opoVista = 'listado';
    @track opoBusqueda = '';
    @track opoTitularSel = '';
    @track opoMios = false;
    // Requieren acción viene marcado por defecto al entrar en la pestaña
    @track opoAccion = true;
    @track opoRecientes = false;
    @track opoRecup = false;
    @track opoConflicto = false;
    @track opoAgruparEmp = false;
    // Multiselección de estados junto a los desplegables de tipo y subtipo
    @track opoEstadosSel = [];
    @track showOpoEstadoDd = false;
    // Orden por los totales de la empresa: '' | 'opps' | 'casos'
    @track opoOrdenCol = '';
    @track opoOrdenDir = 'desc';
    @track opoExpandidas = [];
    // El listado se pinta por bloques para que la tabla no se atasque
    @track opoLimite = 100;
    opoCasos = [];
    opoEventos = {};
    opoRecuperadas = [];

    cargarOpo() {
        this.opoLoading = true;
        this.opoError = null;
        getOportunidadesPanel()
            .then(res => {
                this.opoData = (res && res.oportunidades) || [];
                this.opoCasos = (res && res.casos) || [];
                const ev = {};
                ((res && res.eventos) || []).forEach(e => { ev[e.cuentaId] = e.n; });
                this.opoEventos = ev;
                this.opoRecuperadas = (res && res.recuperadas) || [];
                this.opoExpandidas = [];
                this.opoLimite = 100;
                this.opoCargado = true;
            })
            .catch(err => { this.opoError = this.reduceError(err); })
            .finally(() => { this.opoLoading = false; });
    }

    handleOpoRefresh() { this.cargarOpo(); }

    get opoHasError() { return !!this.opoError; }
    get opoShow() { return this.esOportunidades && !this.opoLoading && !this.opoError; }

    // Subpestañas del panel: listado y gráficos
    get esOpoListado() { return this.opoVista === 'listado'; }
    get esOpoGraficos() { return this.opoVista === 'graficos'; }
    get opoTabListadoCls() { return this.opoVista === 'listado' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get opoTabGraficosCls() { return this.opoVista === 'graficos' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    handleOpoVista(e) { this.opoVista = e.currentTarget.dataset.vista; }

    opoHace30Iso() {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Filtros cruzados: cada bloque (estado, usuarios, titular, tipo, subtipo,
    // plazo) se calcula sobre los datos con todos los demás filtros aplicados;
    // los botones y el buscador aplican siempre
    opoFiltrar(excluir) {
        let filas = this.opoData;
        if (excluir !== 'asesor' && this.opoAsesorSel) {
            filas = filas.filter(o => (o.asesorId || 'SIN') === this.opoAsesorSel);
        }
        if (excluir !== 'titular' && this.opoTitularSel) {
            filas = filas.filter(o => (o.empresaTitular || 'SIN') === this.opoTitularSel);
        }
        if (excluir !== 'estado' && this.opoEstadoSel) {
            filas = filas.filter(o => o.estado === this.opoEstadoSel);
        }
        if (excluir !== 'estado' && this.opoEstadosSel.length) {
            filas = filas.filter(o => this.opoEstadosSel.includes(o.estado || 'Sin estado'));
        }
        if (excluir !== 'tipo' && this.opoTipoSel) {
            filas = filas.filter(o => (o.tipo || 'Sin tipo') === this.opoTipoSel);
        }
        if (excluir !== 'subtipo' && this.opoSubtipoSel) {
            filas = filas.filter(o => (o.subtipo || 'Sin subtipo') === this.opoSubtipoSel);
        }
        if (excluir !== 'plazo' && this.opoPlazoSel) {
            const hoy = this.hoyIso();
            filas = filas.filter(o => (this.opoPlazoSel === 'vencidas')
                === (String(o.fechaCierre) < hoy));
        }
        if (excluir !== 'antig' && this.opoAntigSel) {
            filas = filas.filter(o => this.opoTramoAntig(o) === this.opoAntigSel);
        }
        if (this.opoMios) filas = filas.filter(o => o.asesorId === USER_ID);
        if (this.opoAccion) {
            const hoy = this.hoyIso();
            filas = filas.filter(o => String(o.fechaCierre) <= hoy);
        }
        if (this.opoRecientes) {
            const limite = this.opoHace30Iso();
            filas = filas.filter(o => String(o.fechaCreacion) >= limite);
        }
        if (this.opoRecup) filas = filas.filter(o => this.opoRecuperadas.includes(o.id));
        const t = this.normalizar(this.opoBusqueda);
        if (t) {
            filas = filas.filter(o => this.normalizar(o.asunto).includes(t)
                || this.normalizar(o.cuenta).includes(t)
                || this.normalizar(o.asesor).includes(t));
        }
        return filas;
    }
    get opoFiltradas() { return this.opoFiltrar(''); }

    get opoAsesores() { return this.listaAsesores(this.opoFiltrar('asesor'), this.opoAsesorSel); }
    handleOpoAsesor(e) { this.opoAsesorSel = e.currentTarget.dataset.key; }

    // Totales por empresa titular, encima de la lista de usuarios; con el
    // riesgo de conflicto activo cuenta sobre las empresas en conflicto
    get opoTitulares() {
        let base;
        if (this.opoConflicto) {
            base = [];
            this.opoConflictoBase(false).forEach(opps => base.push(...opps));
        } else {
            base = this.opoFiltrar('titular');
        }
        return this.listaValores(base,
            o => o.empresaTitular || 'SIN', o => o.empresaTitular || SIN_EMPRESA,
            this.opoTitularSel, 'Todas las empresas');
    }
    handleOpoTitular(e) {
        const k = e.currentTarget.dataset.key;
        this.opoTitularSel = this.opoTitularSel === k ? '' : k;
    }

    // Buscador y botones de filtro del listado
    handleOpoBusqueda(e) { this.opoBusqueda = e.detail.value; }

    get opoBotones() {
        const botones = [
            { key: 'mios', label: 'Mis oportunidades', activo: this.opoMios,
              title: 'Ver solo las oportunidades de las que soy propietario' },
            { key: 'accion', label: 'Requieren acción', activo: this.opoAccion,
              title: 'Fecha de cierre hoy o anterior a hoy' },
            { key: 'recientes', label: 'Creadas hace 30 días', activo: this.opoRecientes,
              title: 'Creadas en los últimos 30 días' },
            { key: 'recuperadas', label: 'Recuperadas', activo: this.opoRecup,
              title: 'Estuvieron cerradas en algún momento y se reabrieron' },
            { key: 'agrupar', label: 'Agrupar por Empresas', activo: this.opoAgruparEmp,
              title: 'Agrupar el listado por empresa con una cabecera por cada una' }
        ];
        return botones.map(b => {
            return {
                ...b,
                // Mis oportunidades va en amarillo, como los demás botones Mis
                cls: b.key === 'mios'
                    ? 'acf-btn-mios acf-btn-vis-mios' + (b.activo ? ' acf-btn-vis-mios-activo' : '')
                    : 'acf-btn-mios' + (b.activo ? ' acf-btn-mios-activo' : '')
            };
        });
    }
    // Riesgo de conflicto: botón a todo el ancho al principio de la columna izquierda. Sin
    // pulsar va en rojo claro si hay empresas en conflicto (verde claro a cero); pulsado, en
    // rojo intenso. El icono avisa de que se pulsa para ver el desglose
    get opoConflictoBtn() {
        const n = this.opoConflictoEmpresas.length;
        const activo = this.opoConflicto;
        return {
            // Solo el número entre paréntesis para que quepa en una línea; el tooltip dice que son empresas
            label: 'Riesgo de conflicto (' + this.fmtNumber(n) + ')',
            icono: activo ? 'utility:close' : 'utility:preview',
            cls: 'acf-btn-mios acf-btn-mios-bloque opo-btn-conf'
                + (activo ? ' opo-btn-conf-activo' : (n > 0 ? ' opo-btn-conf-rojo' : ' opo-btn-conf-verde')),
            title: activo
                ? 'Pulsar para volver al listado normal'
                : this.fmtNumber(n) + (n === 1 ? ' empresa' : ' empresas') + ' con más de una oportunidad abierta llevada por comerciales distintos. Pulsar para ver el desglose de todas ellas'
        };
    }
    handleOpoConflictoBtn() {
        this.opoConflicto = !this.opoConflicto;
        this.opoLimite = 100;
    }
    handleOpoBoton(e) {
        const k = e.currentTarget.dataset.key;
        if (k === 'mios') this.opoMios = !this.opoMios;
        else if (k === 'accion') this.opoAccion = !this.opoAccion;
        else if (k === 'recientes') this.opoRecientes = !this.opoRecientes;
        else if (k === 'recuperadas') this.opoRecup = !this.opoRecup;
        else if (k === 'agrupar') this.opoAgruparEmp = !this.opoAgruparEmp;
        this.opoLimite = 100;
    }

    // Desplegables de tipo y subtipo; el subtipo depende del tipo elegido
    get opoTipoOpciones() {
        const porTipo = new Map();
        this.opoFiltrar('tipo').forEach(o => {
            const t = o.tipo || 'Sin tipo';
            porTipo.set(t, (porTipo.get(t) || 0) + 1);
        });
        const lista = [...porTipo.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'es'))
            .map(([t, n]) => ({ label: `${t} (${n})`, value: t }));
        return [{ label: 'Todos los tipos', value: '' }, ...lista];
    }
    get opoSubtipoOpciones() {
        const porSub = new Map();
        this.opoFiltrar('subtipo').forEach(o => {
            const s = o.subtipo || 'Sin subtipo';
            porSub.set(s, (porSub.get(s) || 0) + 1);
        });
        const lista = [...porSub.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'es'))
            .map(([s, n]) => ({ label: `${s} (${n})`, value: s }));
        return [{ label: 'Todos los subtipos', value: '' }, ...lista];
    }
    handleOpoTipoCombo(e) {
        this.opoTipoSel = e.detail.value;
        // Al cambiar el tipo, el subtipo elegido se limpia si ya no encaja
        if (this.opoSubtipoSel
            && !this.opoFiltrar('subtipo').some(o => (o.subtipo || 'Sin subtipo') === this.opoSubtipoSel)) {
            this.opoSubtipoSel = '';
        }
    }
    handleOpoSubtipoCombo(e) { this.opoSubtipoSel = e.detail.value; }

    // Multiselección de estados: se pueden marcar varios a la vez
    get opoEstadoTriggerLabel() { return this.etiquetaMs(this.opoEstadosSel, 'Todos los estados'); }
    get opoEstadoOptionsView() {
        return this.opcionesMs(
            this.opoFiltrar('estado').map(o => o.estado || 'Sin estado'), this.opoEstadosSel);
    }
    toggleOpoEstadoDd() { this.showOpoEstadoDd = !this.showOpoEstadoDd; }
    closeOpoEstadoDd() { this.showOpoEstadoDd = false; }
    handleOpoEstadoToggle(e) {
        this.opoEstadosSel = this.alternar(this.opoEstadosSel, e.currentTarget.dataset.value);
    }
    handleOpoEstadoTodos() { this.opoEstadosSel = []; }

    // Cajas de vencidas y en plazo sobre la lista de usuarios (vencida =
    // fecha de cierre anterior a hoy)
    get opoPlazos() {
        const hoy = this.hoyIso();
        const datos = this.opoFiltrar('plazo');
        const vencidas = datos.filter(o => String(o.fechaCierre) < hoy).length;
        const cajas = [
            { key: 'vencidas', label: 'Vencidas', color: 'rojo', n: vencidas },
            { key: 'plazo', label: 'En plazo', color: 'verde', n: datos.length - vencidas }
        ];
        return cajas.map(c => ({
            ...c,
            n: this.fmtNumber(c.n),
            cls: 'acf-kpi acf-kpi-click acf-kpi-' + c.color
                + (this.opoPlazoSel === c.key ? ' acf-kpi-active-' + c.color : '')
        }));
    }
    handleOpoPlazo(e) {
        const k = e.currentTarget.dataset.key;
        this.opoPlazoSel = this.opoPlazoSel === k ? '' : k;
    }

    // Antigüedad de la oportunidad (días desde su creación) en los tramos de OPO_TRAMOS
    opoTramoAntig(o) {
        const d = this.diasDesde(o.fechaCreacion);
        if (d <= 10) return 'a10';
        if (d <= 30) return 'a30';
        if (d <= 60) return 'a60';
        return 'a60m';
    }
    // Gráfico de acumulados por tramo de la columna izquierda: cuenta sobre los datos con
    // el resto de filtros aplicados; pinchar un tramo filtra el listado
    get opoAntiguedad() {
        const datos = this.opoFiltrar('antig');
        const cuenta = new Map();
        datos.forEach(o => { const k = this.opoTramoAntig(o); cuenta.set(k, (cuenta.get(k) || 0) + 1); });
        const max = Math.max(1, ...cuenta.values());
        return OPO_TRAMOS.map(t => {
            const n = cuenta.get(t.key) || 0;
            const activo = this.opoAntigSel === t.key;
            return {
                key: t.key, label: t.label, n: this.fmtNumber(n),
                barStyle: 'width:' + Math.round((n / max) * 100) + '%',
                barCls: 'acf-tipo-bar' + (t.rojo ? ' acf-tipo-bar-rojo' : ''),
                cls: 'acf-tipo-row acf-tipo-click' + (activo ? ' acf-tipo-activo' : ''),
                title: activo ? 'Pinchar para quitar el filtro' : 'Ver solo las oportunidades de este tramo'
            };
        });
    }
    handleOpoAntig(e) {
        const k = e.currentTarget.dataset.key;
        this.opoAntigSel = this.opoAntigSel === k ? '' : k;
    }

    // Cajas de total y por estado, clicables como filtro
    get opoKpis() {
        const datos = this.opoFiltrar('estado');
        const cajas = [
            { key: '', label: 'Total oportunidades', color: '', title: 'Mostrar todas las oportunidades' },
            { key: 'Análisis y Propuesta', label: 'Análisis y Propuesta', color: 'azul' },
            { key: 'Negociación', label: 'Negociación', color: 'amarillo' },
            { key: 'Esperando firma', label: 'Esperando firma', color: 'verde' }
        ];
        return cajas.map(c => ({
            ...c,
            title: c.title || 'Filtrar por este estado',
            n: this.fmtNumber(c.key ? datos.filter(o => o.estado === c.key).length : datos.length),
            cls: 'acf-kpi acf-kpi-click' + (c.color ? ' acf-kpi-' + c.color : '')
                + (c.key && this.opoEstadoSel === c.key ? ' acf-kpi-active-' + c.color : '')
        }));
    }

    handleOpoEstado(e) {
        const k = e.currentTarget.dataset.key || '';
        this.opoEstadoSel = this.opoEstadoSel === k ? '' : k;
    }

    // Barras de totales por tipo y por subtipo: ordenables por número o por
    // orden alfabético, y clicables como filtro del listado
    opoDistribucion(campo, sinValor, orden, seleccion) {
        const porValor = new Map();
        this.opoFiltrar(campo).forEach(o => {
            const v = o[campo] || sinValor;
            porValor.set(v, (porValor.get(v) || 0) + 1);
        });
        const max = Math.max(1, ...porValor.values());
        return [...porValor.entries()]
            .sort((a, b) => orden === 'alf'
                ? a[0].localeCompare(b[0], 'es')
                : b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
            .map(([label, n]) => ({
                label,
                n: this.fmtNumber(n),
                barStyle: 'width:' + Math.round((n / max) * 100) + '%',
                cls: 'acf-tipo-row acf-tipo-click' + (label === seleccion ? ' acf-tipo-activo' : '')
            }));
    }
    get opoTipos() { return this.opoDistribucion('tipo', 'Sin tipo', this.opoTipoOrden, this.opoTipoSel); }
    get opoSubtipos() { return this.opoDistribucion('subtipo', 'Sin subtipo', this.opoSubtipoOrden, this.opoSubtipoSel); }

    // El botón alterna al otro orden: muestra el que se aplicará al pulsarlo
    get opoTipoOrdenLabel() { return this.opoTipoOrden === 'alf' ? 'Por número' : 'A → Z'; }
    get opoSubtipoOrdenLabel() { return this.opoSubtipoOrden === 'alf' ? 'Por número' : 'A → Z'; }
    handleOpoTipoOrden() { this.opoTipoOrden = this.opoTipoOrden === 'alf' ? 'num' : 'alf'; }
    handleOpoSubtipoOrden() { this.opoSubtipoOrden = this.opoSubtipoOrden === 'alf' ? 'num' : 'alf'; }

    handleOpoTipo(e) {
        const v = e.currentTarget.dataset.valor;
        this.opoTipoSel = this.opoTipoSel === v ? '' : v;
    }
    handleOpoSubtipo(e) {
        const v = e.currentTarget.dataset.valor;
        this.opoSubtipoSel = this.opoSubtipoSel === v ? '' : v;
    }

    // Totales por cuenta: oportunidades abiertas y casos abiertos
    get opoAgg() {
        const agg = {};
        const de = id => agg[id] || (agg[id] = { opps: 0, casos: 0 });
        this.opoData.forEach(o => { if (o.cuentaId) de(o.cuentaId).opps++; });
        this.opoCasos.forEach(c => { if (c.cuentaId) de(c.cuentaId).casos++; });
        return agg;
    }

    // Orden por los totales de la cuenta al pinchar la cabecera:
    // descendente, ascendente y de vuelta al orden por fecha de cierre
    handleOpoOrden(e) {
        const col = e.currentTarget.dataset.col;
        if (this.opoOrdenCol !== col) { this.opoOrdenCol = col; this.opoOrdenDir = 'desc'; }
        else if (this.opoOrdenDir === 'desc') this.opoOrdenDir = 'asc';
        else { this.opoOrdenCol = ''; this.opoOrdenDir = 'desc'; }
    }
    opoOrdenIcono(col) {
        if (this.opoOrdenCol !== col) return '↕';
        return this.opoOrdenDir === 'desc' ? '▼' : '▲';
    }
    get opoOrdenOppsIcono() { return this.opoOrdenIcono('opps'); }
    get opoOrdenCasosIcono() { return this.opoOrdenIcono('casos'); }

    diasDesde(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).split('-').map(Number);
        const dias = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86400000);
        return this.fmtNumber(Math.max(0, dias));
    }

    // Al pinchar el triángulo de una línea se abre su detalle con las demás
    // oportunidades abiertas de la empresa y sus casos abiertos
    handleOpoExpandir(e) {
        const id = e.currentTarget.dataset.id;
        const set = new Set(this.opoExpandidas);
        if (set.has(id)) set.delete(id); else set.add(id);
        this.opoExpandidas = Array.from(set);
    }

    opoFilaBase(o, idx, hoy, agg) {
        const a = agg[o.cuentaId] || { opps: 0, casos: 0 };
        const expandida = this.opoExpandidas.includes(o.id);
        // Con Requieren acción o Riesgo de conflicto activos, las líneas con
        // cierre posterior a hoy van con fondo verde claro (aún en plazo)
        const enPlazo = (this.opoAccion || this.opoConflicto) && String(o.fechaCierre) > hoy;
        return {
            ...o,
            key: o.id,
            idx,
            esFila: true,
            esDetalle: false,
            esGrupo: false,
            objeto: 'Opportunity',
            rowCls: 'acf-row' + (enPlazo ? ' opo-row-verde' : ''),
            fechaFmt: this.fmtFecha(o.fechaCierre),
            fechaCls: String(o.fechaCierre) < hoy ? 'acf-td-izq acf-vto-vencido'
                : (String(o.fechaCierre) === hoy ? 'acf-td-izq acf-vto-hoy' : 'acf-td-izq'),
            creacionFmt: this.fmtFecha(o.fechaCreacion),
            dias: this.diasDesde(o.fechaCreacion),
            // Más de 10 días desde la creación: días en rojo con el aviso
            diasCls: 'acf-td-cen' + (this.diasDesde(o.fechaCreacion) > 10 ? ' acf-vto-vencido' : ''),
            diasAviso: this.diasDesde(o.fechaCreacion) > 10,
            // Los totales solo se muestran cuando avisan de algo: más de una
            // oportunidad abierta o algún caso abierto, en círculo rojo
            nOpps: a.opps > 1 ? this.fmtNumber(a.opps) : '',
            nCasos: a.casos > 0 ? this.fmtNumber(a.casos) : '',
            nEventos: this.fmtNumber(this.opoEventos[o.cuentaId] || 0),
            // Con el riesgo de conflicto activo el desglose ya está a la vista
            expandible: !this.opoConflicto && (a.opps > 1 || a.casos > 0),
            botonDetalle: expandida ? 'Cerrar' : 'Ampliar',
            chevronTitle: expandida ? 'Ocultar el detalle de la empresa'
                : 'Ver las demás oportunidades y los casos abiertos de la empresa'
        };
    }

    // Un caso abierto como línea de la tabla: mismas columnas que una
    // oportunidad salvo la fecha de cierre, con el asignado como comercial
    // y el fondo amarillo
    opoFilaCaso(c, cuentaNombre, idx, clave) {
        return {
            key: clave || c.id,
            idx: idx || '',
            esFila: true,
            esDetalle: false,
            esGrupo: false,
            objeto: 'Case',
            id: c.id,
            rowCls: 'acf-row opo-row-caso',
            fechaFmt: '',
            fechaCls: 'acf-td-izq',
            estado: c.estado,
            creacionFmt: this.fmtFecha(c.fechaCreacion),
            dias: this.diasDesde(c.fechaCreacion),
            diasCls: 'acf-td-cen' + (this.diasDesde(c.fechaCreacion) > 10 ? ' acf-vto-vencido' : ''),
            diasAviso: this.diasDesde(c.fechaCreacion) > 10,
            asunto: c.asunto || c.numero,
            cuentaId: c.cuentaId,
            cuenta: cuentaNombre,
            tipo: c.tipo,
            subtipo: '',
            asesor: c.asesor,
            empresaTitular: '',
            nOpps: '',
            nCasos: '',
            nEventos: '',
            expandible: false,
            botonDetalle: '',
            chevronTitle: ''
        };
    }

    // Al ampliar una línea aparecen debajo, como líneas completas, las demás
    // oportunidades abiertas de la empresa y sus casos abiertos (en amarillo)
    opoFilasDetalle(o, hoy, agg) {
        const filas = [];
        this.opoData
            .filter(x => x.cuentaId && x.cuentaId === o.cuentaId && x.id !== o.id)
            .sort((a, b) => String(a.fechaCierre).localeCompare(String(b.fechaCierre)))
            .forEach(x => {
                const f = this.opoFilaBase(x, '', hoy, agg);
                f.key = o.id + '·' + x.id;
                f.idx = '';
                f.expandible = false;
                f.esAmpliada = true;
                f.rowCls += ' opo-row-sub';
                f.nOpps = '';
                f.nCasos = '';
                f.nEventos = '';
                filas.push(f);
            });
        this.opoCasos
            .filter(c => c.cuentaId === o.cuentaId)
            .forEach(c => {
                const f = this.opoFilaCaso(c, o.cuenta, '', o.id + '·' + c.id);
                f.esAmpliada = true;
                f.rowCls += ' opo-row-sub';
                filas.push(f);
            });
        return filas;
    }

    // Riesgo de conflicto: empresas con más de una oportunidad abierta y con
    // más de un comercial distinto asignado entre ellas, con todas sus
    // oportunidades (vencidas o no); solo se respeta el filtro de empresa
    // titular de la lista de la izquierda
    opoConflictoBase(usarTitular) {
        let datos = this.opoData;
        if (usarTitular && this.opoTitularSel) {
            datos = datos.filter(o => (o.empresaTitular || 'SIN') === this.opoTitularSel);
        }
        const porCuenta = new Map();
        datos.forEach(o => {
            if (!o.cuentaId) return;
            if (!porCuenta.has(o.cuentaId)) porCuenta.set(o.cuentaId, []);
            porCuenta.get(o.cuentaId).push(o);
        });
        // Hay conflicto cuando las oportunidades de la empresa las llevan comerciales distintos,
        // salvo un caso: exactamente dos comerciales, uno solo con Patrocinios eventos (tipo
        // Eventos) y el otro solo con Publicidad omnicanal, que van por separado. Con un tercer
        // comercial, o si se mezclan los tipos, sí hay conflicto
        const esPatrocinio = o => ['eventos', 'patrocinios eventos'].includes(this.normalizar(o.tipo));
        const esOmnicanal = o => this.normalizar(o.tipo) === 'publicidad omnicanal';
        const hayConflicto = opps => {
            const porComercial = new Map();
            opps.forEach(o => {
                const k = o.asesorId || 'SIN';
                if (!porComercial.has(k)) porComercial.set(k, []);
                porComercial.get(k).push(o);
            });
            if (porComercial.size < 2) return false;
            if (porComercial.size > 2) return true;
            const [a, b] = [...porComercial.values()];
            const excepcion = (a.every(esPatrocinio) && b.every(esOmnicanal))
                || (a.every(esOmnicanal) && b.every(esPatrocinio));
            return !excepcion;
        };
        return [...porCuenta.values()]
            .filter(opps => opps.length > 1 && hayConflicto(opps))
            .sort((a, b) => b.length - a.length
                || (a[0].cuenta || '').localeCompare(b[0].cuenta || '', 'es'));
    }
    get opoConflictoEmpresas() { return this.opoConflictoBase(true); }

    get opoRows() {
        const hoy = this.hoyIso();
        const agg = this.opoAgg;
        const out = [];
        if (this.opoConflicto) {
            let i = 0;
            this.opoConflictoEmpresas.forEach(opps => {
                const casos = this.opoCasos.filter(c => c.cuentaId === opps[0].cuentaId);
                out.push({
                    key: 'g·' + opps[0].cuentaId,
                    esGrupo: true,
                    esFila: false,
                    esDetalle: false,
                    rowCls: 'acf-row',
                    etiqueta: opps[0].cuenta || 'Sin cuenta',
                    sub: this.fmtNumber(opps.length) + ' oportunidades abiertas'
                        + (casos.length ? ' · ' + this.fmtNumber(casos.length)
                            + (casos.length === 1 ? ' caso abierto' : ' casos abiertos') : '')
                });
                [...opps]
                    .sort((a, b) => String(a.fechaCierre).localeCompare(String(b.fechaCierre)))
                    .forEach(o => {
                        i++;
                        out.push(this.opoFilaBase(o, i, hoy, agg));
                    });
                // Los casos abiertos de la empresa como líneas amarillas,
                // sin fecha de cierre y con el asignado en la columna del comercial
                casos.forEach(c => {
                    i++;
                    out.push(this.opoFilaCaso(c, opps[0].cuenta, i));
                });
            });
            return out.slice(0, this.opoLimite);
        }
        const filas = [...this.opoFiltradas];
        if (this.opoOrdenCol) {
            const dir = this.opoOrdenDir === 'asc' ? 1 : -1;
            const val = o => {
                const a = agg[o.cuentaId];
                if (!a) return 0;
                return this.opoOrdenCol === 'opps' ? a.opps : a.casos;
            };
            filas.sort((a, b) => dir * (val(a) - val(b)));
        }
        // Agrupado por empresas: una cabecera por cuenta con sus oportunidades
        if (this.opoAgruparEmp) {
            const grupos = new Map();
            filas.forEach(o => {
                const k = o.cuentaId || 'SIN';
                if (!grupos.has(k)) grupos.set(k, []);
                grupos.get(k).push(o);
            });
            let i = 0;
            [...grupos.values()]
                .sort((a, b) => (a[0].cuenta || 'Sin cuenta')
                    .localeCompare(b[0].cuenta || 'Sin cuenta', 'es'))
                .forEach(opps => {
                    out.push({
                        key: 'g·' + (opps[0].cuentaId || 'SIN'),
                        esGrupo: true,
                        esFila: false,
                        esDetalle: false,
                        rowCls: 'acf-row',
                        etiqueta: opps[0].cuenta || 'Sin cuenta',
                        sub: this.fmtNumber(opps.length)
                            + (opps.length === 1 ? ' oportunidad abierta' : ' oportunidades abiertas')
                    });
                    opps.forEach(o => {
                        i++;
                        out.push(this.opoFilaBase(o, i, hoy, agg));
                        if (this.opoExpandidas.includes(o.id)) out.push(...this.opoFilasDetalle(o, hoy, agg));
                    });
                });
            return out.slice(0, this.opoLimite);
        }
        filas.slice(0, this.opoLimite).forEach((o, i) => {
            out.push(this.opoFilaBase(o, i + 1, hoy, agg));
            if (this.opoExpandidas.includes(o.id)) out.push(...this.opoFilasDetalle(o, hoy, agg));
        });
        return out;
    }

    get opoConflictoTotalFilas() {
        return this.opoConflictoEmpresas.reduce((s, opps) => s + opps.length + 1, 0);
    }
    get opoHayFilas() {
        return this.opoConflicto ? this.opoConflictoEmpresas.length > 0 : this.opoFiltradas.length > 0;
    }
    get opoHayMas() {
        const total = this.opoConflicto ? this.opoConflictoTotalFilas : this.opoFiltradas.length;
        return total > this.opoLimite;
    }
    get opoMostrandoLabel() {
        if (this.opoConflicto) {
            return 'Mostrando ' + this.fmtNumber(Math.min(this.opoLimite, this.opoConflictoTotalFilas))
                + ' de ' + this.fmtNumber(this.opoConflictoTotalFilas) + ' líneas';
        }
        const total = this.opoFiltradas.length;
        return 'Mostrando ' + this.fmtNumber(Math.min(this.opoLimite, total))
            + ' de ' + this.fmtNumber(total) + ' oportunidades';
    }
    handleOpoMasFilas() { this.opoLimite += 100; }

    // ===== Pestaña Casos =====
    @track casData = [];
    @track casCargado = false;
    @track casLoading = false;
    @track casError = null;
    @track casTipoSel = '';
    @track casEstadoSel = ''; // estado marcado en la lista de la izquierda ('' = todos)
    @track casBusqueda = '';

    cargarCas() {
        this.casLoading = true;
        this.casError = null;
        getCasosAbiertos()
            .then(res => { this.casData = res || []; this.casCargado = true; })
            .catch(err => { this.casError = this.reduceError(err); })
            .finally(() => { this.casLoading = false; });
    }

    handleCasRefresh() { this.cargarCas(); }

    get casHasError() { return !!this.casError; }
    get casShow() { return this.esCasos && !this.casLoading && !this.casError; }

    get casKpiTotal() { return this.fmtNumber(this.casData.length); }

    // La caja de total quita los filtros y vuelve a mostrar todos
    handleCasTotal() {
        this.casTipoSel = '';
        this.casEstadoSel = '';
        this.casBusqueda = '';
        this.casMios = false;
    }

    // Mis casos: solo los asignados al usuario conectado
    @track casMios = false;
    get casMisBtnCls() { return 'acf-btn-mios acf-btn-vis-mios' + (this.casMios ? ' acf-btn-vis-mios-activo' : ''); }
    handleCasMios() { this.casMios = !this.casMios; }
    casAplicarMios(filas) {
        return this.casMios ? filas.filter(c => c.asesorId === USER_ID) : filas;
    }

    // Listas de la izquierda: total de casos abiertos por tipo y por estado, de más a
    // menos; cada lista aplica el filtro de la otra
    casEstadoDe(c) { return c.estado || 'Sin estado'; }
    get casTipos() {
        const porTipo = new Map();
        this.casAplicarMios(this.casData)
            .filter(c => !this.casEstadoSel || this.casEstadoDe(c) === this.casEstadoSel)
            .forEach(c => {
                const t = c.tipo || 'Sin tipo';
                porTipo.set(t, (porTipo.get(t) || 0) + 1);
            });
        return [...porTipo.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
            .map(([nombre, n]) => ({
                key: nombre,
                nombre,
                n: this.fmtNumber(n),
                cls: nombre === this.casTipoSel ? 'acf-user-item acf-user-item-active' : 'acf-user-item'
            }));
    }
    get casEstados() {
        const porEstado = new Map();
        this.casAplicarMios(this.casData)
            .filter(c => !this.casTipoSel || (c.tipo || 'Sin tipo') === this.casTipoSel)
            .forEach(c => {
                const e = this.casEstadoDe(c);
                porEstado.set(e, (porEstado.get(e) || 0) + 1);
            });
        return [...porEstado.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
            .map(([nombre, n]) => ({
                key: nombre,
                nombre,
                n: this.fmtNumber(n),
                puntoCls: 'acf-estado-punto ' + this.casEstadoColor(nombre),
                cls: nombre === this.casEstadoSel ? 'acf-user-item acf-user-item-active' : 'acf-user-item'
            }));
    }
    // Color de cada estado: Abierto azul, Autorizado verde, Pendiente cliente ámbar,
    // Pendiente despacho rojo (nos toca a nosotros) y el resto gris
    casEstadoColor(estado) {
        const e = this.normalizar(estado);
        if (e.startsWith('abierto')) return 'acf-estado-info';
        if (e.startsWith('autorizado')) return 'acf-estado-ok';
        if (e.includes('despacho')) return 'acf-estado-bad';
        if (e.includes('cliente') || e.startsWith('pendiente')) return 'acf-estado-warn';
        return 'acf-estado-neutro';
    }
    casEstadoChipCls(estado) {
        return 'acf-chip ' + this.casEstadoColor(estado).replace('acf-estado-', 'acf-chip-');
    }

    handleCasTipo(e) {
        const k = e.currentTarget.dataset.key;
        this.casTipoSel = this.casTipoSel === k ? '' : k;
    }
    handleCasEstado(e) {
        const k = e.currentTarget.dataset.key;
        this.casEstadoSel = this.casEstadoSel === k ? '' : k;
    }

    handleCasBusqueda(e) { this.casBusqueda = e.detail.value; }

    get casMostrados() {
        let filas = this.casAplicarMios(this.casData);
        if (this.casTipoSel) filas = filas.filter(c => (c.tipo || 'Sin tipo') === this.casTipoSel);
        if (this.casEstadoSel) filas = filas.filter(c => this.casEstadoDe(c) === this.casEstadoSel);
        const t = this.normalizar(this.casBusqueda);
        if (t) {
            filas = filas.filter(c => this.normalizar(c.asunto).includes(t)
                || this.normalizar(c.contacto).includes(t)
                || this.normalizar(c.empresa).includes(t)
                || this.normalizar(c.asesor).includes(t)
                || this.normalizar(c.estado).includes(t)
                || this.normalizar(c.numero).includes(t));
        }
        return filas;
    }

    // Agrupar el listado de casos por usuario asignado
    @track casAgrUsuario = false;
    get casAgrUsuarioCls() { return 'acf-btn-agrupar' + (this.casAgrUsuario ? ' acf-btn-agrupar-activo' : ''); }
    handleCasAgrUsuario() { this.casAgrUsuario = !this.casAgrUsuario; }

    // Días naturales desde una fecha ISO hasta hoy
    diasHastaHoy(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).split('-').map(Number);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        return Math.max(0, Math.round((hoy - new Date(y, m - 1, d)) / 86400000));
    }

    get casRows() {
        const base = this.casMostrados.map(c => ({
            ...c,
            key: c.id,
            dias: this.diasHastaHoy(c.fechaAperturaDia),
            fechaPrevistaFmt: this.fmtFecha(c.fechaPrevista),
            estado: this.casEstadoDe(c),
            estadoCls: this.casEstadoChipCls(this.casEstadoDe(c))
        }));
        return this.agruparPorAsesor(base, this.casAgrUsuario);
    }

    get casHayFilas() { return this.casMostrados.length > 0; }

    // ===== Pestaña Teletrabajo =====
    @track telData = [];
    @track telCargado = false;
    @track telLoading = false;
    @track telError = null;
    // Agrupación: '' (sin agrupar), departamento o empresa titular
    @track telAgruparSel = '';
    @track telHoyActivo = false;

    cargarTel() {
        this.telLoading = true;
        this.telError = null;
        getTeletrabajo()
            .then(res => { this.telData = res || []; this.telCargado = true; })
            .catch(err => { this.telError = this.reduceError(err); })
            .finally(() => { this.telLoading = false; });
    }

    handleTelRefresh() { this.cargarTel(); }

    get telHasError() { return !!this.telError; }
    get telShow() { return this.esTeletrabajo && !this.telLoading && !this.telError; }

    // Cabeceras: los cinco días de la semana sin fecha (los días fijos son
    // universales, todos los lunes, martes...); el día de hoy va en verde y
    // cada día se puede pinchar para ver solo a quienes teletrabajan ese día
    @track telDiaSel = '';

    get telDias() {
        const hoy = this.telHoyNombre;
        const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
        return nombres.map(nombre => ({
            key: nombre,
            nombre,
            esHoy: nombre === hoy,
            label: nombre,
            thCls: 'tel-th-dia tel-th-click' + (nombre === hoy ? ' acf-aus-th-hoy' : '')
                + (nombre === this.telDiaSel ? ' tel-th-activo' : '')
        }));
    }

    handleTelDia(e) {
        const d = e.currentTarget.dataset.dia;
        this.telDiaSel = this.telDiaSel === d ? '' : d;
    }

    get telPeriodoLabel() { return 'Días fijos semanales'; }

    // Día de la semana de hoy (vacío en fin de semana)
    get telHoyNombre() {
        const dow = new Date().getDay();
        return ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', ''][dow] || '';
    }

    telTiene(e, dia) {
        return String(e.dias || '').split(';').includes(dia);
    }

    get telBotones() {
        const botones = [
            { key: 'hoy', label: 'Teletrabajo hoy', title: 'Ver solo las personas que teletrabajan hoy',
              activo: this.telHoyActivo },
            { key: 'departamento', label: 'Agrupar por departamento', title: 'Agrupar las personas por su departamento',
              activo: this.telAgruparSel === 'departamento' },
            { key: 'empresa', label: 'Agrupar por empresa titular', title: 'Agrupar las personas por su empresa titular',
              activo: this.telAgruparSel === 'empresa' }
        ];
        return botones.map(b => ({
            ...b,
            // El de agrupar por departamento va en amarillo claro
            cls: b.key === 'departamento'
                ? 'acf-btn-mios acf-btn-vis-mios' + (b.activo ? ' acf-btn-vis-mios-activo' : '')
                : 'acf-btn-agrupar' + (b.activo ? ' acf-btn-agrupar-activo' : '')
        }));
    }

    handleTelBoton(e) {
        const k = e.currentTarget.dataset.key;
        if (k === 'hoy') this.telHoyActivo = !this.telHoyActivo;
        else this.telAgruparSel = this.telAgruparSel === k ? '' : k;
    }

    get telFiltrados() {
        let out = this.telData;
        if (this.telHoyActivo) {
            const hoy = this.telHoyNombre;
            out = hoy ? out.filter(e => this.telTiene(e, hoy)) : [];
        }
        if (this.telDiaSel) out = out.filter(e => this.telTiene(e, this.telDiaSel));
        return out;
    }

    get telRows() {
        const dias = this.telDias;
        const filas = [];
        const pintar = (e, prefijo) => filas.push({
            key: (prefijo ? prefijo + '·' : '') + e.empleadoId,
            esGrupo: false,
            nombre: e.nombre,
            departamento: e.departamento || SIN_DEPARTAMENTO,
            celdas: dias.map(d => ({
                key: d.key,
                cls: 'acf-aus-celda tel-celda' + (d.esHoy ? ' acf-aus-hoycol' : '')
                    + (this.telTiene(e, d.nombre) ? ' acf-aus-vacaciones' : ''),
                title: this.telTiene(e, d.nombre) ? e.nombre + ' · teletrabajo fijo los ' + d.nombre.toLowerCase() : ''
            }))
        });

        const empleados = [...this.telFiltrados]
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        if (!this.telAgruparSel) {
            empleados.forEach(e => pintar(e, ''));
            return filas;
        }
        const clave = e => this.telAgruparSel === 'empresa'
            ? (e.empresaTitular || SIN_EMPRESA) : (e.departamento || SIN_DEPARTAMENTO);
        const grupos = new Map();
        empleados.forEach(e => {
            const k = clave(e);
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(e);
        });
        [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(g => {
            filas.push({ key: 'g·' + g, esGrupo: true, etiqueta: g });
            grupos.get(g).forEach(e => pintar(e, 'g·' + g));
        });
        return filas;
    }

    get telHayFilas() { return this.telFiltrados.length > 0; }
    get telColspan() { return 7; }
    get telKpiPersonas() {
        const n = this.telFiltrados.length;
        return this.fmtNumber(n) + (n === 1 ? ' persona' : ' personas');
    }

    // ===== Pestaña Ausencias Equipo =====
    @track ausData = [];
    @track ausCargado = false;
    @track ausLoading = false;
    @track ausError = null;
    @track ausUnidadSel = '';
    // Agrupación del calendario: '' (sin agrupar), departamento, empresa o tipo
    @track ausAgruparSel = '';

    // Tramo del calendario (por defecto, cuatro semanas desde el lunes actual)
    @track ausFechaDesde = '';
    @track ausFechaFin = '';

    cargarAus() {
        this.ausLoading = true;
        this.ausError = null;
        if (!this.ausFechaDesde) this.ausFechaDesde = this.ausIso(this.ausLunes());
        if (!this.ausFechaFin) this.ausFechaFin = this.ausIso(this.ausFinDefecto());
        getAusenciasEquipo({ desde: this.ausFechaDesde, hasta: this.ausFechaFin })
            .then(res => { this.ausData = res || []; this.ausCargado = true; })
            .catch(err => { this.ausError = this.reduceError(err); })
            .finally(() => { this.ausLoading = false; });
    }

    handleAusRefresh() { this.cargarAus(); }

    ausFinDefecto() {
        const d = this.ausLunes();
        d.setDate(d.getDate() + 27);
        return d;
    }

    ausIso(d) {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    ausInicio() {
        if (!this.ausFechaDesde) return this.ausLunes();
        const [y, m, d] = this.ausFechaDesde.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    get ausFechaFinMin() { return this.ausFechaDesde || this.ausIso(this.ausLunes()); }

    handleAusFechaDesde(e) {
        const v = e.detail.value;
        if (!v) return;
        this.ausFechaDesde = v;
        if (this.ausFechaFin && this.ausFechaFin < v) this.ausFechaFin = v;
        this.cargarAus();
    }

    handleAusFechaFin(e) {
        const v = e.detail.value;
        if (!v) return;
        this.ausFechaFin = v < this.ausFechaFinMin ? this.ausFechaFinMin : v;
        this.cargarAus();
    }

    get ausHasError() { return !!this.ausError; }
    get ausShow() { return this.esAusencias && !this.ausLoading && !this.ausError; }

    // Filtro superior por el campo Horas/Días de la ausencia
    get ausUnidades() {
        const opciones = [
            { key: '', label: 'Todas' },
            { key: 'Días', label: 'Días enteros' },
            { key: 'Horas', label: 'Por horas' }
        ];
        return opciones.map(o => ({
            ...o,
            cls: 'acf-btn-agrupar' + (o.key === this.ausUnidadSel ? ' acf-btn-agrupar-activo' : '')
        }));
    }
    handleAusUnidad(e) { this.ausUnidadSel = e.currentTarget.dataset.key || ''; }

    get ausAgrupaciones() {
        const opciones = [
            { key: 'departamento', label: 'Agrupar por departamento', title: 'Agrupar las personas por su departamento' },
            { key: 'empresa', label: 'Agrupar por empresa titular', title: 'Agrupar las personas por la empresa titular de su ficha de empleado' },
            { key: 'tipo', label: 'Agrupar por tipo de ausencia', title: 'Agrupar las ausencias por su tipo' }
        ];
        return opciones.map(o => ({
            ...o,
            // El de agrupar por departamento va en amarillo claro
            cls: o.key === 'departamento'
                ? 'acf-btn-mios acf-btn-vis-mios'
                    + (o.key === this.ausAgruparSel ? ' acf-btn-vis-mios-activo' : '')
                : 'acf-btn-agrupar' + (o.key === this.ausAgruparSel ? ' acf-btn-agrupar-activo' : '')
        }));
    }
    handleAusAgrupar(e) {
        const k = e.currentTarget.dataset.key;
        this.ausAgruparSel = this.ausAgruparSel === k ? '' : k;
    }

    // Buscador a todo lo ancho por persona
    @track ausBusqueda = '';
    handleAusBusqueda(e) { this.ausBusqueda = e.detail.value; }

    // Botón Hoy: solo las ausencias que cubren el día de hoy
    @track ausHoyActivo = false;
    get ausHoyCls() {
        return 'acf-btn-agrupar' + (this.ausHoyActivo ? ' acf-btn-agrupar-activo' : '');
    }
    handleAusHoy() { this.ausHoyActivo = !this.ausHoyActivo; }

    get ausFiltradas() {
        let datos = this.ausData;
        if (this.ausHoyActivo) {
            const hoy = this.hoyIso();
            datos = datos.filter(a => String(a.inicio) <= hoy && hoy <= String(a.fin || a.inicio));
        }
        if (this.ausUnidadSel) datos = datos.filter(a => a.unidad === this.ausUnidadSel);
        const t = this.normalizar(this.ausBusqueda);
        if (t) datos = datos.filter(a => this.normalizar(a.nombre).includes(t));
        return datos;
    }

    // Lunes de la semana actual, a medianoche local
    ausLunes() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
    }

    // Días exactos del tramo elegido (por defecto, cuatro semanas)
    get ausNumDias() {
        if (!this.ausFechaFin) return 28;
        const base = this.ausInicio();
        const [y, m, d] = this.ausFechaFin.split('-').map(Number);
        const fin = new Date(y, m - 1, d);
        const dias = Math.round((fin - base) / 86400000) + 1;
        return dias <= 0 ? 28 : dias;
    }

    get ausDias() {
        const base = this.ausInicio();
        const hoyIso = this.hoyIso();
        const p = n => String(n).padStart(2, '0');
        const out = [];
        for (let i = 0; i < this.ausNumDias; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
            const dow = d.getDay();
            const finde = dow === 0 || dow === 6;
            const esHoy = iso === hoyIso;
            const nombreDia = DIAS_SEMANA[dow];
            out.push({
                key: iso,
                iso,
                finde,
                esHoy,
                label: nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1)
                    + ` ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`,
                thCls: 'acf-aus-th-dia' + (finde ? ' acf-aus-th-finde' : '') + (esHoy ? ' acf-aus-th-hoy' : '')
            });
        }
        return out;
    }

    get ausPeriodoLabel() {
        const dias = this.ausDias;
        const ini = dias[0].iso.split('-').map(Number);
        const fin = dias[dias.length - 1].iso.split('-').map(Number);
        const desde = ini[1] === fin[1] ? String(ini[2])
            : `${ini[2]} de ${MESES[ini[1] - 1]}` + (ini[0] === fin[0] ? '' : ` de ${ini[0]}`);
        return `${desde} – ${fin[2]} de ${MESES[fin[1] - 1]} de ${fin[0]}`
            + ` · ${this.fmtNumber(dias.length)} días`;
    }

    ausGrupo(tipo) {
        return AUS_GRUPOS.find(g => g.tipos.includes(tipo))
            || AUS_GRUPOS[AUS_GRUPOS.length - 1];
    }

    // Solo se listan los grupos de color con alguna ausencia en el cuadro
    // actual; las vacaciones se parten por estado (azul aprobadas o
    // completadas, amarillo solicitadas)
    get ausLeyenda() {
        const presentes = new Set(this.ausFiltradas.map(a => this.ausGrupo(a.tipo).key));
        const out = [];
        AUS_GRUPOS.filter(g => presentes.has(g.key)).forEach(g => {
            if (g.key === 'vacaciones') {
                const vac = this.ausFiltradas.filter(a => this.ausGrupo(a.tipo).key === 'vacaciones');
                if (vac.some(a => a.estado !== 'Solicitado')) {
                    out.push({ key: 'vacaciones', label: 'Vacaciones aprobadas o completadas',
                        dotCls: 'acf-aus-dot acf-aus-vacaciones' });
                }
                if (vac.some(a => a.estado === 'Solicitado')) {
                    out.push({ key: 'vacsol', label: 'Vacaciones solicitadas',
                        dotCls: 'acf-aus-dot acf-aus-vacsol' });
                }
                return;
            }
            out.push({ key: g.key, label: g.label, dotCls: 'acf-aus-dot acf-aus-' + g.key });
        });
        return out;
    }

    // Una persona por fila con sus ausencias agrupadas, ordenadas por nombre
    ausPersonas(ausencias) {
        const porEmp = new Map();
        ausencias.forEach(a => {
            const k = a.empleadoId || a.id;
            if (!porEmp.has(k)) {
                porEmp.set(k, {
                    key: k,
                    nombre: a.nombre || 'Sin nombre',
                    departamento: a.departamento || SIN_DEPARTAMENTO,
                    empresaTitular: a.empresaTitular || SIN_EMPRESA,
                    ausencias: []
                });
            }
            porEmp.get(k).ausencias.push(a);
        });
        return [...porEmp.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    }

    // Filas del calendario: una por persona con ausencias en el periodo y, si
    // se agrupa, una fila de cabecera por departamento, empresa titular o tipo
    get ausRows() {
        const dias = this.ausDias;
        const filas = [];
        const pintar = (e, prefijo) => filas.push({
            key: (prefijo ? prefijo + '·' : '') + e.key,
            esGrupo: false,
            nombre: e.nombre,
            departamento: e.departamento,
            celdas: this.ausCeldas(e.ausencias, dias)
        });

        // Por tipo, una persona puede salir en varios grupos: en cada grupo
        // solo se pintan sus ausencias de ese tipo
        if (this.ausAgruparSel === 'tipo') {
            const porTipo = new Map();
            this.ausFiltradas.forEach(a => {
                const t = a.tipo || 'Sin tipo';
                if (!porTipo.has(t)) porTipo.set(t, []);
                porTipo.get(t).push(a);
            });
            [...porTipo.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(t => {
                filas.push({ key: 'g·' + t, esGrupo: true, etiqueta: t });
                this.ausPersonas(porTipo.get(t)).forEach(e => pintar(e, 'g·' + t));
            });
            return filas;
        }

        const empleados = this.ausPersonas(this.ausFiltradas);
        if (!this.ausAgruparSel) {
            empleados.forEach(e => pintar(e, ''));
            return filas;
        }
        const clave = e => this.ausAgruparSel === 'empresa' ? e.empresaTitular : e.departamento;
        const grupos = new Map();
        empleados.forEach(e => {
            const k = clave(e);
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(e);
        });
        [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(g => {
            filas.push({ key: 'g·' + g, esGrupo: true, etiqueta: g });
            grupos.get(g).forEach(e => pintar(e, 'g·' + g));
        });
        return filas;
    }

    ausCeldas(ausencias, dias) {
        return dias.map(d => {
            const a = ausencias.find(x => String(x.inicio) <= d.iso && d.iso <= String(x.fin || x.inicio));
            let cls = 'acf-aus-celda' + (d.finde ? ' acf-aus-finde' : '') + (d.esHoy ? ' acf-aus-hoycol' : '');
            let title = '';
            if (a) {
                const grupo = this.ausGrupo(a.tipo).key;
                // Vacaciones: azul aprobadas o completadas, amarillo solicitadas
                if (grupo === 'vacaciones' && a.estado === 'Solicitado') {
                    cls += ' acf-aus-vacsol';
                } else {
                    cls += ' acf-aus-' + grupo;
                    if (a.estado === 'Solicitado') cls += ' acf-aus-solicitada';
                }
                if (a.unidad === 'Horas') cls += ' acf-aus-horas';
                title = (a.tipo || 'Ausencia') + ' · ' + (a.estado || '');
                if (a.unidad === 'Horas') {
                    if (a.horaInicio) title += ` · ${a.horaInicio}–${a.horaFin || ''}`;
                    else if (a.cantidad) title += ` · ${a.cantidad} h`;
                    else title += ' · por horas';
                }
            }
            return { key: d.key, cls, title };
        });
    }

    get ausHayFilas() { return this.ausFiltradas.length > 0; }
    // Las filas de departamento abarcan Persona + Departamento + los días visibles
    get ausColspan() { return 2 + this.ausNumDias; }
    get ausKpiPersonas() {
        const ids = new Set(this.ausFiltradas.map(a => a.empleadoId || a.id));
        return this.fmtNumber(ids.size) + (ids.size === 1 ? ' persona' : ' personas');
    }

    // ===== Filtros =====
    get opcionesActivo() {
        return [
            { label: 'Todos', value: '' },
            { label: 'Activos', value: 'si' },
            { label: 'Inactivos', value: 'no' }
        ];
    }

    handleFiltroActivo(e) { this.filtroActivo = e.detail.value; }

    // ===== Multiselección de empresa titular =====
    get empresaOptionsView() {
        return this.opcionesMs(this.datos.map(f => f.empresaTitular || SIN_EMPRESA), this.filtroEmpresas);
    }
    get empresaTriggerLabel() { return this.etiquetaMs(this.filtroEmpresas, 'Todas'); }
    toggleEmpresaDropdown() { this.showEmpresaDropdown = !this.showEmpresaDropdown; }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; }
    handleEmpresaToggle(e) {
        this.filtroEmpresas = this.alternar(this.filtroEmpresas, e.currentTarget.dataset.value);
    }
    handleEmpresaTodas() { this.filtroEmpresas = []; }

    // ===== Multiselección de departamento asignado =====
    get deptoOptionsView() {
        return this.opcionesMs(this.datos.map(f => f.departamento || SIN_DEPARTAMENTO), this.filtroDepartamentos);
    }
    get deptoTriggerLabel() { return this.etiquetaMs(this.filtroDepartamentos, 'Todos'); }
    toggleDeptoDropdown() { this.showDeptoDropdown = !this.showDeptoDropdown; }
    closeDeptoDropdown() { this.showDeptoDropdown = false; }
    handleDeptoToggle(e) {
        this.filtroDepartamentos = this.alternar(this.filtroDepartamentos, e.currentTarget.dataset.value);
    }
    handleDeptoTodos() { this.filtroDepartamentos = []; }

    stopClick(e) { e.stopPropagation(); }

    opcionesMs(valores, seleccion) {
        const unicos = [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'));
        return unicos.map(v => ({
            value: v,
            label: v,
            optionClass: seleccion.includes(v) ? 'ts-ms-option ts-ms-option-selected' : 'ts-ms-option'
        }));
    }
    etiquetaMs(seleccion, etiquetaVacio) {
        if (!seleccion.length) return etiquetaVacio;
        if (seleccion.length === 1) return seleccion[0];
        return seleccion.length + ' seleccionados';
    }
    alternar(seleccion, valor) {
        return seleccion.includes(valor) ? seleccion.filter(x => x !== valor) : [...seleccion, valor];
    }

    // Cajas de totales de la Visión general, sobre las filas filtradas
    get visKpis() {
        const filas = this.filasFiltradas;
        const suma = campo => filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
        return [
            { key: 'contabilidades', label: 'Tareas recurrentes', vencKey: 'contabVencidas', vencSufijo: 'vencidas' },
            { key: 'precierres', label: 'Precierres contables', vencKey: 'precVencidos', vencSufijo: 'vencidos' },
            { key: 'cierres', label: 'Cierres contables', vencKey: 'cierVencidos', vencSufijo: 'vencidos' },
            { key: 'libros', label: 'Libros contables', vencKey: 'librosVencidos', vencSufijo: 'vencidos' },
            { key: 'cuentas', label: 'Cuentas anuales', vencKey: 'cuentasVencidas', vencSufijo: 'vencidas' },
            { key: 'rentas', label: 'Rentas' },
            { key: 'expedientes', label: 'Expedientes' },
            { key: 'casos', label: 'Casos' },
            { key: 'oportunidades', label: 'Oportunidades' },
            { key: 'tareas', label: 'Tareas generales' }
        ].map(k => {
            const n = suma(k.key);
            // Debajo del total, cuántos de ellos están ya vencidos
            const venc = k.vencKey ? suma(k.vencKey) : 0;
            return {
                ...k,
                n: this.fmtNumber(n),
                venc: venc > 0 ? this.fmtNumber(venc) + ' ' + k.vencSufijo : '',
                // Cada caja lleva a su pestaña, salvo oportunidades y tareas generales
                destino: VIS_KPI_DESTINOS[k.key] || '',
                // Con pendientes la caja avisa en rojo; a cero se pone en verde
                cls: 'acf-card acf-kpi vis-kpi'
                    + (n > 0 ? ' vis-kpi-rojo' : ' vis-kpi-verde')
                    + (VIS_KPI_DESTINOS[k.key] ? ' acf-kpi-click' : '')
            };
        });
    }

    // Clic en una caja de la Visión general: abre la pestaña correspondiente
    handleVisKpi(e) {
        const destino = e.currentTarget.dataset.destino;
        if (!destino) return;
        if (destino === 'expedientes' || destino === 'casos') {
            this.menuActivo = 'operativa';
            this.opTabActiva = destino;
            if (destino === 'expedientes' && !this.expCargado) this.cargarExp();
            if (destino === 'casos' && !this.casCargado) this.cargarCas();
            return;
        }
        this.balTabActiva = destino;
        if (destino === 'contabilidad' && !this.contabCargado) this.cargarContab();
        if (destino === 'precierres' && !this.precCargado) this.cargarPrec();
        if (destino === 'cierres' && !this.cieCargado) this.cargarCie();
        if (destino === 'libros' && !this.libCargado) this.cargarLib();
        if (destino === 'cuentas' && !this.cuCargado) this.cargarCu();
        if (destino === 'rentas' && !this.renCargado) this.cargarRen();
        if (destino === 'contratoscf' && !this.ccCargado) this.cargarCc();
    }

    // Mis pendientes: solo la línea del usuario conectado; el botón va en
    // amarillo claro y se intensifica al estar pulsado
    @track visMiosActivo = false;
    get visMisBtnCls() {
        return 'acf-btn-mios acf-btn-vis-mios' + (this.visMiosActivo ? ' acf-btn-vis-mios-activo' : '');
    }
    handleVisMios() { this.visMiosActivo = !this.visMiosActivo; }

    // Usuarios inactivos con pendientes: el botón avisa en rojo si hay alguno,
    // contando solo dentro de la empresa titular y el departamento filtrados
    @track visInactivosActivo = false;
    get visNumInactivos() {
        return this.datos.filter(f => {
            if (f.activo) return false;
            const emp = f.empresaTitular || SIN_EMPRESA;
            const dep = f.departamento || SIN_DEPARTAMENTO;
            if (this.filtroEmpresas.length && !this.filtroEmpresas.includes(emp)) return false;
            if (this.filtroDepartamentos.length && !this.filtroDepartamentos.includes(dep)) return false;
            return true;
        }).length;
    }
    get visInactivosLabel() { return 'Usuarios inactivos (' + this.fmtNumber(this.visNumInactivos) + ')'; }
    get visInactivosCls() {
        if (this.visInactivosActivo) return 'acf-btn-mios acf-btn-mios-activo';
        return 'acf-btn-mios' + (this.visNumInactivos > 0 ? ' acf-btn-inc-rojo' : '');
    }
    handleVisInactivos() { this.visInactivosActivo = !this.visInactivosActivo; }

    // Limpiar: deja los filtros y botones como al llegar a la pestaña
    handleVisLimpiar() {
        this.filtroEmpresas = [...VIS_EMPRESAS_DEFECTO];
        this.filtroDepartamentos = [...VIS_DEPARTAMENTOS_DEFECTO];
        this.filtroActivo = '';
        this.visionColFiltro = '';
        this.visMiosActivo = false;
        this.visInactivosActivo = false;
    }

    get filasFiltradas() {
        return this.datos.filter(f => {
            const emp = f.empresaTitular || SIN_EMPRESA;
            const dep = f.departamento || SIN_DEPARTAMENTO;
            if (this.visMiosActivo && f.usuarioId !== USER_ID) return false;
            if (this.visInactivosActivo && f.activo) return false;
            if (this.filtroEmpresas.length && !this.filtroEmpresas.includes(emp)) return false;
            if (this.filtroDepartamentos.length && !this.filtroDepartamentos.includes(dep)) return false;
            if (this.filtroActivo === 'si' && !f.activo) return false;
            if (this.filtroActivo === 'no' && f.activo) return false;
            if (this.visionColFiltro && !(Number(f[this.visionColFiltro]) > 0)) return false;
            return true;
        });
    }

    // Filtro por columna: al pinchar una cabecera solo se muestran los usuarios
    // con valor en esa columna, manteniendo la agrupación por empresa titular
    @track visionColFiltro = '';

    get visionCols() {
        const cols = [
            { campo: 'contabilidades', label: 'Tareas recurrentes' },
            { campo: 'buzon', label: 'Buzón contable' },
            { campo: 'agregador', label: 'Agregador bancario' },
            { campo: 'precierres', label: 'Precierres contables' },
            { campo: 'cierres', label: 'Cierres contables' },
            { campo: 'libros', label: 'Libros contables' },
            { campo: 'cuentas', label: 'Cuentas anuales' },
            { campo: 'rentas', label: 'Rentas' },
            { campo: 'expedientes', label: 'Expedientes' },
            { campo: 'casos', label: 'Casos' },
            { campo: 'oportunidades', label: 'Oportunidades' },
            { campo: 'tareas', label: 'Tareas' }
        ];
        const inicioBloque = ['contabilidades', 'rentas', 'casos'];
        return cols.map(c => ({
            ...c,
            // Agregador bancario aún no tiene datos: sin filtro por cabecera
            cls: (c.campo === 'agregador' ? '' : 'acf-th-click')
                + (this.visionColFiltro === c.campo ? ' acf-th-activo' : '')
                + (inicioBloque.includes(c.campo) ? ' acf-sep' : '')
        }));
    }

    handleVisionCol(e) {
        const campo = e.currentTarget.dataset.campo;
        if (campo === 'agregador') return;
        this.visionColFiltro = this.visionColFiltro === campo ? '' : campo;
    }

    // ===== Agrupación por empresa titular; dentro, orden por departamento y nombre =====
    get filasTabla() {
        const filtradas = this.filasFiltradas;
        const porEmpresa = new Map();
        filtradas.forEach(f => {
            const emp = f.empresaTitular || SIN_EMPRESA;
            if (!porEmpresa.has(emp)) porEmpresa.set(emp, []);
            porEmpresa.get(emp).push(f);
        });

        const out = [];
        [...porEmpresa.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(emp => {
            const usuarios = porEmpresa.get(emp).sort((a, b) => {
                const depA = a.departamento || SIN_DEPARTAMENTO;
                const depB = b.departamento || SIN_DEPARTAMENTO;
                const porDep = depA.localeCompare(depB, 'es');
                return porDep !== 0 ? porDep : a.nombre.localeCompare(b.nombre, 'es');
            });
            out.push(this.filaGrupo('e·' + emp, emp, this.sumar(usuarios)));
            usuarios.forEach(f => {
                out.push({
                    key: 'u·' + f.usuarioId,
                    esUsuario: true,
                    usuarioId: f.usuarioId,
                    nombre: f.nombre,
                    departamento: f.departamento || SIN_DEPARTAMENTO,
                    contratos: this.celda(f.contratos),
                    contratosLink: (Number(f.contratos) || 0) > 0,
                    estadoLabel: f.activo ? 'Activo' : 'Inactivo',
                    estadoCls: f.activo ? 'acf-chip acf-chip-ok' : 'acf-chip acf-chip-bad',
                    clase: 'acf-row',
                    celdas: this.celdasNav(f, f.usuarioId),
                    tareas: this.celda(f.tareas)
                });
            });
        });
        return out;
    }

    filaGrupo(key, etiqueta, tot) {
        return {
            key,
            esGrupo: true,
            etiqueta,
            clase: 'acf-grupo-empresa',
            contratos: this.celda(tot.contratos),
            contratosLink: (Number(tot.contratos) || 0) > 0,
            celdas: this.celdasNav(tot, ''),
            tareas: this.celda(tot.tareas)
        };
    }

    // Celdas numéricas con navegación a su pestaña; usuario vacío = todos.
    // Los campos que abren bloque (Contabilidades, Rentas, Casos) llevan separador.
    celdasNav(src, usuario) {
        const inicioBloque = ['contabilidades', 'rentas', 'casos'];
        return COLS_NAV.map(col => {
            const n = Number(src[col.campo]) || 0;
            // Contabilidades, Precierres, Cierres, Libros y Cuentas muestran al lado, en rojo, cuántos están vencidos
            let venc = '';
            if (col.campo === 'contabilidades' && (Number(src.contabVencidas) || 0) > 0) {
                venc = this.fmtNumber(src.contabVencidas) + ' vencidas';
            } else if (col.campo === 'precierres' && (Number(src.precVencidos) || 0) > 0) {
                venc = this.fmtNumber(src.precVencidos) + ' vencidos';
            } else if (col.campo === 'cierres' && (Number(src.cierVencidos) || 0) > 0) {
                venc = this.fmtNumber(src.cierVencidos) + ' vencidos';
            } else if (col.campo === 'libros' && (Number(src.librosVencidos) || 0) > 0) {
                venc = this.fmtNumber(src.librosVencidos) + ' vencidos';
            } else if (col.campo === 'cuentas' && (Number(src.cuentasVencidas) || 0) > 0) {
                venc = this.fmtNumber(src.cuentasVencidas) + ' vencidas';
            }
            return {
                key: col.campo,
                val: this.celda(src[col.campo]),
                link: n > 0 && !!col.tab,
                tab: col.tab,
                usuario,
                venc,
                cls: 'acf-num acf-num-azul' + (inicioBloque.includes(col.campo) ? ' acf-sep' : '')
            };
        });
    }

    handleVisionNav(e) {
        e.preventDefault();
        e.stopPropagation();
        this.abrirTabConUsuario(e.currentTarget.dataset.tab, e.currentTarget.dataset.usuario || '');
    }

    // Abre la pestaña indicada prefiltrada por el usuario (o sin filtro)
    abrirTabConUsuario(tab, usuario) {
        // Expedientes, casos, oportunidades y vencimientos viven en el menú Mi panel;
        // el resto, en Área Contable y Fiscal
        if (['expedientes', 'casos', 'oportunidades', 'vtos', 'leads'].includes(tab)) {
            this.menuActivo = 'operativa';
            this.opTabActiva = tab;
        } else {
            this.menuActivo = 'balances';
            this.balTabActiva = tab;
        }
        if (tab === 'contabilidad') {
            if (!this.contabCargado) this.cargarContab();
            this.contabPendFiltro = '';
            this.contabAsesorSel = usuario;
        } else if (tab === 'leads') {
            // Leads: la lista Usuarios de la columna izquierda se marca con el propietario
            if (!this.leadCargado) this.cargarLead();
            this.leadTipoSel = '';
            this.leadEventoSel = '';
            this.leadEstadoSel = '';
            this.leadUsuarioSel = usuario;
        } else if (tab === 'precierres') {
            if (!this.precCargado) this.cargarPrec();
            this.precEstadoFiltro = '';
            this.precAsesorSel = usuario;
        } else if (tab === 'cierres') {
            if (!this.cieCargado) this.cargarCie();
            this.cieEstadoFiltro = '';
            this.cieAsesorSel = usuario;
        } else if (tab === 'libros') {
            if (!this.libCargado) this.cargarLib();
            this.libEstadoFiltro = '';
            this.libAsesorSel = usuario;
        } else if (tab === 'cuentas') {
            if (!this.cuCargado) this.cargarCu();
            this.cuEstadoFiltro = '';
            this.cuAsesorSel = usuario;
        } else if (tab === 'rentas') {
            if (!this.renCargado) this.cargarRen();
            this.renEstadoFiltro = '';
            this.renAsesorSel = usuario;
        } else if (tab === 'expedientes') {
            if (!this.expCargado) this.cargarExp();
            this.expTitularSel = '';
            this.expMateriaSel = '';
            this.expAsesorSel = usuario;
        } else if (tab === 'oportunidades') {
            if (!this.opoCargado) this.cargarOpo();
            this.opoPlazoSel = '';
            this.opoAntigSel = '';
            this.opoAsesorSel = usuario;
        } else if (tab === 'vtos') {
            if (!this.vtoCargado) this.cargarVto();
            this.vtoTipoFiltro = '';
            this.vtoDesde = '';
            this.vtoHasta = '';
            this.vtoAsesorSel = usuario;
        }
    }

    sumar(filas) {
        const tot = {};
        CONTADORES.forEach(k => { tot[k] = 0; });
        filas.forEach(f => { CONTADORES.forEach(k => { tot[k] += Number(f[k]) || 0; }); });
        return tot;
    }

    get totales() {
        const filtradas = this.filasFiltradas;
        const tot = this.sumar(filtradas);
        return {
            usuarios: `${this.fmtNumber(filtradas.length)} usuarios`,
            contratos: this.fmtNumber(tot.contratos),
            contratosLink: (Number(tot.contratos) || 0) > 0,
            celdas: this.celdasNav(tot, ''),
            tareas: this.fmtNumber(tot.tareas)
        };
    }

    celda(v) {
        const n = Number(v) || 0;
        return n === 0 ? '—' : this.fmtNumber(n);
    }
    fmtNumber(v) {
        const n = Number(v) || 0;
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    get hasError() { return !!this.error; }
    get showContent() { return !this.loading && !this.error; }
    get hayFilas() { return this.filasFiltradas.length > 0; }

    // Abre el registro en una pestaña nueva (data-object indica el objeto; usuario por defecto)
    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        if (!recordId) return;
        const objectApiName = e.currentTarget.dataset.object || 'User';
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId, objectApiName, actionName: 'view' }
        }).then(url => { window.open(url, '_blank'); });
    }

    reduceError(err) {
        if (!err) return 'Error desconocido';
        if (typeof err === 'string') return err;
        if (err.body) {
            if (Array.isArray(err.body)) return err.body.map(e => e.message).join(', ');
            if (err.body.message) return err.body.message;
        }
        return err.message || JSON.stringify(err);
    }

    // ===== Pestaña Área RR.HH =====
    @track rhData = null;
    @track rhCargado = false;
    @track rhLoading = false;
    @track rhError = null;
    // Subvista: panel o desglose de imputación por días
    @track rhVista = 'panel';

    cargarRh() {
        this.rhLoading = true;
        this.rhError = null;
        getPanelRRHH()
            .then(res => { this.rhData = res; this.rhCargado = true; })
            .catch(err => { this.rhError = this.reduceError(err); })
            .finally(() => { this.rhLoading = false; });
    }

    handleRhRefresh() { this.cargarRh(); }
    get rhHasError() { return !!this.rhError; }
    get rhShow() { return this.esRrhh && !this.rhLoading && !this.rhError && !!this.rhData; }
    get rhEsPanel() { return this.rhVista === 'panel'; }
    // Ver desglose de imputaciones lleva a la subpestaña Pendiente
    // imputaciones de Análisis Imputaciones
    handleRhDesglose() {
        this.menuActivo = 'imputaciones';
        this.imputTab = 'pendientes';
        this.pendVolverRrhh = true;
        this.cargarImputaciones();
    }
    @track pendVolverRrhh = false;
    handlePendVolverRrhh() { this.pendVolverRrhh = false; this.menuActivo = 'rrhh'; }
    handleRhVolver() { this.rhVista = 'panel'; }

    // Decimales con coma para edad y antigüedad medias
    fmtComa(v) { return String(v == null ? 0 : v).replace('.', ','); }

    // --- KPIs de plantilla ---
    get rhTotalEmpleados() { return this.fmtNumber(this.rhData.totalEmpleados); }
    get rhVariacion() {
        const v = this.rhData.variacion12m || 0;
        if (v === 0) return 'sin cambios en 12 meses';
        return (v > 0 ? '+' : '') + v + ' en 12 meses';
    }
    get rhEdadMedia() { return this.fmtComa(this.rhData.edadMedia); }
    get rhEdadRango() {
        return 'rango ' + (this.rhData.edadMin || 0) + ' – ' + (this.rhData.edadMax || 0) + ' años';
    }
    get rhAntiguedadMedia() { return this.fmtComa(this.rhData.antiguedadMedia); }
    get rhMas10() {
        const n = this.rhData.antiguedadMas10 || 0;
        return n + (n === 1 ? ' persona' : ' personas') + ' con +10 años';
    }

    // --- Comparativa de ausencias con el año anterior ---
    get rhAusAnioActual() { return this.rhData.anioActual; }
    get rhAusAnioAnterior() { return this.rhData.anioActual - 1; }
    get rhAusMeses() {
        const meses = this.rhData.ausenciasMeses || [];
        const max = Math.max(1, ...meses.map(m => Math.max(m.actual || 0, m.anterior || 0)));
        const mesHoy = new Date().getMonth() + 1;
        return meses.map(m => {
            const futuro = m.mes > mesHoy;
            return {
                key: m.mes,
                mes: m.mes,
                label: MESES[m.mes - 1].slice(0, 3).toUpperCase(),
                lblAnterior: this.fmtNumber(m.anterior || 0),
                lblActual: futuro ? '–' : this.fmtNumber(m.actual || 0),
                barAnterior: 'height:' + Math.round((m.anterior || 0) / max * 100) + '%',
                barActual: 'height:' + (futuro ? 0 : Math.round((m.actual || 0) / max * 100)) + '%',
                tituloAnterior: 'Ver las ausencias de ' + MESES[m.mes - 1] + ' de ' + (this.rhData.anioActual - 1),
                tituloActual: 'Ver las ausencias de ' + MESES[m.mes - 1] + ' de ' + this.rhData.anioActual
            };
        });
    }

    // --- Listado de las ausencias del mes pinchado en la comparativa ---
    @track rhAusMesData = null;
    @track rhAusMesLoading = false;
    @track rhAusMesError = null;
    @track rhAusMesSel = null;

    get rhEsAusMes() { return this.rhVista === 'ausmes'; }
    handleRhAusMes(e) {
        const anio = Number(e.currentTarget.dataset.anio);
        const mes = Number(e.currentTarget.dataset.mes);
        if (!anio || !mes) return;
        this.rhAusMesSel = { anio, mes };
        this.rhVista = 'ausmes';
        this.rhAusMesData = null;
        this.rhAusMesError = null;
        this.rhAusMesLoading = true;
        getAusenciasMes({ anio, mes })
            .then(res => { this.rhAusMesData = res || []; })
            .catch(err => { this.rhAusMesError = this.reduceError(err); })
            .finally(() => { this.rhAusMesLoading = false; });
    }
    get rhAusMesTitulo() {
        if (!this.rhAusMesSel) return '';
        return 'Ausencias · ' + MESES[this.rhAusMesSel.mes - 1] + ' de ' + this.rhAusMesSel.anio;
    }
    get rhAusMesSub() {
        const n = (this.rhAusMesData || []).length;
        return this.fmtNumber(n) + (n === 1 ? ' ausencia' : ' ausencias')
            + ' · sin vacaciones, maternidad/paternidad ni matrimonio';
    }
    // Días con decimales (el campo Total días admite fracciones como 0,75)
    fmtDias(v) {
        if (v == null) return '';
        return String(Math.round(Number(v) * 100) / 100).replace('.', ',');
    }

    rhAusFila(a, idx, prefijo) {
        return {
            ...a,
            key: (prefijo || '') + a.id,
            idx,
            esGrupo: false,
            inicioFmt: this.fmtFecha(a.inicio),
            finFmt: this.fmtFecha(a.fin),
            horaInicioFmt: a.horaInicio || '',
            horaFinFmt: a.horaFin || '',
            diasFmt: this.fmtDias(a.dias)
        };
    }

    // Agrupación en cascada de un listado de ausencias: niveles es una lista
    // de funciones que dan la etiqueta de grupo de cada fila (externo primero)
    rhAusRowsAgrupadas(datos, niveles, prefijo, nivel) {
        if (!niveles.length) return datos.map((a, i) => this.rhAusFila(a, i + 1, prefijo));
        const [claveFn, ...resto] = niveles;
        const grupos = new Map();
        datos.forEach(a => {
            const k = claveFn(a);
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(a);
        });
        const filas = [];
        [...grupos.keys()].sort((a, b) => String(a).localeCompare(String(b), 'es')).forEach(k => {
            const del = grupos.get(k);
            const subtotal = del.reduce((s, a) => s + (a.dias || 0), 0);
            const clave = (prefijo || '') + 'g' + (nivel || 1) + '·' + k + '·';
            filas.push({
                key: clave,
                esGrupo: true,
                etiqueta: k,
                subtotal: this.fmtDias(subtotal) + ' días',
                grupoCls: 'rh-grupo-persona' + ((nivel || 1) > 1 ? ' rh-grupo-sub' : '')
            });
            filas.push(...this.rhAusRowsAgrupadas(del, resto, clave, (nivel || 1) + 1));
        });
        return filas;
    }

    // Agrupaciones del detalle de mes: por empresa titular y/o por empleado
    @track rhAusMesAgrEmpleado = false;
    @track rhAusMesAgrEmpresa = false;
    handleRhAusMesAgrEmpleado() { this.rhAusMesAgrEmpleado = !this.rhAusMesAgrEmpleado; }
    handleRhAusMesAgrEmpresa() { this.rhAusMesAgrEmpresa = !this.rhAusMesAgrEmpresa; }
    get rhAusMesAgrEmpleadoCls() {
        return 'acf-btn-agrupar' + (this.rhAusMesAgrEmpleado ? ' acf-btn-agrupar-activo' : '');
    }
    get rhAusMesAgrEmpresaCls() {
        return 'acf-btn-agrupar' + (this.rhAusMesAgrEmpresa ? ' acf-btn-agrupar-activo' : '');
    }
    get rhAusMesRows() {
        const niveles = [];
        if (this.rhAusMesAgrEmpresa) niveles.push(a => a.empresaTitular || 'Sin empresa titular');
        if (this.rhAusMesAgrEmpleado) niveles.push(a => a.nombre || 'Sin empleado');
        return this.rhAusRowsAgrupadas(this.rhAusMesData || [], niveles, '', 1);
    }
    get hayRhAusMes() { return (this.rhAusMesData || []).length > 0; }
    get rhAusMesVacio() {
        return !this.rhAusMesLoading && !this.rhAusMesError && !(this.rhAusMesData || []).length;
    }
    get rhAusMesTotalDias() {
        return this.fmtDias((this.rhAusMesData || []).reduce((s, a) => s + (a.dias || 0), 0));
    }

    // --- Desglose completo de ausencias de la comparativa (dos años) ---
    @track rhAusListaData = null;
    @track rhAusListaLoading = false;
    @track rhAusListaError = null;
    @track rhAusListaAgrupar = false;

    get rhEsAusLista() { return this.rhVista === 'auslista'; }
    handleRhAusLista() {
        this.rhVista = 'auslista';
        if (this.rhAusListaData) return;
        this.rhAusListaError = null;
        this.rhAusListaLoading = true;
        getAusenciasListado()
            .then(res => { this.rhAusListaData = res || []; })
            .catch(err => { this.rhAusListaError = this.reduceError(err); })
            .finally(() => { this.rhAusListaLoading = false; });
    }
    get rhAusListaAgruparCls() {
        return 'acf-btn-agrupar' + (this.rhAusListaAgrupar ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhAusListaAgrupar() { this.rhAusListaAgrupar = !this.rhAusListaAgrupar; }
    // Agrupación por años, combinable con la de personas (años por debajo)
    @track rhAusListaAgrAnio = false;
    get rhAusListaAgrAnioCls() {
        return 'acf-btn-agrupar' + (this.rhAusListaAgrAnio ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhAusListaAgrAnio() { this.rhAusListaAgrAnio = !this.rhAusListaAgrAnio; }

    // Filtro por un solo ejercicio: un botón por año, conmutable (vacío = los dos)
    @track rhAusListaAnioSel = '';
    get rhAusListaAnios() {
        return [String(this.rhAusAnioAnterior), String(this.rhAusAnioActual)].map(a => ({
            anio: a,
            cls: 'acf-btn-agrupar' + (this.rhAusListaAnioSel === a ? ' acf-btn-agrupar-activo' : '')
        }));
    }
    handleRhAusListaAnio(e) {
        const a = e.currentTarget.dataset.anio;
        this.rhAusListaAnioSel = this.rhAusListaAnioSel === a ? '' : a;
    }
    get rhAusListaFiltradas() {
        const datos = this.rhAusListaData || [];
        if (!this.rhAusListaAnioSel) return datos;
        return datos.filter(a => String(a.inicio || '').slice(0, 4) === this.rhAusListaAnioSel);
    }

    // Vista de totales por empleado, sin el detalle de cada ausencia
    @track rhAusListaTotalEmp = false;
    get rhAusListaTotalEmpCls() {
        return 'acf-btn-agrupar' + (this.rhAusListaTotalEmp ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhAusListaTotalEmp() { this.rhAusListaTotalEmp = !this.rhAusListaTotalEmp; }
    get rhAusListaTotalesEmpleado() {
        const porEmp = new Map();
        this.rhAusListaFiltradas.forEach(a => {
            const k = a.nombre || 'Sin empleado';
            if (!porEmp.has(k)) porEmp.set(k, { n: 0, dias: 0 });
            const e = porEmp.get(k);
            e.n++;
            e.dias += a.dias || 0;
        });
        return [...porEmp.entries()]
            .sort((a, b) => b[1].dias - a[1].dias || a[0].localeCompare(b[0], 'es'))
            .map(([nombre, v], i) => ({
                key: nombre,
                idx: i + 1,
                nombre,
                n: this.fmtNumber(v.n),
                dias: this.fmtDias(v.dias) + ' días'
            }));
    }

    get rhAusListaTotalDias() {
        return this.fmtDias(this.rhAusListaFiltradas.reduce((s, a) => s + (a.dias || 0), 0));
    }
    get rhAusListaSub() {
        const n = this.rhAusListaFiltradas.length;
        return this.fmtNumber(n) + (n === 1 ? ' ausencia' : ' ausencias')
            + ' de ' + (this.rhAusListaAnioSel || this.rhAusAnioAnterior + ' y ' + this.rhAusAnioActual)
            + ' · ' + this.rhAusListaTotalDias + ' días'
            + ' · sin vacaciones, maternidad/paternidad ni matrimonio';
    }
    get rhAusListaRows() {
        const niveles = [];
        if (this.rhAusListaAgrupar) niveles.push(a => a.nombre || 'Sin empleado');
        if (this.rhAusListaAgrAnio) niveles.push(a => String(a.inicio || '').slice(0, 4) || 'Sin año');
        return this.rhAusRowsAgrupadas(this.rhAusListaFiltradas, niveles, '', 1);
    }
    get hayRhAusLista() { return this.rhAusListaFiltradas.length > 0; }
    get rhAusListaVacio() {
        return !this.rhAusListaLoading && !this.rhAusListaError && !this.rhAusListaFiltradas.length;
    }
    get rhAcumLabel() { return 'enero – ' + MESES[(this.rhData.mesAcumulado || 1) - 1]; }
    get rhAcumActual() { return this.fmtNumber(this.rhData.acumActual || 0); }
    get rhAcumAnterior() { return this.fmtNumber(this.rhData.acumAnterior || 0); }
    get rhAusDelta() {
        const ant = this.rhData.acumAnterior || 0;
        if (!ant) return '';
        const d = Math.round(((this.rhData.acumActual || 0) - ant) / ant * 100);
        return (d > 0 ? '+' : '') + d + '%';
    }
    get rhAusDeltaCls() {
        const menos = (this.rhData.acumActual || 0) <= (this.rhData.acumAnterior || 0);
        return 'rh-delta ' + (menos ? 'rh-delta-verde' : 'rh-delta-rojo');
    }

    // --- Plantilla de los últimos 12 meses ---
    // Las barras se escalan entre el mínimo y el máximo del año (no desde
    // cero) para que las diferencias de plantilla se aprecien a simple vista
    get rhPlantilla() {
        const arr = this.rhData.plantilla || [];
        const valores = arr.map(p => p.n || 0);
        const max = Math.max(...valores, 0);
        const min = Math.min(...valores);
        const escala = n => max === min ? 80 : 60 + Math.round((n - min) / (max - min) * 40);
        // Todos son meses cerrados (el mes en curso no viene del Apex), así
        // que ninguna barra va resaltada como mes actual
        return arr.map(p => ({
            key: p.anio + '-' + p.mes,
            mes: String(p.mes).padStart(2, '0'),
            n: this.fmtNumber(p.n || 0),
            barStyle: 'height:' + escala(p.n || 0) + '%',
            barCls: 'rh-plant-bar'
        }));
    }

    // --- Incidencias de imputaciones (caja roja y su listado completo) ---
    @track rhIncData = null;
    @track rhIncLoading = false;
    @track rhIncError = null;

    get rhIncImputN() { return this.fmtNumber(this.rhData.incidenciasImputaciones || 0); }

    // La caja roja del panel de RR.HH lleva a la pestaña Análisis Imputaciones;
    // se recuerda el origen para ofrecer el botón de volver al área
    @track rhIncDesdeRrhh = false;
    handleRhIncImput() {
        this.menuActivo = 'imputaciones';
        this.imputTab = 'incidencias';
        this.rhIncDesdeRrhh = true;
        this.cargarImputaciones();
    }
    handleRhIncVolverRrhh() {
        this.rhIncDesdeRrhh = false;
        this.menuActivo = 'rrhh';
    }

    // Cajas de hoy del panel de RR.HH: llevan a Ausencias Equipo (agrupado por
    // tipo) y a Teletrabajo (con Teletrabajo hoy pulsado), con botón de volver
    get rhAusentesHoyN() { return this.fmtNumber(this.rhData.ausentesHoy || 0); }
    get rhTeletrabajoHoyN() { return this.fmtNumber(this.rhData.teletrabajoHoy || 0); }
    // Con gente ausente o teletrabajando hoy, la caja avisa en rojo claro
    get rhAusHoyCls() {
        return 'acf-card rh-hoy-caja' + ((this.rhData.ausentesHoy || 0) > 0 ? ' rh-hoy-caja-roja' : '');
    }
    get rhTelHoyCls() {
        return 'acf-card rh-hoy-caja' + ((this.rhData.teletrabajoHoy || 0) > 0 ? ' rh-hoy-caja-roja' : '');
    }

    @track ausVolverRrhh = false;
    @track telVolverRrhh = false;

    handleRhAusHoy() {
        this.menuActivo = 'operativa';
        this.opTabActiva = 'ausencias';
        this.ausAgruparSel = 'tipo';
        this.ausHoyActivo = true;
        this.ausVolverRrhh = true;
        if (!this.ausCargado) this.cargarAus();
    }
    handleRhTelHoy() {
        this.menuActivo = 'operativa';
        this.opTabActiva = 'teletrabajo';
        this.telHoyActivo = true;
        this.telVolverRrhh = true;
        if (!this.telCargado) this.cargarTel();
    }
    handleAusVolverRrhh() { this.ausVolverRrhh = false; this.menuActivo = 'rrhh'; }
    handleTelVolverRrhh() { this.telVolverRrhh = false; this.menuActivo = 'rrhh'; }

    // Tramo de fechas del listado: por defecto del 1 de enero de 2026 a hoy
    @track rhIncDesde = '2026-01-01';
    @track rhIncHasta = '';

    cargarRhInc() {
        if (!this.rhIncHasta) this.rhIncHasta = this.hoyIso();
        this.rhIncLoading = true;
        this.rhIncError = null;
        getIncidenciasImputaciones({ desde: this.rhIncDesde, hasta: this.rhIncHasta })
            .then(res => { this.rhIncData = res || []; })
            .catch(err => { this.rhIncError = this.reduceError(err); })
            .finally(() => { this.rhIncLoading = false; });
    }

    handleRhIncRefresh() { this.cargarRhInc(); }

    handleRhIncDesde(e) {
        const v = e.detail.value;
        if (!v) return;
        this.rhIncDesde = v;
        if (this.rhIncHasta && this.rhIncHasta < v) this.rhIncHasta = v;
        this.cargarRhInc();
    }

    handleRhIncHasta(e) {
        const v = e.detail.value;
        if (!v) return;
        this.rhIncHasta = v < this.rhIncDesde ? this.rhIncDesde : v;
        this.cargarRhInc();
    }

    // Total de la columna Duración sobre las filas visibles
    get rhIncTotalDuracion() {
        const total = this.rhIncFiltradas.reduce((s, r) => s + (Number(r.duracion) || 0), 0);
        return String(Math.round(total * 100) / 100).replace('.', ',');
    }

    get rhIncSub() {
        const n = this.rhIncFiltradas.length;
        return this.fmtNumber(n) + (n === 1 ? ' imputación' : ' imputaciones')
            + ' · origen Otros ' + (this.rhIncVerIncidencias ? 'en estado Incidencia' : 'no validadas');
    }

    // Vista por estado: por defecto solo se ven las No validado; el botón
    // Incidencias muestra en su lugar las que están en estado Incidencia
    @track rhIncVerIncidencias = false;
    get rhIncNumIncidencias() {
        return (this.rhIncData || []).filter(r => r.estado === 'Incidencia').length;
    }
    get rhIncIncidenciasCls() {
        if (this.rhIncVerIncidencias) return 'acf-btn-agrupar acf-btn-agrupar-activo';
        // Con incidencias pendientes el botón avisa con un fondo rojo claro
        return 'acf-btn-agrupar' + (this.rhIncNumIncidencias > 0 ? ' acf-btn-inc-rojo' : '');
    }
    get rhIncIncidenciasLabel() {
        return 'Incidencias (' + this.fmtNumber(this.rhIncNumIncidencias) + ')';
    }
    handleRhIncVerIncidencias() { this.rhIncVerIncidencias = !this.rhIncVerIncidencias; }

    // Botón de solo las que no tienen iguala ni fiscal ni laboral
    @track rhIncSinIguala = false;
    get rhIncSinIgualaCls() {
        return 'acf-btn-agrupar' + (this.rhIncSinIguala ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhIncSinIguala() { this.rhIncSinIguala = !this.rhIncSinIguala; }

    // Filtro desplegable por subtipo (multiselección) en la cabecera
    @track rhIncSubtiposSel = [];
    @track showRhIncSubDd = false;

    get rhIncSubTriggerLabel() { return this.etiquetaMs(this.rhIncSubtiposSel, 'Todos los subtipos'); }
    get rhIncSubOptionsView() {
        return this.opcionesMs((this.rhIncData || []).map(r => r.subtipo || 'Sin subtipo'),
            this.rhIncSubtiposSel);
    }
    toggleRhIncSubDd() { this.showRhIncSubDd = !this.showRhIncSubDd; }
    closeRhIncSubDd() { this.showRhIncSubDd = false; }
    handleRhIncSubToggle(e) {
        this.rhIncSubtiposSel = this.alternar(this.rhIncSubtiposSel, e.currentTarget.dataset.value);
    }
    handleRhIncSubTodos() { this.rhIncSubtiposSel = []; }

    // Buscador a todo lo ancho por empresa o grupo empresarial
    @track rhIncBusqueda = '';
    handleRhIncBusqueda(e) { this.rhIncBusqueda = e.detail.value; }

    get rhIncFiltradas() {
        let datos = this.rhIncData || [];
        // Vista por estado: No validado por defecto (las de estado vacío se
        // agrupan con ellas) o solo las de estado Incidencia con el botón
        datos = datos.filter(r => this.rhIncVerIncidencias
            ? r.estado === 'Incidencia'
            : r.estado !== 'Incidencia');
        if (this.rhIncSubtiposSel.length) {
            datos = datos.filter(r => this.rhIncSubtiposSel.includes(r.subtipo || 'Sin subtipo'));
        }
        if (this.rhIncSinIguala) {
            datos = datos.filter(r => this.normalizar(r.igualaFiscal) !== 'si'
                && this.normalizar(r.igualaLaboral) !== 'si');
        }
        const t = this.normalizar(this.rhIncBusqueda);
        if (t) {
            datos = datos.filter(r => this.normalizar(r.cuenta).includes(t)
                || this.normalizar(r.grupo).includes(t));
        }
        return datos;
    }

    // Estado editable en cada línea: al validar, la incidencia sale del listado
    get rhIncEstadoOpciones() {
        return [
            { label: 'No validado', value: 'No validado' },
            { label: 'Incidencia', value: 'Incidencia' },
            { label: 'Validado', value: 'Validado' }
        ];
    }

    // Líneas cuyo cambio de estado se está grabando en el servidor
    @track rhIncGuardando = [];

    handleRhIncEstado(e) {
        const id = e.currentTarget.dataset.id;
        const estado = e.detail.value;
        this.rhIncGuardando = [...this.rhIncGuardando, id];
        actualizarEstadoImputacion({ imputacionId: id, estado })
            .then(() => {
                if (estado === 'Validado') {
                    this.rhIncData = (this.rhIncData || []).filter(r => r.id !== id);
                    // El contador de la caja roja solo existe si el panel de
                    // RR.HH ya se cargó en esta sesión
                    if (this.rhData) {
                        const n = (this.rhData.incidenciasImputaciones || 1) - 1;
                        this.rhData = { ...this.rhData, incidenciasImputaciones: Math.max(0, n) };
                    }
                } else {
                    this.rhIncData = (this.rhIncData || []).map(r => r.id === id ? { ...r, estado } : r);
                }
            })
            .catch(err => { this.rhIncError = this.reduceError(err); })
            .finally(() => {
                this.rhIncGuardando = this.rhIncGuardando.filter(x => x !== id);
            });
    }

    // Sí en verde y No en rojo para las igualas fiscal y laboral
    rhIncIgualaCls(v) {
        const s = this.normalizar(v);
        if (s === 'si') return 'acf-chip acf-chip-ok';
        if (s === 'no') return 'acf-chip acf-chip-bad';
        return '';
    }

    // Ampliar por línea: muestra debajo la descripción y el motivo completos
    @track rhIncExpandidas = [];
    @track rhIncTodoAmpliado = false;

    get rhIncTodoLabel() { return this.rhIncTodoAmpliado ? 'Cerrar todo' : 'Ampliar todo'; }
    get rhIncTodoCls() {
        return 'acf-btn-agrupar' + (this.rhIncTodoAmpliado ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhIncAmpliarTodo() {
        this.rhIncTodoAmpliado = !this.rhIncTodoAmpliado;
        this.rhIncExpandidas = this.rhIncTodoAmpliado
            ? (this.rhIncData || []).map(r => r.id)
            : [];
    }

    handleRhIncExpandir(e) {
        const id = e.currentTarget.dataset.id;
        const set = new Set(this.rhIncExpandidas);
        if (set.has(id)) set.delete(id); else set.add(id);
        this.rhIncExpandidas = Array.from(set);
    }

    // Orden por el nombre de la cuenta al pinchar la cabecera
    @track rhIncOrdenCuenta = '';
    handleRhIncOrdenCuenta() {
        this.rhIncOrdenCuenta = this.rhIncOrdenCuenta === 'asc' ? 'desc'
            : (this.rhIncOrdenCuenta === 'desc' ? '' : 'asc');
    }
    get rhIncOrdenCuentaIcono() {
        return this.rhIncOrdenCuenta === 'asc' ? '▲'
            : (this.rhIncOrdenCuenta === 'desc' ? '▼' : '↕');
    }

    get rhIncRows() {
        let filas = this.rhIncFiltradas;
        if (this.rhIncOrdenCuenta) {
            const dir = this.rhIncOrdenCuenta === 'asc' ? 1 : -1;
            filas = [...filas].sort((a, b) =>
                dir * String(a.cuenta || '').localeCompare(String(b.cuenta || ''), 'es'));
        }
        const out = [];
        filas.forEach((r, i) => {
            const expandida = this.rhIncExpandidas.includes(r.id);
            out.push({
                ...r,
                idx: i + 1,
                esDetalle: false,
                fechaFmt: this.fmtFecha(r.fecha),
                tiempoFmt: r.duracionHHMM || '',
                duracionFmt: r.duracion == null ? '' : String(r.duracion).replace('.', ','),
                igualaFiscalCls: this.rhIncIgualaCls(r.igualaFiscal),
                igualaLaboralCls: this.rhIncIgualaCls(r.igualaLaboral),
                notaCls: 'rh-inc-nota ' + (String(r.nota || '').startsWith('Nunca')
                    ? 'rh-inc-nota-roja' : 'rh-inc-nota-verde'),
                guardando: this.rhIncGuardando.includes(r.id),
                hayDetalle: !!((r.descripcion || '').trim() || (r.motivo || '').trim()),
                botonDetalle: expandida ? 'Cerrar' : 'Ampliar'
            });
            if (expandida) {
                out.push({
                    id: r.id + '·det',
                    esDetalle: true,
                    descripcion: (r.descripcion || '').trim() || '—',
                    motivo: (r.motivo || '').trim() || '—'
                });
            }
        });
        return out;
    }

    get hayRhInc() { return this.rhIncFiltradas.length > 0; }
    get rhIncVacio() {
        return !this.rhIncLoading && !this.rhIncError && !this.rhIncFiltradas.length;
    }
    get rhPlantillaAnios() {
        const arr = this.rhData.plantilla || [];
        const grupos = [];
        arr.forEach(p => {
            const ultimo = grupos[grupos.length - 1];
            if (ultimo && ultimo.anio === p.anio) ultimo.n++;
            else grupos.push({ anio: p.anio, n: 1 });
        });
        return grupos.map(g => ({
            anio: g.anio,
            style: 'width:' + (g.n / Math.max(1, arr.length) * 100) + '%'
        }));
    }

    // --- Imputación de horas pendiente (últimas cuatro semanas) ---
    get rhImputPersonas() {
        return ((this.imputBase && this.imputBase.imputaciones) || [])
            .filter(p => p.pendientes > 0)
            .sort((a, b) => b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre, 'es'));
    }
    get rhImputTotalDias() {
        return this.rhImputPersonas.reduce((s, p) => s + p.pendientes, 0);
    }
    get rhImputResumen() {
        const n = this.rhImputPersonas.length;
        return this.fmtNumber(n) + (n === 1 ? ' persona' : ' personas') + ' · '
            + this.fmtNumber(this.rhImputTotalDias) + ' días';
    }
    get rhImputLista() {
        return this.rhImputPersonas.map(p => ({
            ...p,
            key: p.empleadoId,
            badge: this.fmtNumber(p.pendientes) + (p.pendientes === 1 ? ' día' : ' días'),
            badgeCls: 'rh-badge' + (p.pendientes >= 6 ? ' rh-badge-rojo' : '')
        }));
    }
    get hayRhImputaciones() { return this.rhImputPersonas.length > 0; }

    // Las cajas no llevan scroll: se limitan las líneas visibles y un Ver
    // todos al pie abre la vista completa correspondiente
    get rhImputListaVisible() { return this.rhImputLista.slice(0, 10); }
    get rhImputHayMas() { return this.rhImputLista.length > 10; }
    get rhAusPendVisibles() { return this.rhAusPendientes.slice(0, 6); }
    get rhAusPendHayMas() { return this.rhAusPendientes.length > 6; }
    get rhSinFicharVisibles() { return this.rhSinFichar.slice(0, 4); }
    get rhSinFicharHayMas() { return this.rhSinFichar.length > 4; }
    get rhFichajesVisibles() { return this.rhFichajes.slice(0, 6); }
    get rhFichajesHayMas() { return this.rhFichajes.length > 6; }

    // Vistas de listado completo de las cajas
    get rhEsAusPendLista() { return this.rhVista === 'auspendlista'; }
    get rhEsSinFicharLista() { return this.rhVista === 'sinficharlista'; }
    get rhEsFichajesLista() { return this.rhVista === 'fichajeslista'; }
    handleRhVerAusPend() { this.rhVista = 'auspendlista'; }
    handleRhVerSinFichar() { this.rhVista = 'sinficharlista'; }
    handleRhVerFichajes() { this.rhVista = 'fichajeslista'; }
    // Notas de gastos para aprobar: unas pocas en la caja y el resto en su listado completo
    get rhNotasGastosVisibles() { return this.rhNotasGastos.slice(0, 5); }
    get rhNotasGastosHayMas() { return this.rhNotasGastos.length > 5; }
    get rhEsNotasGastosLista() { return this.rhVista === 'notasgastoslista'; }
    handleRhVerNotasGastos() { this.rhVista = 'notasgastoslista'; }
    get rhNotasGastosRows() { return this.rhNotasGastos.map((g, i) => ({ ...g, idx: i + 1 })); }
    get rhAusPendRows() {
        return this.rhAusPendientes.map((a, i) => ({ ...a, idx: i + 1 }));
    }
    get rhSinFicharRows() {
        return this.rhSinFichar.map((e, i) => ({ ...e, idx: i + 1 }));
    }
    get rhFichajesRows() {
        return this.rhFichajes.map((f, i) => ({ ...f, idx: i + 1 }));
    }

    // --- Desglose de imputación por días ---
    get rhDias() {
        if (!this.imputBase || !this.imputBase.inicioVentana) return [];
        const [y, mo, d] = String(this.imputBase.inicioVentana).split('-').map(Number);
        const base = new Date(y, mo - 1, d);
        const hoyIso = this.hoyIso();
        const p = n => String(n).padStart(2, '0');
        const letras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        const out = [];
        for (let i = 0; i < 28; i++) {
            const dt = new Date(base);
            dt.setDate(base.getDate() + i);
            const iso = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
            const dow = (dt.getDay() + 6) % 7;
            const finde = dow >= 5;
            const esHoy = iso === hoyIso;
            out.push({
                key: iso, iso, finde, esHoy,
                letra: letras[dow],
                num: p(dt.getDate()),
                titulo: `${DIAS_SEMANA[dt.getDay()]} ${dt.getDate()} de ${MESES[dt.getMonth()]}`,
                thCls: 'rh-th-dia' + (finde ? ' rh-th-finde' : '') + (esHoy ? ' rh-th-hoy' : '')
            });
        }
        return out;
    }
    get rhSemanas() {
        const dias = this.rhDias;
        const corta = i => {
            const [, m, d] = dias[i].iso.split('-').map(Number);
            return `${String(d).padStart(2, '0')} ${MESES[m - 1].slice(0, 3)}`;
        };
        const out = [];
        for (let s = 0; s < 4; s++) {
            out.push({ key: s, label: `${corta(s * 7)} – ${corta(s * 7 + 6)}` });
        }
        return out;
    }
    get rhDesgloseTitulo() {
        return this.rhImputResumen + ' sin imputar en las 4 últimas semanas';
    }
    // --- Recordatorio de imputación por correo electrónico ---
    @track rhRecordAbierto = false;
    @track rhRecordNombre = '';
    @track rhRecordPara = '';
    @track rhRecordAsunto = '';
    @track rhRecordCuerpo = '';
    @track rhRecordEnviando = false;
    @track rhRecordError = null;
    @track rhRecordOk = false;

    handleRhRecordAbrir(e) {
        const id = e.currentTarget.dataset.id;
        const p = this.rhImputPersonas.find(x => x.empleadoId === id);
        if (!p) return;
        const dias = this.rhDias;
        const pendientes = [];
        (p.dias || []).forEach((estado, i) => {
            if (estado === 'pendiente') pendientes.push(dias[i].titulo);
        });
        this.rhRecordNombre = p.nombre;
        this.rhRecordPara = p.email || '';
        this.rhRecordAsunto = 'Imputación de horas pendientes';
        this.rhRecordCuerpo = 'Hola ' + ((p.nombre || '').split(' ')[0] || '') + ',\n\n'
            + 'Tienes ' + pendientes.length
            + (pendientes.length === 1 ? ' día pendiente' : ' días pendientes')
            + ' de imputar horas en las cuatro últimas semanas:\n\n'
            + pendientes.map(t => '- ' + t).join('\n')
            + '\n\nPor favor, ponte al día con la imputación lo antes posible.\n\nUn saludo.';
        this.rhRecordError = null;
        this.rhRecordOk = false;
        this.rhRecordAbierto = true;
    }

    handleRhRecordCerrar() { this.rhRecordAbierto = false; }
    handleRhRecordPara(e) { this.rhRecordPara = e.detail.value; }
    handleRhRecordAsunto(e) { this.rhRecordAsunto = e.detail.value; }
    handleRhRecordCuerpo(e) { this.rhRecordCuerpo = e.detail.value; }

    handleRhRecordEnviar() {
        this.rhRecordEnviando = true;
        this.rhRecordError = null;
        enviarRecordatorioImputacion({
            destinatario: this.rhRecordPara,
            asunto: this.rhRecordAsunto,
            cuerpo: this.rhRecordCuerpo
        })
            .then(() => {
                // La confirmación va dentro de la propia ventana; el toast es un refuerzo
                this.rhRecordOk = true;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Recordatorio enviado',
                    message: 'Correo enviado a ' + this.rhRecordPara,
                    variant: 'success'
                }));
            })
            .catch(err => { this.rhRecordError = this.reduceError(err); })
            .finally(() => { this.rhRecordEnviando = false; });
    }

    // Agrupación del desglose por departamento, con su subtotal de días sin imputar
    // Agrupar por departamento viene marcado por defecto
    @track rhDesgAgrDepto = true;
    get rhDesgAgrDeptoCls() {
        return 'acf-btn-agrupar' + (this.rhDesgAgrDepto ? ' acf-btn-agrupar-activo' : '');
    }
    handleRhDesgAgrDepto() { this.rhDesgAgrDepto = !this.rhDesgAgrDepto; }

    get rhDesgloseRows() {
        const dias = this.rhDias;
        const etiquetas = {
            imputado: 'Imputado', pendiente: 'Sin imputar', ausencia: 'Ausencia',
            futuro: 'Pendiente de llegar', finde: 'Fin de semana', fuera: 'Fuera de contrato'
        };
        const fila = p => ({
            key: p.empleadoId,
            nombre: p.nombre,
            departamento: p.departamento,
            faltan: this.fmtNumber(p.pendientes),
            faltanCls: 'rh-faltan' + (p.pendientes >= 6 ? ' rh-faltan-rojo' : ''),
            celdas: p.dias.map((estado, i) => ({
                key: dias[i].iso,
                cls: 'rh-celda rh-celda-' + estado + (dias[i].esHoy ? ' rh-celda-hoy' : ''),
                title: dias[i].titulo + ' · ' + etiquetas[estado]
            }))
        });
        if (!this.rhDesgAgrDepto) return this.rhImputPersonas.map(fila);
        const grupos = new Map();
        this.rhImputPersonas.forEach(p => {
            const k = p.departamento || 'Sin departamento';
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(p);
        });
        const out = [];
        [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(k => {
            const del = grupos.get(k);
            const pend = del.reduce((s, p) => s + (p.pendientes || 0), 0);
            out.push({
                key: 'g·' + k,
                esGrupo: true,
                etiqueta: k,
                subtotal: this.fmtNumber(pend)
            });
            out.push(...del.map(fila));
        });
        return out;
    }

    // --- Ausencias y vacaciones por aprobar o completar ---
    rhFechaCorta(iso) {
        if (!iso) return '';
        const [, m, d] = String(iso).split('-').map(Number);
        return d + ' ' + MESES[m - 1].slice(0, 3);
    }
    get rhAusPendientes() {
        return (this.rhData.ausPendientes || []).map(a => ({
            ...a,
            key: a.id,
            chipCls: a.estado === 'Por aprobar' ? 'acf-chip acf-chip-warn' : 'acf-chip acf-chip-info',
            rango: (a.tipo || 'Ausencia') + ' · ' + this.rhFechaCorta(a.inicio)
                + (a.fin && a.fin !== a.inicio ? ' – ' + this.rhFechaCorta(a.fin) : ''),
            inicioFmt: this.fmtFecha(a.inicio),
            finFmt: this.fmtFecha(a.fin)
        }));
    }
    get rhAusPendientesN() { return this.fmtNumber((this.rhData.ausPendientes || []).length); }
    get hayRhAusPendientes() { return (this.rhData.ausPendientes || []).length > 0; }

    // --- Sin fichar hoy ---
    get rhSinFichar() {
        return (this.rhData.sinFichar || []).map(e => ({ ...e, key: e.empleadoId }));
    }
    get rhSinFicharN() { return this.fmtNumber((this.rhData.sinFichar || []).length); }
    get rhFichajeActivo() { return !!this.rhData.sinFicharActivo; }
    get haySinFichar() { return this.rhFichajeActivo && (this.rhData.sinFichar || []).length > 0; }
    get rhSinFicharVacio() { return this.rhFichajeActivo && !(this.rhData.sinFichar || []).length; }

    // --- Notas de gastos para aprobar: notas con empleado de RR.HH pendientes de aprobación ---
    get rhNotasGastos() {
        const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
        return (this.rhData.notasGastos || []).map(g => ({
            ...g,
            key: g.id,
            fechaFmt: this.fmtFecha(g.fecha),
            importeFmt: g.importe == null ? '—' : fmtEur.format(g.importe),
            empleado: g.empleado || 'Sin empleado'
        }));
    }
    get rhNotasGastosN() { return this.fmtNumber((this.rhData.notasGastos || []).length); }
    get hayRhNotasGastos() { return (this.rhData.notasGastos || []).length > 0; }
    // Suma de importes pendientes, para el subtítulo de la caja
    get rhNotasGastosTotal() {
        const total = (this.rhData.notasGastos || []).reduce((s, g) => s + (Number(g.importe) || 0), 0);
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(total);
    }
    // Cajita junto a Ausentes hoy / Teletrabajo hoy: importe de los efectos de
    // proveedores con empleado aún no pagados; en rojo claro cuando hay importe
    get rhEfectosGastosImporteFmt() {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
            .format(Number(this.rhData.efectosGastosImporte) || 0);
    }
    get rhEfectosGastosTitle() {
        const n = this.rhData.efectosGastosN || 0;
        return 'Importe de ' + this.fmtNumber(n) + (n === 1 ? ' efecto' : ' efectos')
            + ' de proveedores con empleado de RR.HH, en estado distinto de Tarjeta, Transferido y Conciliado';
    }
    get rhNotasGastosCls() {
        return 'acf-card rh-hoy-caja' + ((Number(this.rhData.efectosGastosImporte) || 0) > 0 ? ' rh-hoy-caja-roja' : '');
    }

    // --- Fichajes incompletos ---
    get rhFichajes() {
        return (this.rhData.fichajesIncompletos || []).map(f => ({
            ...f,
            key: f.id,
            fechaFmt: this.fmtFecha(f.fecha),
            badge: this.fmtNumber(f.diasSin) + (f.diasSin === 1 ? ' día' : ' días'),
            badgeCls: 'rh-badge' + (f.diasSin > 5 ? ' rh-badge-rojo' : ''),
            detalle: 'Entrada ' + f.horaEntrada + ' · sin salida',
            borrando: this.rhFichBorrandoId === f.id
        }));
    }

    // Papelera de un fichaje incompleto: borra el registro horario y lo
    // quita de la lista sin recargar el panel entero
    @track rhFichBorrandoId = null;
    handleRhBorrarFichaje(e) {
        const id = e.currentTarget.dataset.id;
        if (!id || this.rhFichBorrandoId) return;
        this.rhFichBorrandoId = id;
        borrarRegistroHorario({ registroId: id })
            .then(() => {
                this.rhData = { ...this.rhData,
                    fichajesIncompletos: (this.rhData.fichajesIncompletos || []).filter(f => f.id !== id) };
            })
            .catch(err => { this.rhError = this.reduceError(err); })
            .finally(() => { this.rhFichBorrandoId = null; });
    }
    get rhFichajesN() { return this.fmtNumber((this.rhData.fichajesIncompletos || []).length); }
    get rhFichajesMas5() {
        const n = (this.rhData.fichajesIncompletos || []).filter(f => f.diasSin > 5).length;
        return n + ' con más de 5 días';
    }
    // El aviso de más de 5 días solo aparece cuando hay alguno
    get rhMuestraFichajesMas5() {
        return (this.rhData.fichajesIncompletos || []).some(f => f.diasSin > 5);
    }
    // El contador de sin fichar solo aparece con personas y a partir de las 10:00
    get rhMuestraSinFicharN() {
        return this.rhFichajeActivo && (this.rhData.sinFichar || []).length > 0;
    }
    get hayRhFichajes() { return (this.rhData.fichajesIncompletos || []).length > 0; }
}