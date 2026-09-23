import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import basePath from '@salesforce/community/basePath';
import NAME_FIELD from '@salesforce/schema/User.Name';
import EMAIL_FIELD from '@salesforce/schema/User.Email';
import PHONE_FIELD from '@salesforce/schema/User.Phone';
import LANGUAGE_FIELD from '@salesforce/schema/User.LanguageLocaleKey';

// Mapa de códigos de idioma de Salesforce a etiquetas legibles.
// Se puede ampliar según los idiomas que realmente uséis en el portal.
const LANGUAGE_LABELS = {
    es: 'Español',
    es_ES: 'Español',
    en_US: 'Inglés',
    en: 'Inglés',
    fr: 'Francés',
    pt_BR: 'Portugués',
    ca: 'Catalán'
};

// Breakpoint que define "vista móvil" en todo el componente (debe coincidir
// con el usado en el CSS: @media (max-width: 768px))
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)';

/**
 * Plantilla base del área privada de la Digital Experience.
 * Envuelve cualquier página con la barra lateral (logo + menú + usuario)
 * y la cabecera de la página, dejando el contenido específico en el slot por defecto.
 *
 * Los datos del usuario (nombre, email, teléfono, idioma) se obtienen automáticamente
 * del usuario logado en el momento, mediante @salesforce/user/Id + getRecord.
 *
 * NOTA (TODO-limpieza): userName, userEmail y userInitials se mantienen aquí como @api
 * únicamente porque Experience Builder ya tiene una instancia de este componente en el
 * Theme Layout "Area Privada" con valores guardados para esas propiedades, y Salesforce
 * no permite eliminarlas del .js-meta.xml mientras esa instancia exista (ni con
 * publish, según lo comprobado). No se usan en ningún sitio del componente: los datos
 * reales se calculan a partir del usuario logado, más abajo. Pendiente de que el equipo
 * elimine/reemplace la instancia del widget en el Builder para poder retirarlas del todo.
 *
 * @author JCL - BEOC9
 */
export default class PortalPrivateLayout extends NavigationMixin(LightningElement) {
    // eslint-disable-next-line @lwc/lwc/no-unused-vars
    @api userName;
    // eslint-disable-next-line @lwc/lwc/no-unused-vars
    @api userEmail;
    // eslint-disable-next-line @lwc/lwc/no-unused-vars
    @api userInitials;

    // Página de la Experience a la que navega el acceso "Facturas & Suscripción" del pie
    @api billingPageApiName = 'Facturas_Suscripcion';

    userId = USER_ID;
    isUserMenuOpen = false;
    isCartMenuOpen = false;

    // Controla si el menú lateral está desplegado. Por defecto arranca en true
    // (comportamiento de escritorio); en connectedCallback se corrige a false
    // si detectamos que estamos en un viewport móvil.
    isSidebarOpen = true;

    currentUserName;
    currentUserEmail;
    currentUserPhone;
    currentUserLanguage;

    connectedCallback() {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            const isMobileViewport = window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
            if (isMobileViewport) {
                this.isSidebarOpen = false;
            }
        }
    }

    @wire(getRecord, {
        recordId: '$userId',
        fields: [NAME_FIELD, EMAIL_FIELD, PHONE_FIELD, LANGUAGE_FIELD]
    })
    wiredUser({ data, error }) {
        if (data) {
            this.currentUserName = data.fields.Name.value;
            this.currentUserEmail = data.fields.Email.value;
            this.currentUserPhone = data.fields.Phone.value;
            this.currentUserLanguage = data.fields.LanguageLocaleKey.value;
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('Error obteniendo los datos del usuario logado', error);
        }
    }

    get displayName() {
        return this.currentUserName || 'Usuario';
    }

    get displayEmail() {
        return this.currentUserEmail || '';
    }

    get displayPhone() {
        return this.currentUserPhone || '';
    }

    get displayLanguageLabel() {
        if (!this.currentUserLanguage) {
            return '';
        }
        return LANGUAGE_LABELS[this.currentUserLanguage] || this.currentUserLanguage;
    }

    get displayInitials() {
        if (!this.currentUserName) {
            return '--';
        }
        return this.currentUserName
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('');
    }

    get chevronClass() {
        return this.isUserMenuOpen ? 'chevron chevron_open' : 'chevron';
    }

    // Clase dinámica del <aside>: añade el modificador "_collapsed" cuando el
    // menú está oculto (tanto en móvil como en escritorio). Esta es la ÚNICA
    // clase que dispara animación en todo el mecanismo de colapso.
    get sidebarClass() {
        return this.isSidebarOpen
            ? 'portal-layout__sidebar'
            : 'portal-layout__sidebar portal-layout__sidebar_collapsed';
    }

    // Clase dinámica de la columna principal: cuando el menú está colapsado,
    // el contenido ocupa todo el ancho (en escritorio); en móvil no tiene
    // efecto porque el CSS fuerza margin-left: 0 siempre dentro de esa media query
    get mainClass() {
        return this.isSidebarOpen
            ? 'portal-layout__main'
            : 'portal-layout__main portal-layout__main_expanded';
    }

    // Clase del icono del botón: rota 180° (apunta a la izquierda) cuando el
    // menú está desplegado; sin rotar (apunta a la derecha) cuando está colapsado
    get toggleIconClass() {
        return this.isSidebarOpen ? 'toggle-icon toggle-icon_open' : 'toggle-icon';
    }

    // Clase del botón de la barra superior (escritorio): con el menú desplegado
    // lleva el modificador "_open", que rellena la franja izquierda del icono
    get topbarToggleClass() {
        return this.isSidebarOpen
            ? 'portal-layout__topbar-toggle portal-layout__topbar-toggle_open'
            : 'portal-layout__topbar-toggle';
    }

    get toggleAriaExpanded() {
        return this.isSidebarOpen ? 'true' : 'false';
    }

    get toggleAriaLabel() {
        return this.isSidebarOpen ? 'Colapsar menú' : 'Desplegar menú';
    }

    get logoutUrl() {
        // Mecanismo estándar de Salesforce para cerrar sesión en sitios Experience Cloud (incluye LWR).
        const sitePrefix = basePath.replace(/\/s$/i, '');
        return sitePrefix + '/secur/logout.jsp';
    }

    get profileUrl() {
        // Navegación por URL real (en vez de NavigationMixin) para evitar el error de
        // routing interno de LWR con comm__namedPage en este sitio.
        const sitePrefix = basePath.replace(/\/s$/i, '');
        return sitePrefix + '/mi-perfil';
    }

    // Desplegables de la barra superior (usuario y carrito): solo puede haber uno
    // abierto a la vez, y se cierran al pinchar en el fondo transparente que se
    // pinta detrás mientras están abiertos
    handleToggleUserMenu() {
        this.isUserMenuOpen = !this.isUserMenuOpen;
        this.isCartMenuOpen = false;
    }

    handleCloseUserMenu() {
        this.isUserMenuOpen = false;
    }

    get userMenuAriaExpanded() {
        return this.isUserMenuOpen ? 'true' : 'false';
    }

    handleToggleCartMenu() {
        this.isCartMenuOpen = !this.isCartMenuOpen;
        this.isUserMenuOpen = false;
    }

    handleCloseCartMenu() {
        this.isCartMenuOpen = false;
    }

    get cartMenuAriaExpanded() {
        return this.isCartMenuOpen ? 'true' : 'false';
    }

    // Opciones del carrito (contratos, cuotas-recurrentes, listado-facturas, presupuestos,
    // precios-pactados, provisiones-de-fondos, suplidos, rosetta-store). De momento no van a ningún sitio: se cierra el desplegable
    // y queda event.currentTarget.dataset.action para enganchar la navegación.
    handleCartItemClick() {
        this.isCartMenuOpen = false;
    }

    // Abre/cierra el menú lateral (móvil y escritorio)
    handleToggleSidebar() {
        this.isSidebarOpen = !this.isSidebarOpen;
    }

    // Navega al Home de la comunidad al pulsar el logo (desktop y móvil)
    handleLogoClick() {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Home'
            }
        });
    }

    // Accesos rápidos de la barra superior (Alta / Baja / Incidencias / Modificación de
    // trabajador, Subir facturas, Chat Rosetta IA y Formación). De momento no hacen nada:
    // cuando se decida a qué lleva cada uno, leer event.currentTarget.dataset.action
    // (alta-trabajador, baja-trabajador, incidencias-laborales, modificacion-trabajador,
    // subir-facturas, chat-rosetta-ia, formacion) y navegar o abrir el flujo que toque.
    handleQuickAction() {
        // Pendiente de definir.
    }

    handleFooterLinkClick() {
        if (!this.billingPageApiName) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: this.billingPageApiName
            }
        });
    }
}