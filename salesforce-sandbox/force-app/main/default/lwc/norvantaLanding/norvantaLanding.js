import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';
import HERO_IMG from '@salesforce/resourceUrl/rosettaHero';
import EMP_IMG from '@salesforce/resourceUrl/rosettaEmpresas';
import JOSE_IMG from '@salesforce/resourceUrl/teamJose';
import RAFAEL_IMG from '@salesforce/resourceUrl/teamRafael';
import EMILIO_IMG from '@salesforce/resourceUrl/teamEmilio';

const EMP_SUB = 'Todas las cuestiones fiscales, laborales y jurídicas de tu empresa en un único despacho.';
const EMP_SUB_B = 'Experiencia con compañías nacionales y multinacionales que no pueden permitirse errores.';
const PART_SUB = 'Patrimonio, herencias, fiscalidad del expatriado o un asunto laboral.';
const PART_SUB_B = 'Te asesoramos con rigor y trato directo, también en inglés.';
const EMP_POINTS = ['Fiscalidad nacional e internacional', 'Laboral y movilidad de empleados', 'Mercantil, M&A y societario'];
const PART_POINTS = ['Renta, patrimonio y no residentes', 'Autónomos y profesionales', 'Herencias, vivienda y laboral'];
const COMPANY_POINTS = ['Externalización contable y reporting', 'Fiscalidad nacional e internacional', 'Nóminas y movilidad de empleados', 'Mercantil, societario y M&A', 'Consolidación y cuadro de mando', 'Interlocutor único multilingüe'];
const TECH_POINTS = ['Tu información fiscal y contable, siempre al día', 'Expedientes, escrituras y facturas del despacho', 'Firma digital y avisos de plazos', 'Conecta tus datos con tu IA (ChatGPT, Gemini) mediante MCP'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default class NorvantaLanding extends NavigationMixin(LightningElement) {
    // El botón Acceso clientes lleva la dirección fija del login en el dominio propio
    // (https://www.rosettaadvisor.com/login), por decisión del despacho el 06/09/2026

    audience = 'empresas';
    form = { nombre: '', empresa: '', email: '', telefono: '', area: '', mensaje: '', consent: false };
    errNombre = false;
    errEmail = false;
    errConsent = false;
    sent = false;
    news = '';
    newsOk = false;
    newsErr = false;
    heroImg = HERO_IMG;
    empresasImg = EMP_IMG;
    joseImg = JOSE_IMG;
    rafaelImg = RAFAEL_IMG;
    emilioImg = EMILIO_IMG;
    headerHidden = false;
    _lastScroll = 0;
    menuOpen = false;

    get headerClass() { return this.headerHidden ? 'nv-header nv-hide' : 'nv-header'; }
    get navClass() { return this.menuOpen ? 'nv-nav nv-nav-open' : 'nv-nav'; }
    toggleMenu() { this.menuOpen = !this.menuOpen; }

    legalDoc = null;
    get legalOpen() { return !!this.legalDoc; }
    get isAviso() { return this.legalDoc === 'aviso'; }
    get isPriv() { return this.legalDoc === 'privacidad'; }
    get isCookies() { return this.legalDoc === 'cookies'; }
    openLegal(event) { event.preventDefault(); this.legalDoc = event.currentTarget.dataset.doc; }
    closeLegal() { this.legalDoc = null; }
    stopProp(event) { event.stopPropagation(); }

    connectedCallback() { window.addEventListener('scroll', this.handleScroll, { passive: true }); }
    disconnectedCallback() { window.removeEventListener('scroll', this.handleScroll); }

    _hashHandled = false;
    renderedCallback() {
        if (this._hashHandled) return;
        const hash = (window.location.hash || '').replace('#', '');
        if (hash) {
            this._hashHandled = true;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => this.scrollTo(hash), 350);
        }
    }
    handleScroll = () => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        this.headerHidden = (y > this._lastScroll && y > 140);
        this._lastScroll = y;
    };

    get isEmp() { return this.audience === 'empresas'; }
    get empActive() { return this.isEmp ? 'active' : ''; }
    get partActive() { return this.isEmp ? '' : 'active'; }
    get audienceSub() { return this.isEmp ? EMP_SUB : PART_SUB; }
    get audienceSubB() { return this.isEmp ? EMP_SUB_B : PART_SUB_B; }
    get audiencePoints() { return (this.isEmp ? EMP_POINTS : PART_POINTS).map((text, i) => ({ id: i, text })); }
    get companyPoints() { return COMPANY_POINTS.map((text, i) => ({ id: i, text })); }
    get techPoints() { return TECH_POINTS.map((text, i) => ({ id: i, text })); }

    setEmpresas() { this.audience = 'empresas'; }
    setParticulares() { this.audience = 'particulares'; }

    handleNav(event) {
        event.preventDefault();
        this.menuOpen = false;
        this.scrollTo(event.currentTarget.dataset.target);
    }

    goNoticias(event) {
        if (event) event.preventDefault();
        this.menuOpen = false;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + '/listado-noticias' }
        });
    }

    goLegal(event) {
        event.preventDefault();
        const map = { aviso: '/aviso-legal', privacidad: '/privacidad', cookies: '/cookies' };
        const path = map[event.currentTarget.dataset.doc] || '/';
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + path }
        });
    }

    handleRequest(event) {
        this.form = { ...this.form, area: event.currentTarget.dataset.area };
        this.scrollTo('contacto');
    }

    scrollTo(target) {
        const el = this.template.querySelector(`[data-section="${target}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    handleFormChange(event) {
        const t = event.target;
        const val = t.type === 'checkbox' ? t.checked : t.value;
        this.form = { ...this.form, [t.name]: val };
    }

    handleSubmit(event) {
        event.preventDefault();
        const f = this.form;
        this.errNombre = !f.nombre.trim();
        this.errEmail = !EMAIL_RE.test((f.email || '').trim());
        this.errConsent = !f.consent;
        if (this.errNombre || this.errEmail || this.errConsent) return;
        this.sent = true;
    }

    resetForm() {
        this.sent = false;
        this.form = { nombre: '', empresa: '', email: '', telefono: '', area: '', mensaje: '', consent: false };
        this.errNombre = false;
        this.errEmail = false;
        this.errConsent = false;
    }

    handleNewsChange(event) {
        this.news = event.target.value;
        this.newsErr = false;
    }

    handleNewsSubmit(event) {
        event.preventDefault();
        if (!EMAIL_RE.test((this.news || '').trim())) {
            this.newsErr = true;
            return;
        }
        this.newsOk = true;
    }
}