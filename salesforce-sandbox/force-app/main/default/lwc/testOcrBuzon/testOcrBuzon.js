import { LightningElement, wire } from 'lwc';
import getContexto from '@salesforce/apex/SubirFacturasController.getContexto';
import listarArchivosOcr from '@salesforce/apex/SubirFacturasController.listarArchivosOcr';

// Con más empresas que esto se usa el buscador en vez del desplegable (mismo criterio que Subir facturas)
const MAX_EMPRESAS_COMBO = 50;

export default class TestOcrBuzon extends LightningElement {
    contexto;
    errorCarga;

    empresaId = '';
    cargandoLista = false;
    errorLista = '';
    registros = [];
    seleccionado = null;

    @wire(getContexto)
    wiredContexto({ data, error }) {
        if (data) {
            this.contexto = data;
            this.errorCarga = null;
            if (data.empresas && data.empresas.length === 1) {
                this.empresaId = data.empresas[0].id;
                this.cargarLista();
            }
        } else if (error) {
            this.errorCarga = this.reduceError(error);
        }
    }

    // ===== Empresa: mismo patrón que testSubirFacturasA =====
    get cargando() { return !this.contexto && !this.errorCarga; }
    get empresas() { return (this.contexto && this.contexto.empresas) || []; }
    get modoLibre() { return this.contexto && this.contexto.modoLibre; }
    get sinEmpresas() { return this.contexto && !this.modoLibre && this.empresas.length === 0; }
    get empresaUnica() { return !this.modoLibre && this.empresas.length === 1 ? this.empresas[0] : null; }
    get usarCombo() { return !this.modoLibre && this.empresas.length > 1 && this.empresas.length <= MAX_EMPRESAS_COMBO; }
    get usarPicker() { return this.modoLibre || this.empresas.length > MAX_EMPRESAS_COMBO; }
    get empresaOpciones() {
        return this.empresas.map((e) => ({ label: e.cif ? `${e.nombre} (${e.cif})` : e.nombre, value: e.id }));
    }
    get pickerFiltro() {
        if (this.modoLibre) return undefined;
        return { criteria: [{ fieldPath: 'Id', operator: 'in', value: this.empresas.map((e) => e.id) }] };
    }

    handleEmpresaCombo(e) { this.empresaId = e.detail.value; this.cargarLista(); }
    handleEmpresaPicker(e) { this.empresaId = e.detail.recordId || ''; this.cargarLista(); }

    // ===== Lista de archivos =====
    cargarLista() {
        if (!this.empresaId) return;
        this.cargandoLista = true;
        this.errorLista = '';
        this.seleccionado = null;
        this.registros = [];
        listarArchivosOcr({ empresaId: this.empresaId })
            .then((data) => {
                this.registros = (data || []).map((r) => ({
                    ...r,
                    fechaTxt: this.formatearFecha(r.createdAt),
                    tamanoTxt: this.formatearBytes(r.size),
                    cls: 'ocr-fila'
                }));
                if (this.registros.length) this.seleccionar(this.registros[0]);
            })
            .catch((err) => { this.errorLista = this.reduceError(err); })
            .finally(() => { this.cargandoLista = false; });
    }

    get hayRegistros() { return this.registros.length > 0; }
    get sinRegistros() { return !this.cargandoLista && !this.errorLista && !!this.empresaId && this.registros.length === 0; }

    handleSeleccionar(e) {
        const id = e.currentTarget.dataset.id;
        const r = this.registros.find((x) => x.sfRecordId === id);
        if (r) this.seleccionar(r);
    }

    seleccionar(r) {
        this.seleccionado = r;
        this.registros = this.registros.map((x) => ({
            ...x,
            cls: 'ocr-fila' + (x.sfRecordId === r.sfRecordId ? ' ocr-fila-activa' : '')
        }));
    }

    // ===== Vista previa + metadata del seleccionado =====
    get esPdf() { return !!this.seleccionado && this.seleccionado.mime === 'application/pdf'; }
    get esImagen() { return !!this.seleccionado && !!this.seleccionado.mime && this.seleccionado.mime.startsWith('image/'); }
    get sinPreview() { return !!this.seleccionado && !this.esPdf && !this.esImagen; }

    get metadatos() {
        if (!this.seleccionado) return [];
        const r = this.seleccionado;
        return [
            { label: 'Registro Salesforce', value: r.sfRecordId },
            { label: 'Cuenta (Empresa)', value: r.sfAccountId },
            { label: 'CIF', value: r.cif },
            { label: 'Archivo', value: r.nombreArchivo },
            { label: 'Tipo (MIME)', value: r.mime },
            { label: 'Tamaño', value: this.formatearBytes(r.size) },
            { label: 'Ruta en Cloud Storage', value: r.gcsPath },
            { label: 'Id de objeto en Google', value: r.gcsObjectId },
            { label: 'CRC32C', value: r.crc32c },
            { label: 'Subido', value: this.formatearFecha(r.createdAt) },
            { label: 'Última actualización', value: this.formatearFecha(r.updatedAt) }
        ];
    }

    formatearFecha(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString();
    }

    formatearBytes(n) {
        if (!n) return '0 B';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let v = n;
        while (v >= 1024 && i < u.length - 1) {
            v /= 1024;
            i++;
        }
        return v.toFixed(v < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
    }

    reduceError(err) {
        if (!err) return 'Error desconocido';
        if (typeof err === 'string') return err;
        if (err.body) {
            if (Array.isArray(err.body)) return err.body.map((e) => e.message).join(', ');
            if (err.body.message) return err.body.message;
        }
        return err.message || JSON.stringify(err);
    }
}
