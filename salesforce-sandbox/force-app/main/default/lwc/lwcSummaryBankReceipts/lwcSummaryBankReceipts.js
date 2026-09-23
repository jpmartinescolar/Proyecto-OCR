import { LightningElement, api, wire, track } from 'lwc';
import getRelatedExtractosPaged from '@salesforce/apex/CI_SummaryBankReceiptsController.getRelatedExtractosPaged';
import getEstadoPicklistValues from '@salesforce/apex/CI_SummaryBankReceiptsController.getEstadoPicklistValues';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const PAGE_SIZE = 500;

// Traducción de fieldName de la tabla a claves lógicas para Apex (whitelist)
const SORT_KEY_MAP = {
    recordLink:      'Name',
    FechaMovimiento: 'FechaMovimiento',
    Concepto:        'Concepto',
    DatosExtra:      'DatosExtra',
    Importe:         'Importe',
    AmountSummary:   'AmountSummary',
    Estado:          'Estado'
};

const COLUMNS = [
    { label: 'Name', fieldName: 'recordLink', type: 'url', sortable: true,
        typeAttributes: { label: { fieldName: 'Name' }, target: '_blank' } },
    { label: 'Fecha de movimiento', fieldName: 'FechaMovimiento', type: 'date', sortable: true,
        typeAttributes: { day: '2-digit', month: '2-digit', year: 'numeric' } },
    { label: 'Estado', fieldName: 'situacionImage', type: 'customImage',
        typeAttributes: {
            imageUrl: { fieldName: 'situacionImage' },
            imageStyle: { fieldName: 'situacionImageStyle' }
        }
    },
    { label: 'Concepto', fieldName: 'Concepto', type: 'text', sortable: true },
    { label: 'Más datos', fieldName: 'DatosExtra', type: 'text', sortable: true },
    { label: 'Importe banco (€)', fieldName: 'Importe', type: 'currency', sortable: true,
        cellAttributes: { class: { fieldName: 'importeBancoClass' } }
    },
    { label: 'Saldo bancario (€)', fieldName: 'AmountSummary', type: 'currency', sortable: true,
        cellAttributes: { class: { fieldName: 'amountSummaryClass' } }
    }
];

export default class LwcSummaryBankReceipts extends LightningElement {
    @api recordId;

    @track isLoading = false;
    @track isFilterModalOpen = false;
    @track data = [];
    @track filteredData = [];
    @track estadoOptions = [];
    @track estadoFilter = '';
    @track startDate;
    @track endDate;

    columns = COLUMNS;

    sortedDirection = 'desc';
    sortedBy = 'FechaMovimiento';
    sortByServer = 'FechaMovimiento';
    sortDirectionServer = 'desc';

    error;

    // Paginación
    pageSize = PAGE_SIZE;
    nextCursor = null;
    hasMore = true;
    isLoadingMore = false;

    // Running total
    totalImporte = 0;
    runningTotalPointer = 0;

    // Búsqueda server-side (debounce)
    searchTerm = '';
    searchTimeout;
    lastErrorMessage;

    // -------------------------
    // Picklist Estado
    // -------------------------
    @wire(getEstadoPicklistValues)
    wiredEstadoPicklist({ error, data }) {
        if (data) {
            this.estadoOptions = data.map(val => ({ label: val, value: val }));
        } else if (error) {
            console.error('Error loading Estado picklist values:', error);
        }
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
        this.totalImporte = 0;
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

        const result = await getRelatedExtractosPaged({
            cuentaContableId: this.recordId,
            pageSize: this.pageSize,
            cursor: this.nextCursor,
            startDate: this.startDate || null,
            endDate: this.endDate || null,
            estado: this.estadoFilter || null,
            searchTerm: this.searchTerm || null,
            sortBy: this.sortByServer,
            sortDirection: this.sortDirectionServer
        });

        if (!result) return;

        // totalImporte solo en la primera página
        if (this.data.length === 0) {
            this.totalImporte = result.totalImporte || 0;
            this.runningTotalPointer = this.totalImporte;
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

        // Running total solo fiable cuando ordenas por FechaMovimiento DESC (modo natural)
        const canComputeRunning =
            this.sortByServer === 'FechaMovimiento' && (this.sortDirectionServer || 'desc').toLowerCase() === 'desc';

        return rows.map(record => {
            let amountSummary = null;

            if (canComputeRunning) {
                amountSummary = this.runningTotalPointer;
                const importe = record.Importe || 0;
                this.runningTotalPointer = this.runningTotalPointer - importe;
            }

            let match = record.Situacion?.match(/src=["']([^"']+)["']/);
            let imageUrl = match ? match[1].replace(/&amp;/g, '&') : null;
            let imageStyle = 'height:20px; width:95px;';

            return {
                ...record,
                recordLink: toRecordUrl(record.Id),
                importeBancoClass: record.Importe > 0 ? 'slds-text-color_success' : record.Importe < 0 ? 'slds-text-color_error' : '',
                AmountSummary: amountSummary,
                amountSummaryClass: amountSummary > 0 ? 'slds-text-color_success' : amountSummary < 0 ? 'slds-text-color_error' : '',
                situacionImage: imageUrl,
                situacionImageStyle: imageStyle
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

    handleEstadoChange(event) {
        this.estadoFilter = event.detail.value;
        this.reloadData();
    }

    clearFilters() {
        this.startDate = null;
        this.endDate = null;
        this.estadoFilter = null;
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

        this.sortedBy = fieldName;
        this.sortedDirection = sortDirection;

        const serverKey = SORT_KEY_MAP[fieldName] || 'FechaMovimiento';
        this.sortByServer = serverKey;
        this.sortDirectionServer = sortDirection || 'desc';

        this.reloadData();
    }

    // -------------------------
    // Refresh
    // -------------------------
    handleRefresh() {
        this.reloadData();
    }
}