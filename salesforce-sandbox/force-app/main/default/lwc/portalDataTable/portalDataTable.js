import { LightningElement, api } from 'lwc';
import getData from '@salesforce/apex/PortalDataController.getData';

// Tiempo de espera (ms) tras la última tecla antes de lanzar la búsqueda
const DEBOUNCE_DELAY = 350;

// Cuántas filas se añaden cada vez que se pulsa "Mostrar más"
const PAGE_SIZE = 5;

export default class PortalDataTable extends LightningElement {

    // DeveloperName del Portal_Data_Source__mdt a usar.
    // Se configura desde Experience Builder, sin tocar código (ver js-meta.xml)
    // Nota: no puede llamarse "dataSourceName" porque LWC prohíbe propiedades
    // públicas que empiecen por "data" (colisiona con los atributos data-* de HTML)
    @api sourceName;

    // Texto opcional bajo el título. Igual que el título, es una propiedad
    // de página (no depende del metadato), así que funciona aunque la
    // sección no esté configurada todavía.
    @api subtitle;

    columns = [];
    records = [];
    isLoading = false;
    errorMessage;

    searchTerm = '';
    debounceTimeout;

    // Cuántas filas se muestran cuando NO hay búsqueda activa. Se mantiene
    // igual aunque se busque y se borre la búsqueda después — solo se resetea
    // si el usuario cambia de sourceName (otra sección), ver connectedCallback.
    visibleCount = PAGE_SIZE;

    // Ordenación elegida por el usuario al pulsar una cabecera. Igual que
    // visibleCount, se mantiene aunque se busque y se borre la búsqueda —
    // se reaplica sobre cualquier resultado nuevo que llegue de Apex.
    sortField;
    sortDirection; // 'asc' | 'desc'

    connectedCallback() {
        // Carga inicial: trae todos los registros (searchTerm vacío = sin filtro)
        this.fetchData();
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;

        // Cancela la búsqueda pendiente si el usuario sigue escribiendo
        window.clearTimeout(this.debounceTimeout);

        // Reinicia el temporizador: solo se ejecuta si pasan 350ms sin nuevas teclas
        this.debounceTimeout = setTimeout(() => {
            this.fetchData();
        }, DEBOUNCE_DELAY);
    }

    fetchData() {
        this.isLoading = true;
        this.errorMessage = undefined;

        getData({ dataSourceName: this.sourceName, searchTerm: this.searchTerm })
            .then((result) => {
                this.columns = result.columns;
                this.records = result.records;
            })
            .catch((error) => {
                this.errorMessage = this.extractErrorMessage(error);
                this.records = [];
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    extractErrorMessage(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        return 'Ha ocurrido un error al cargar los datos.';
    }

    get hasRecords() {
        return this.records && this.records.length > 0;
    }

    // El título ya no depende de Apex ni del metadato: es directamente el
    // valor que el administrador escribe en la propiedad del componente al
    // colocarlo en la página. Así se ve siempre, esté o no configurado el
    // Portal_Data_Source__mdt correspondiente.
    get title() {
        return this.sourceName;
    }

    get hasTitle() {
        return !!this.title;
    }

    get hasSubtitle() {
        return !!this.subtitle;
    }

    // Texto completo, sin truncar — se usa en el label accesible y en el
    // tooltip nativo (title), donde sí cabe entero.
    get searchLabel() {
        const searchableLabels = this.columns
            .filter((col) => col.isSearchable)
            .map((col) => col.label);

        if (searchableLabels.length === 0) {
            return 'Buscar…';
        }
        if (searchableLabels.length === 1) {
            return 'Buscar por ' + searchableLabels[0] + '…';
        }
        const last = searchableLabels[searchableLabels.length - 1];
        const rest = searchableLabels.slice(0, -1).join(', ');
        return 'Buscar por ' + rest + ' o ' + last + '…';
    }

    // Versión truncada del mismo texto, para que quepa dentro de la caja
    // de búsqueda sin que esta crezca. El "…" se añade a mano en vez de
    // depender del navegador, que no siempre lo pinta de forma fiable
    // sobre el placeholder de un input.
    get searchPlaceholder() {
        const MAX_LENGTH = 45;
        const full = this.searchLabel;
        if (full.length <= MAX_LENGTH) {
            return full;
        }
        return full.slice(0, MAX_LENGTH - 1).trimEnd() + '…';
    }

    get hasHeader() {
        return this.hasTitle || this.hasSubtitle;
    }

    // Solo para la primera carga, cuando aún no hay ninguna tabla que mostrar.
    // En búsquedas posteriores, aunque isLoading sea true, ya hay hasRecords,
    // así que usamos un overlay sobre la tabla en vez de este bloque.
    get showInitialLoading() {
        return this.isLoading && !this.hasRecords;
    }

    get showEmptyState() {
        return !this.isLoading && !this.errorMessage && !this.hasRecords;
    }

    // Columnas para la cabecera, con el estado de ordenación añadido
    // (qué icono mostrar y el aria-sort para accesibilidad).
    get displayColumns() {
        return this.columns.map((col) => {
            const isSortedField = col.fieldName === this.sortField;
            return {
                ...col,
                isSortedField,
                sortIcon: this.sortDirection === 'asc' ? 'utility:arrowup' : 'utility:arrowdown',
                ariaSort: isSortedField ? (this.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
            };
        });
    }

    // Registros ordenados según la elección del usuario. Si no ha pulsado
    // ninguna cabecera todavía, se respeta el orden que ya trae Apex por
    // defecto (primera columna configurada, ascendente).
    get sortedRecords() {
        if (!this.sortField) {
            return this.records;
        }
        const field = this.sortField;
        const direction = this.sortDirection === 'desc' ? -1 : 1;

        return [...this.records].sort((a, b) => {
            const valueA = a[field];
            const valueB = b[field];

            if (valueA == null && valueB == null) {
                return 0;
            }
            if (valueA == null) {
                return -1 * direction;
            }
            if (valueB == null) {
                return 1 * direction;
            }
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                return (valueA - valueB) * direction;
            }
            // 'numeric: true' hace que fechas en texto (YYYY-MM-DD) y
            // números dentro de texto se comparen correctamente, no solo
            // carácter a carácter.
            return String(valueA).localeCompare(String(valueB), 'es', { numeric: true }) * direction;
        });
    }

    // Al pulsar una cabecera: si ya se ordenaba por ese campo, se invierte
    // la dirección; si es un campo nuevo, se empieza en ascendente.
    handleSortClick(event) {
        const field = event.currentTarget.dataset.field;
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }
    }

    // Transforma records (planos, por clave de campo) en filas con celdas
    // ya emparejadas a sus columnas, en el orden correcto — necesario porque
    // el HTML de LWC no permite acceso dinámico tipo record[col.fieldName]
    get tableRows() {
        return this.sortedRecords.map((record) => ({
            key: record.Id,
            cells: this.columns.map((col) => {
                const value = record[col.fieldName];
                const isBadge = col.type === 'badge';
                const isNameWithIcon = col.type === 'name_with_icon';
                const isIconButton = isNameWithIcon && col.isButton;
                const isIconStatic = isNameWithIcon && !col.isButton;
                return {
                    key: col.fieldName,
                    value,
                    isBadge,
                    isIconButton,
                    isIconStatic,
                    iconName: isNameWithIcon ? col.iconName : undefined,
                    isPlainText: !isBadge && !isNameWithIcon,
                    badgeStyle: isBadge ? this.getBadgeStyle(col, value) : undefined
                };
            })
        }));
    }

    // Mientras hay una búsqueda activa, se muestran todos los resultados
    // (sin paginar); la paginación solo aplica a la vista sin filtrar.
    get hasActiveSearch() {
        return !!this.searchTerm;
    }

    // Filas realmente visibles: todas si hay búsqueda activa, o solo las
    // primeras "visibleCount" si no la hay.
    get displayedRows() {
        return this.hasActiveSearch ? this.tableRows : this.tableRows.slice(0, this.visibleCount);
    }

    get showPagination() {
        return this.hasRecords && !this.hasActiveSearch;
    }

    get paginationLabel() {
        const shown = Math.min(this.visibleCount, this.records.length);
        return shown + '/' + this.records.length;
    }

    get canShowMore() {
        return this.visibleCount < this.records.length;
    }

    handleShowMore() {
        this.visibleCount += PAGE_SIZE;
    }

    // Placeholder: la acción real asociada al icono/nombre (ej. abrir
    // archivos adjuntos, o cualquier otra cosa que se decida) se conectará
    // más adelante. De momento, el clic no hace nada visible a propósito.
    handleIconClick(event) {
        event.stopPropagation();
        // TODO: implementar la acción real cuando esté definida.
        // const recordId = event.currentTarget.dataset.recordId;
    }

    // Busca el color configurado en Portal_Badge_Color__mdt para este valor
    // exacto. Si no hay ninguna coincidencia, cae en un gris neutro por
    // defecto — nunca falla por un valor sin configurar.
    getBadgeStyle(col, value) {
        const colorConfig = col.badgeColors && col.badgeColors[value];
        const backgroundColor = colorConfig ? colorConfig.backgroundColor : '#EEF3F8';
        const textColor = colorConfig ? colorConfig.textColor : '#6B7A8F';
        return `background-color:${backgroundColor}; color:${textColor};`;
    }
}