import { LightningElement, api, track } from 'lwc';
import diferenciaEfectos from '@salesforce/apex/SumasSaldosController.diferenciaEfectos';

/**
 * Chip + mensaje reutilizable: "Saldo cuentas & Saldo efectos".
 * Cuenta las cuentas contables con diferencia entre saldo actual y efectos,
 * separando Proveedores/Acreedores (400/410) de Clientes (430).
 * Uso: <c-aviso-saldo-efectos empresas={listaEmpresas}></c-aviso-saldo-efectos>
 */
export default class AvisoSaldoEfectos extends LightningElement {

    @track total = 0;
    @track proveedores = 0;
    @track clientes = 0;
    @track loaded = false;
    @track show = false;

    _empresas = [];
    @api
    get empresas() { return this._empresas; }
    set empresas(val) {
        this._empresas = val || [];
        this.cargar();
    }

    cargar() {
        this.show = false;
        if (!this._empresas || !this._empresas.length) {
            this.total = 0; this.proveedores = 0; this.clientes = 0; this.loaded = false;
            return;
        }
        diferenciaEfectos({ empresasTitulares: this._empresas })
            .then(res => {
                this.total = res ? res.total : 0;
                this.proveedores = res ? res.proveedores : 0;
                this.clientes = res ? res.clientes : 0;
                this.loaded = true;
            })
            .catch(() => { this.total = 0; this.proveedores = 0; this.clientes = 0; this.loaded = true; });
    }

    get hayDatos() { return this.loaded; }
    get bad() { return this.total > 0; }
    get chipClass() { return this.bad ? 'ase-chip ase-chip-bad' : 'ase-chip ase-chip-ok'; }
    get chipTxt() { return this.bad ? this.total : 'OK'; }

    toggle() { if (this.bad) this.show = !this.show; }
    cerrar() { this.show = false; }
}