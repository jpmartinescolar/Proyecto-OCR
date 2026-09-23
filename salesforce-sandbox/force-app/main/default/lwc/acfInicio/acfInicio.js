import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import USER_ID from '@salesforce/user/Id';
import getInicioRapido from '@salesforce/apex/AreaContableFiscalController.getInicioRapido';
import getMisTareas from '@salesforce/apex/AreaContableFiscalController.getMisTareas';
import getMisTareasProximas from '@salesforce/apex/AreaContableFiscalController.getMisTareasProximas';
import getAccesoRRHH from '@salesforce/apex/AreaRRHHController.getAccesoRRHH';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Accesos rápidos de la cabecera de Detalle (mismos que en areaContableFiscal)
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

// Pestañas de Mi panel: Detalle vive aquí; las demás se abren en el área completa
const OP_TABS = [
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

/**
 * Inicio rápido del Área Contable y Fiscal.
 *
 * Contiene solo la cabecera y la pestaña Detalle (mis contadores, vencimientos
 * legales y mis tareas), de modo que la primera pantalla se descarga y pinta
 * sin arrastrar el resto del área. Al pinchar cualquier otra pestaña o menú se
 * importa dinámicamente c/areaContableFiscal (el componente completo) y se le
 * pasa la navegación pedida; a partir de ahí, este componente solo lo muestra.
 */
export default class AcfInicio extends NavigationMixin(LightningElement) {

    // ===== Componente completo (carga dinámica) =====
    @track mostrarCompleto = false;
    @track completoCtor = null;
    @track completoError = null;
    @track navegacion = null;

    abrirCompleto(navegacion) {
        this.navegacion = navegacion || null;
        this.mostrarCompleto = true;
        if (this.completoCtor) return;
        import('c/areaContableFiscal')
            .then(mod => { this.completoCtor = mod.default; })
            .catch(err => { this.completoError = this.reduceError(err); });
    }

    // ===== Cabecera =====
    @track rhAcceso = false;
    @wire(getAccesoRRHH)
    wiredAccesoRrhh({ data }) { this.rhAcceso = data === true; }

    handleMenu(e) {
        const menu = e.currentTarget.dataset.menu;
        if (menu === 'operativa') return;
        this.abrirCompleto({ accion: 'menu', menu });
    }
    handleAccesoOperativa() { this.abrirCompleto({ accion: 'erp' }); }

    // Totales de las pestañas de Inicio con contador (llegan con la carga rápida)
    @track tabTotales = null;

    // Expedientes, Oportunidades, Casos y Tareas llevan el total entre
    // paréntesis y van en rojo claro con registros (verde claro a cero), como
    // las pestañas del Área Contable y Fiscal
    get opTabs() {
        const tot = this.tabTotales;
        return OP_TABS.map(t => {
            const activa = t.key === this.opTabMarcada;
            let label = t.label;
            let extra = '';
            let aviso = false;
            if (tot && t.key in tot) {
                const n = tot[t.key];
                label = t.label + ' (' + this.fmtNumber(n) + ')';
                // Vencimientos legales, Leads y Casos llevan además un triángulo de aviso con registros
                aviso = ['vtos', 'senalamientos', 'leads', 'casos'].includes(t.key) && n > 0;
                if (activa) extra = n > 0 ? ' lm-subtab-active-rojo' : '';
                else extra = n > 0 ? ' lm-subtab-rojo' : ' lm-subtab-verde';
            }
            return { ...t, label, aviso, cls: (activa ? 'lm-subtab lm-subtab-active' : 'lm-subtab') + extra };
        });
    }
    handleOpTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === 'misituacion') return;
        this.abrirCompleto({ accion: 'optab', tab });
    }

    @track solAbierta = false;
    handleSolicitarAusencia() { this.solAbierta = true; }
    handleSolCerrar() { this.solAbierta = false; }

    // Estados de la carga del área completa
    get verCompleto() { return this.mostrarCompleto && !!this.completoCtor; }
    get cargandoCompleto() { return this.mostrarCompleto && !this.completoCtor; }
    get esMiSituacion() { return !this.cargandoCompleto; }

    // Menú que queda marcado: Inicio, o el pedido mientras se descarga el área completa
    get menuMarcado() {
        const n = this.navegacion;
        if (!this.cargandoCompleto || !n) return 'operativa';
        if (n.accion === 'menu') return n.menu;
        if (n.accion === 'movs') return 'rrhh';
        if (n.accion === 'tabUsuario') return ['expedientes', 'casos', 'oportunidades', 'vtos', 'leads'].includes(n.tab) ? 'operativa' : 'balances';
        if (n.accion === 'erp') return 'erp';
        return 'operativa';
    }
    claseMenu(k) { return this.menuMarcado === k ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get claseMenuOperativa() { return this.claseMenu('operativa'); }
    get claseMenuBalances() { return this.claseMenu('balances'); }
    get claseMenuMarketing() { return this.claseMenu('marketing'); }
    get claseMenuRrhh() { return this.claseMenu('rrhh'); }
    get claseMenuImputaciones() { return this.claseMenu('imputaciones'); }
    get claseMenuOnboarding() { return this.claseMenu('onboarding'); }
    get claseMenuOffboarding() { return this.claseMenu('offboarding'); }
    get verTabsInicio() { return this.menuMarcado === 'operativa'; }

    // Pestaña de Inicio marcada: Detalle, o la pedida mientras se descarga
    get opTabMarcada() {
        const n = this.navegacion;
        if (!this.cargandoCompleto || !n) return 'misituacion';
        if (n.accion === 'optab') return n.tab;
        if (n.accion === 'tabUsuario') return n.tab;
        if (n.accion === 'vtos') return 'vtos';
        if (n.accion === 'senal') return 'senalamientos';
        return 'misituacion';
    }

    // ===== Carga inicial =====
    connectedCallback() {
        this.cargarInicio();
        // Otra pestaña del navegador puede pedir por la URL una vista del área completa
        // (?acfMovs=344,390&acfMovsNombre=...): se descarga y se abre directamente
        const n = this.navegacionDesdeUrl();
        if (n) this.abrirCompleto(n);
    }
    // Misma lectura de la URL que hace c/areaContableFiscal cuando va solo en la página
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
                    vtos: (res && res.tabVtos) || 0,
                    senalamientos: (res && res.tabSenalamientos) || 0,
                    expedientes: (res && res.tabExpedientes) || 0,
                    oportunidades: (res && res.tabOportunidades) || 0,
                    leads: (res && res.tabLeads) || 0,
                    casos: (res && res.tabCasos) || 0,
                    tareas: (res && res.tabTareas) || 0,
                    ausencias: (res && res.tabAusencias) || 0,
                    teletrabajo: (res && res.tabTeletrabajo) || 0
                };
                this.notifPendientes = (res && res.notifPendientes) || 0;
                this.incidAbiertas = (res && res.incidAbiertas) || 0;
            })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
    }

    // ===== Vencimientos legales (semana actual y siguiente) =====
    @track vencDias = [];
    @track vencSinPresentar = 0;
    @track vencSenalPorDelante = 0;

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

    // Las píldoras y los días del calendario abren el área completa en la
    // pestaña de vencimientos o señalamientos ya prefiltrada
    handleVencSinPresentar() { this.abrirCompleto({ accion: 'vtos', tipo: 'vencidos' }); }
    handleVencPorDelante() { this.abrirCompleto({ accion: 'vtos', tipo: 'delante' }); }
    handleVencDia(e) {
        const fecha = e.currentTarget.dataset.fecha;
        const celda = this.vencDias.find(d => String(d.fecha) === fecha);
        if (!celda || !(Number(celda.n) > 0)) return;
        this.abrirCompleto({ accion: 'vtos', fecha });
    }
    handleVencSenalPorDelante() { this.abrirCompleto({ accion: 'senal' }); }
    handleVencSenalDia(e) {
        const fecha = e.currentTarget.dataset.fecha;
        const celda = this.vencDias.find(d => String(d.fecha) === fecha);
        if (!celda || !(Number(celda.s) > 0)) return;
        this.abrirCompleto({ accion: 'senal', fecha });
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


    // Trae el listado completo al pulsar Ver todas, buscar o filtrar por origen
    cargarMisTodas() {
        if (this.misCompletas || this.misLoading) return;
        this.misLoading = true;
        getMisTareas()
            .then(res => { this.misTareas = res || []; this.misCompletas = true; })
            .catch(err => { this.misError = this.reduceError(err); })
            .finally(() => { this.misLoading = false; });
    }

    // Vuelve a pedir la carga rápida
    handleMisRefresh() { this.cargarInicio(); }

    get misHasError() { return !!this.misError; }
    // La estructura de Detalle se pinta al instante; los bloques de datos se
    // rellenan cuando responde la llamada rápida (la ruleta va encima)
    get misShow() { return this.esMiSituacion && !this.misError; }

    // Cajas con mis totales, de la llamada rápida
    get miFila() { return this.miResumen || {}; }

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


    // Una caja abre el área completa en su pestaña filtrada por mis registros
    handleMisCaja(e) {
        const tab = e.currentTarget.dataset.tab;
        if (!tab) return;
        this.abrirCompleto({ accion: 'tabUsuario', tab, usuario: USER_ID });
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

    // ===== Utilidades (mismas que en areaContableFiscal) =====
    fmtNumber(v) {
        const n = Number(v) || 0;
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    fmtFecha(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).split('-');
        return `${Number(d)}/${Number(m)}/${y}`;
    }

    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

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
}