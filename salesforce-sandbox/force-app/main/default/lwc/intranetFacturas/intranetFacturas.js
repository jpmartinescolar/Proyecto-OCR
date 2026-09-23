import { LightningElement, wire } from 'lwc';
import getFacturas from '@salesforce/apex/FacturasDespachoController.getFacturas';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const DFMT = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

function fmtDate(v) {
    if (!v) return '—';
    const p = String(v).slice(0, 10).split('-');
    if (p.length < 3) return '—';
    return DFMT.format(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}
function fmtEur(v) {
    return (v === null || v === undefined) ? '—' : EUR.format(v);
}

export default class IntranetFacturas extends LightningElement {
    appliedSearch = '';
    limitN = 100;
    facturas = [];
    total = 0;
    loading = true;
    error;

    @wire(getFacturas, { lim: '$limitN', search: '$appliedSearch' })
    wired({ data, error }) {
        if (data) {
            this.facturas = data.items || [];
            this.total = data.total || 0;
            this.loading = false;
            this.error = undefined;
        } else if (error) {
            this.error = (error.body && error.body.message) ? error.body.message : 'No se pudieron cargar las facturas.';
            this.loading = false;
        }
    }

    get rows() {
        return (this.facturas || []).map((f) => {
            const pend = f.pendiente;
            const hasPend = pend !== null && pend !== undefined && pend > 0.0001;
            return {
                id: f.id,
                numero: f.numero || '—',
                fecha: fmtDate(f.fecha),
                cliente: f.cliente || '—',
                importe: fmtEur(f.importe),
                estado: f.estado || '—',
                pendiente: fmtEur(pend),
                pendienteClass: hasPend ? 'num ix-pend' : 'num ix-ok',
                vencimiento: fmtDate(f.vencimiento)
            };
        });
    }

    get count() { return (this.facturas || []).length; }
    get showEmpty() { return !this.loading && this.count === 0; }
    get totalLabel() { return Number(this.total || 0).toLocaleString('es-ES'); }
    get countLabel() { return Number(this.count || 0).toLocaleString('es-ES'); }
    get pendingCount() {
        return (this.facturas || []).filter((f) => f.pendiente > 0.0001).length.toLocaleString('es-ES');
    }

    handleSubmit(event) {
        event.preventDefault();
        const el = this.template.querySelector('.ix-search input');
        const val = el ? el.value.trim() : '';
        if (val === this.appliedSearch) return;
        this.loading = true;
        this.appliedSearch = val;
    }
}