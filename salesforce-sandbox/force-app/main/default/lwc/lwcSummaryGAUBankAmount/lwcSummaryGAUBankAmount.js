import { LightningElement, api, track, wire } from 'lwc';
import getRelatedAccountingEntriesPaged from '@salesforce/apex/CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged';
import getEmpresaTitularPicklistValues from '@salesforce/apex/CI_SummaryGAUBankAmountController.getEmpresaTitularPicklistValues';
import getAreaPicklistValues from '@salesforce/apex/CI_SummaryGAUBankAmountController.getAreaPicklistValues';
import getCheckPicklistValues from '@salesforce/apex/CI_SummaryGAUBankAmountController.getCheckPicklistValues';
import getSimulacionPicklistValues from '@salesforce/apex/CI_SummaryGAUBankAmountController.getSimulacionPicklistValues';
import updateAccountingEntries from '@salesforce/apex/CI_SummaryGAUBankAmountController.updateAccountingEntries';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const PAGE_SIZE = 500;

// Traducción de fieldName de la tabla (URLs, etc.) a claves lógicas para Apex (whitelist)
const SORT_KEY_MAP = {
    FechaAsiento: 'FechaAsiento',
    recordLinkApunte: 'NombreApunte',
    recordLinkAsiento: 'NombreAsiento',
    recordLinkFacturaEmitida: 'FacturaEmitida',
    recordLinkFacturaRecibida: 'FacturaRecibida',
    recordLinkNomina: 'Nominas',
    recordLinkDirectorFacturacion: 'DirectorFacturacion',

    ImporteDebe: 'ImporteDebe',
    ImporteHaber: 'ImporteHaber',
    Saldo: 'Saldo',
    AmountSummary: 'Saldo', // si alguien ordena por "Saldo (€)" lo tratamos como Saldo real

    EmpresaTitular: 'EmpresaTitular',
    Area: 'Area',
    Check: 'Check',
    Simulacion: 'Simulacion'
};

// Columnas
const COLUMNS = [
    { label: 'Fecha de asiento', fieldName: 'FechaAsiento', type: 'date', sortable: true,
        typeAttributes: { day: '2-digit', month: '2-digit', year: 'numeric' } },

    { label: 'Nº de asiento contable', fieldName: 'recordLinkAsiento', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'NombreAsiento' }, target: '_blank' } },

    { label: 'Nº de apunte contable', fieldName: 'recordLinkApunte', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'NombreApunte' }, target: '_blank' } },

    // ❌ Única columna sin ordenación
    { label: 'Descripción', fieldName: 'Descripcion', type: 'text', editable: true, sortable: false, initialWidth: 320 },

    { label: 'Debe (€)', fieldName: 'ImporteDebe', type: 'currency', sortable: true,
        cellAttributes: { class: { fieldName: 'importeDebeClass' } } },

    { label: 'Haber (€)', fieldName: 'ImporteHaber', type: 'currency', sortable: true,
        cellAttributes: { class: { fieldName: 'importeHaberClass' } } },

    { label: 'Saldo (€)', fieldName: 'AmountSummary', type: 'currency', sortable: true,
        cellAttributes: { class: { fieldName: 'amountSummaryClass' } } },

    { label: 'Empresa titular', fieldName: 'EmpresaTitular', type: 'customPicklist', editable: true, sortable: true,
        typeAttributes: {
            options: { fieldName: 'empresaTitularOptions' },
            value: 'EmpresaTitular',
            placeholder: 'Seleccionar'
        }
    },

    { label: 'Factura emitida', fieldName: 'recordLinkFacturaEmitida', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'FacturaEmitida' }, target: '_blank' } },

    { label: 'Factura recibida', fieldName: 'recordLinkFacturaRecibida', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'FacturaRecibida' }, target: '_blank' } },

    { label: 'Nómina', fieldName: 'recordLinkNomina', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'Nominas' }, target: '_blank' } },

    { label: 'Área', fieldName: 'Area', type: 'customPicklist', editable: true, sortable: true,
        typeAttributes: {
            options: { fieldName: 'areaOptions' },
            value: 'Area',
            placeholder: 'Seleccionar'
        }
    },

    { label: 'Director asignado facturación', fieldName: 'recordLinkDirectorFacturacion', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'DirectorFacturacion' }, target: '_blank' } },

    { label: 'Check', fieldName: 'Check', type: 'customPicklist', editable: true, sortable: true,
        typeAttributes: {
            options: { fieldName: 'checkOptions' },
            value: 'Check',
            placeholder: 'Seleccionar'
        }
    },

    { label: 'Simulación', fieldName: 'Simulacion', type: 'customPicklist', editable: true, sortable: true,
        typeAttributes: {
            options: { fieldName: 'simulacionOptions' },
            value: 'Simulacion',
            placeholder: 'Seleccionar'
        }
    }
];

export default class LwcSummaryGAUBankAmount extends LightningElement {
    @api recordId;

    @track isLoading = false;
    @track isFilterModalOpen = false;

    @track data = [];
    @track filteredData = [];

    @track empresaTitularOptions = [];
    @track areaOptions = [];
    @track checkOptions = [];
    @track simulacionOptions = [];

    @track draftValues = [];

    @track empresaTitularFilter = '';
    @track startDate;
    @track endDate;

    columns = COLUMNS;

    // Default sort (mismo que antes)
    sortedDirection = 'desc';
    sortedBy = 'FechaAsiento';

    // Apex sort keys
    sortByServer = 'FechaAsiento';
    sortDirectionServer = 'desc';

    error;

    // Paginación
    pageSize = PAGE_SIZE;
    nextCursor = null;
    hasMore = true;
    isLoadingMore = false;

    // Running total (solo tiene sentido en orden “natural” por fecha)
    totalSaldo = 0;
    runningTotalPointer = 0;

    // búsqueda server-side (debounce)
    searchTerm = '';
    searchTimeout;
    lastErrorMessage;

    get isSaveDisabled() {
        return this.draftValues.length === 0;
    }

    // -------------------------
    // Picklists
    // -------------------------
    @wire(getEmpresaTitularPicklistValues)
    wiredEmpresaTitularPicklist({ error, data }) {
        if (data) this.empresaTitularOptions = data.map(val => ({ label: val, value: val }));
        else if (error) console.error('Error loading Empresa Titular picklist values:', error);
    }

    @wire(getAreaPicklistValues)
    wiredAreaPicklist({ error, data }) {
        if (data) this.areaOptions = data.map(val => ({ label: val, value: val }));
        else if (error) console.error('Error loading Área picklist values:', error);
    }

    @wire(getCheckPicklistValues)
    wiredCheckPicklist({ error, data }) {
        if (data) this.checkOptions = data.map(val => ({ label: val, value: val }));
        else if (error) console.error('Error loading Check picklist values:', error);
    }

    @wire(getSimulacionPicklistValues)
    wiredSimulacionPicklist({ error, data }) {
        if (data) this.simulacionOptions = data.map(val => ({ label: val, value: val }));
        else if (error) console.error('Error loading Simulación picklist values:', error);
    }

    // -------------------------
    // Helpers
    // -------------------------
    showErrorToast(e, title) {
        const msg =
            e?.body?.message ||
            e?.body?.pageErrors?.[0]?.message ||
            e?.message ||
            'Error desconocido';

        // evita “spam” del mismo error
        if (msg !== this.lastErrorMessage) {
            this.lastErrorMessage = msg;
            this.dispatchEvent(new ShowToastEvent({ title, message: msg, variant: 'error' }));
        }
    }

    // -------------------------
    // Lifecycle
    // -------------------------
    connectedCallback() {
        const today = new Date();
        const currentYearStart = new Date(today.getFullYear(), 0, 1);

        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        this.startDate = formatDate(currentYearStart);
        this.endDate = formatDate(today);

        this.reloadData();
    }

    // -------------------------
    // Data loading (paged)
    // -------------------------
    async reloadData() {
        this.isLoading = true;
        this.error = undefined;
        this.lastErrorMessage = null;

        this.data = [];
        this.filteredData = [];

        this.nextCursor = null;
        this.hasMore = true;
        this.isLoadingMore = false;

        this.totalSaldo = 0;
        this.runningTotalPointer = 0;

        try {
            await this.loadNextPage();
        } catch (e) {
            this.error = e;
            console.error('LOAD ERROR', JSON.stringify(e), e);
            this.showErrorToast(e, 'Error cargando registros');
        } finally {
            this.isLoading = false;
        }
    }

    async loadNextPage() {
        if (!this.recordId || !this.hasMore) return;

        const result = await getRelatedAccountingEntriesPaged({
            gauRecordId: this.recordId,
            pageSize: this.pageSize,
            cursor: this.nextCursor,
            startDate: this.startDate || null,
            endDate: this.endDate || null,
            empresaTitular: this.empresaTitularFilter || null,
            searchTerm: this.searchTerm || null,
            sortBy: this.sortByServer,
            sortDirection: this.sortDirectionServer
        });

        if (!result) return;

        // totalSaldo solo en la primera página
        if (this.data.length === 0) {
            this.totalSaldo = result.totalSaldo || 0;
            this.runningTotalPointer = this.totalSaldo;
        }

        const newRows = this.mapRows(result.rows || []);
        this.data = [...this.data, ...newRows];
        this.filteredData = [...this.data];

        this.nextCursor = result.nextCursor;
        this.hasMore = !!result.nextCursor && (result.rows || []).length === this.pageSize;

        this.error = undefined;
    }

    mapRows(rows) {
        const toRecordUrl = (id) => (id ? `/lightning/r/${id}/view` : '');

        // Running total solo “fiable” cuando ordenas por FechaAsiento DESC (modo natural)
        const canComputeRunning =
            this.sortByServer === 'FechaAsiento' && (this.sortDirectionServer || 'desc').toLowerCase() === 'desc';

        return rows.map((record) => {
            let amountSummary = null;

            if (canComputeRunning) {
                amountSummary = this.runningTotalPointer;
                const saldo = record.Saldo || 0;
                this.runningTotalPointer = this.runningTotalPointer - saldo;
            }

            return {
                ...record,

                // Links síncronos
                recordLinkApunte: toRecordUrl(record.Id),
                recordLinkAsiento: toRecordUrl(record.AsientoId),
                recordLinkFacturaEmitida: toRecordUrl(record.FacturaEmitidaId),
                recordLinkFacturaRecibida: toRecordUrl(record.FacturaRecibidaId),
                recordLinkDirectorFacturacion: toRecordUrl(record.DirectorFacturacionId),
                recordLinkNomina: toRecordUrl(record.NominasId),

                // Running total
                AmountSummary: amountSummary,
                amountSummaryClass:
                    amountSummary > 0 ? 'slds-text-color_success'
                    : amountSummary < 0 ? 'slds-text-color_error'
                    : '',

                // Clases
                importeDebeClass:
                    (record.ImporteDebe || 0) > 0 ? 'slds-text-color_success'
                    : (record.ImporteDebe || 0) < 0 ? 'slds-text-color_error'
                    : '',
                importeHaberClass:
                    (record.ImporteHaber || 0) > 0 ? 'slds-text-color_success'
                    : (record.ImporteHaber || 0) < 0 ? 'slds-text-color_error'
                    : '',

                // Picklists por fila (compatibilidad con tu custom cell type)
                empresaTitularOptions: this.empresaTitularOptions,
                areaOptions: this.areaOptions,
                checkOptions: this.checkOptions,
                simulacionOptions: this.simulacionOptions
            };
        });
    }

    async handleLoadMore(event) {
        if (!this.hasMore || this.isLoadingMore) return;

        this.isLoadingMore = true;
        const datatable = event.target;
        datatable.isLoading = true;

        try {
            await this.loadNextPage();
        } catch (e) {
            this.error = e;
            console.error('LOADMORE ERROR', JSON.stringify(e), e);
            this.showErrorToast(e, 'Error cargando más');
        } finally {
            datatable.isLoading = false;
            this.isLoadingMore = false;
        }
    }

    // -------------------------
    // Search (server-side)
    // -------------------------
    handleSearch(event) {
        const term = (event.target.value || '').trim();

        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.searchTerm = term;
            this.reloadData();
        }, 350);
    }

    // -------------------------
    // Filters (server-side)
    // -------------------------
    handleStartDateChange(event) {
        this.startDate = event.target.value;
        this.reloadData();
    }

    handleEndDateChange(event) {
        this.endDate = event.target.value;
        this.reloadData();
    }

    handleEmpresaTitularChange(event) {
        this.empresaTitularFilter = event.detail.value;
        this.reloadData();
    }

    clearFilters() {
        this.startDate = null;
        this.endDate = null;
        this.empresaTitularFilter = null;
        this.searchTerm = '';
        this.reloadData();
    }

    openFilterModal() {
        this.isFilterModalOpen = true;
    }

    closeFilterModal() {
        this.isFilterModalOpen = false;
    }

    // -------------------------
    // Sort (SERVER-SIDE)
    // -------------------------
    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;

        // datatable guarda el estado visual
        this.sortedBy = fieldName;
        this.sortedDirection = sortDirection;

        // traducimos fieldName a clave lógica para Apex (whitelist)
        const serverKey = SORT_KEY_MAP[fieldName] || 'FechaAsiento';
        this.sortByServer = serverKey;
        this.sortDirectionServer = sortDirection || 'desc';

        // recargamos desde 0 con ese ORDER BY real
        this.reloadData();
    }

    // -------------------------
    // Refresh
    // -------------------------
    handleRefresh() {
        this.reloadData();
    }

    // -------------------------
    // Drafts + Save
    // -------------------------
    handleDraftChange(event) {
        const newDraft = event.detail.draftValues[0];
        const existingIndex = this.draftValues.findIndex(d => d.Id === newDraft.Id);

        if (existingIndex !== -1) {
            this.draftValues[existingIndex] = { ...this.draftValues[existingIndex], ...newDraft };
        } else {
            this.draftValues = [...this.draftValues, newDraft];
        }
    }

    handleSave() {
        const updatedFields = (this.draftValues || []).map(draft => ({
            Id: draft.Id,
            Descripci_n__c: draft.Descripcion,
            Empresa_titular__c: draft.EmpresaTitular,
            rea__c: draft.Area,
            Check__c: draft.Check,
            Simulaci_n__c: draft.Simulacion
        }));

        if (updatedFields.length === 0) return;

        this.isLoading = true;

        updateAccountingEntries({ updatedRecords: updatedFields })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Actualizado correctamente',
                    message: 'Los registros se han actualizado con éxito.',
                    variant: 'success'
                }));
                this.draftValues = [];
                return this.reloadData();
            })
            .catch(error => {
                console.error('Error saving data', error);
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error al actualizar',
                    message: error?.body?.message || 'Hubo un problema al guardar los cambios.',
                    variant: 'error'
                }));
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleCancelEdits() {
        this.draftValues = [];
    }
}