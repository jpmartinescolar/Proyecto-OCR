import LightningDatatable from 'lightning/datatable';
import customPicklistTemplate from './customPicklist.html';
import editableCustomPicklistTemplate from './editableCustomPicklist.html';

export default class LwcCustomDataTableTypes extends LightningDatatable {
    static customTypes = {
        customPicklist: {
            template: customPicklistTemplate, 
            editTemplate: editableCustomPicklistTemplate, 
            standardCellLayout: true, 
            typeAttributes: [
                'label', 
                'value', 
                'placeholder', 
                'options'
            ]
        }
    }
}