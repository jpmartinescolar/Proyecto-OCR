import LightningDatatable from 'lightning/datatable';
import urlOrTextTemplate from './urlOrText.html';

export default class DatatableConEnlace extends LightningDatatable {
    static customTypes = {
        urlOrText: {
            template: urlOrTextTemplate,
            standardCellLayout: true,
            typeAttributes: ['url', 'label', 'target']
        }
    };
}