import LightningDatatable from 'lightning/datatable';
import customImage from './lwcCustomDataTableImage.html';

export default class LwcCustomDataTableImage extends LightningDatatable {
    static customTypes = {
        customImage: {
            template: customImage, 
            typeAttributes: [
                'imageUrl', 
                'imageStyle'
            ]
        }
    }
}