import { LightningElement, track, api } from 'lwc';
import getOrders from "@salesforce/apex/CI_CreateInvoicesFromOrdersLWCHelper.getOrdersData";

const columns = [
    {
        label: 'Pedido',
        fieldName: 'OrderNumber',
        type: 'text',
        sortable: true
    },
    {
        label: 'Fecha inicio',
        fieldName: 'EffectiveDate',
        type: 'date-local',
        typeAttributes: { year: 'numeric', month: '2-digit', day: '2-digit' },
        sortable: true
    },
    {
        label: 'Origen',
        fieldName: 'Origen_del_pedido__c',
        type: 'text',
        sortable: true
    },
    {
        label: 'Estado',
        fieldName: 'Status',
        type: 'text',
        sortable: true
    },
    {
        label: 'Estado de facturación',
        fieldName: 'Estado_Facturaci_n__c',
        type: 'text',
        sortable: true
    },
    {
        label: 'Importe',
        fieldName: 'TotalAmount',
        type: 'currency',
        cellAttributes: { alignment: 'left' },
        sortable: true
    },
    {
        label: 'Cliente',
        fieldName: 'CI_NombreDeCliente__c',
        type: 'text',
        sortable: true
    },
    {
        label: 'Empresa titular',
        fieldName: 'Empresa_Titular__c',
        type: 'text',
        sortable: true
    },
    {
        label: 'Grupo empresarial',
        fieldName: 'Grupo_empresarial__c',
        type: 'text',
        sortable: true
    }
];

export default class LwcCreateInvoicesFromOrders extends LightningElement {
    columns                 = columns;

    @track gridData;
    @api fechaEmision;
    _empresaSelected;
    
    wiredOrdersResult;

    @api
    get empresaSelected() {
        return this._empresaSelected;
    }
    set empresaSelected(value) {
        if (this._empresaSelected !== value) {
            this._empresaSelected = value;
            this.clearData(); // Ensure stale data is removed
            this.refreshData();  // Fetch new data when picklist changes
        }
    }

    @api ordersCheched;
    currentlySelectedOrders;

    _refreshToken;

    @api
    get refreshToken() {
        return this._refreshToken;
    }
    set refreshToken(value) {
        if (this._refreshToken !== value) {
            this._refreshToken = value;
            this.clearData(); // Ensure stale data is removed
            this.refreshData();  // Fetch new data when Flow runs again
        }
    }

    defaultSortDirection    = 'asc';
    sortDirection           = 'asc';
    sortedBy;

    /* 
        Obtiene pedidos
    */
    // @wire(getOrders, { empresaName: "$empresaSelected" })
    // mostrarTablaPedidos({ error, data }) {
    //     if (data) {
    //         this.gridData = data;
    //     }
    //     else if (error) {
    //         console.log('error-mostrarTablaResumen:: ' + error);
    //     }
    // }

    

    connectedCallback() {
        this.refreshData();
    }

    clearData() {
        this.gridData = [];  // Clear existing data before fetching fresh records
    }

    @api refreshData() {
        getOrders({ empresaName: this.empresaSelected })
            .then((result) => {
                this.gridData = result;
            })
            .catch((error) => {
                console.error('Error retrieving Orders:', error);
            });
    }

    // handleRowSelection(event){
    //     const selectedRows = event.detail.selectedRows;
        
    //     for (const base of selectedRows) {
    //         if(this.ordersCheched == null){
    //             this.ordersCheched = base.Id;
    //         }
    //         else{
    //             this.ordersCheched = this.ordersCheched + ',' + base.Id;
    //         }
    //     }
    // }

    handleRowSelection(event){
        switch (event.detail.config.action) {
            case 'selectAllRows':
                let allSelectedRows = event.detail.selectedRows;

                for (let selectedRow of allSelectedRows) {
                    if (this.ordersCheched == null) {
                        this.currentlySelectedOrders = [selectedRow.Id];
                        this.ordersCheched = selectedRow.Id;
                    } else {
                        this.currentlySelectedOrders.push(selectedRow.Id);
                        this.ordersCheched = this.ordersCheched + ',' + selectedRow.Id;
                    }
                }

                break;
            case 'deselectAllRows':
                this.ordersCheched = null;
                this.currentlySelectedOrders = [];

                break;
            case 'rowSelect':
                let selectedRows = event.detail.selectedRows;

                for (let selectedRow of selectedRows) {
                    if (this.ordersCheched == null) {
                        this.currentlySelectedOrders = [selectedRow.Id];
                        this.ordersCheched = selectedRow.Id;
                    } else {
                        if (!this.currentlySelectedOrders.includes(selectedRow.Id)) {
                            this.currentlySelectedOrders.push(selectedRow.Id);
                            this.ordersCheched = this.ordersCheched + ',' + selectedRow.Id;
                        }
                    }
                }

                break;
            case 'rowDeselect':
                let remainingRows;

                for (let remainingRow of event.detail.selectedRows) {
                    if (remainingRows == null) {
                        remainingRows = remainingRow.Id;
                    } else {
                        remainingRows = remainingRows + ',' + remainingRow.Id;
                    }
                }

                if (remainingRows != null) {
                    this.ordersCheched = remainingRows;
                    this.currentlySelectedOrders = remainingRows.split(',');
                } else {
                    this.ordersCheched = null;
                    this.currentlySelectedOrders = [];
                }

                break;
            default:
                break;
        }
    }

    //Ordenamiento de columnas
    sortBy(field, reverse, primer) {
        const key = primer
            ? function (x) {
                  return primer(x[field]);
              }
            : function (x) {
                  return x[field];
              };

        return function (a, b) {
            a = key(a);
            b = key(b);
            return reverse * ((a > b) - (b > a));
        };
    }
    //Ordenamiento de columnas
    onHandleSort(event) {
        const { fieldName: sortedBy, sortDirection } = event.detail;
        const cloneData = [...this.gridData];

        cloneData.sort(this.sortBy(sortedBy, sortDirection === 'asc' ? 1 : -1));
        this.gridData       = cloneData;
        this.sortDirection  = sortDirection;
        this.sortedBy       = sortedBy;
    }

    // navigateToInvoicesListView() {
    //     this[NavigationMixin.Navigate]({
    //         type: 'standard__objectPage',
    //         attributes: {
    //             objectApiName: 'Facturas__c',
    //             actionName: 'list'
    //         }
    //     });
    // }

    // showNotification() {
    //     const evt = new ShowToastEvent({
    //         title: 'Se han generado ' + this.totalFacturaCreadas + ' facturas.',
    //         message: 'Proceso terminado satisfactoriamente.',
    //         variant: 'success'
    //     });

    //     this.dispatchEvent(evt);
    // }
}