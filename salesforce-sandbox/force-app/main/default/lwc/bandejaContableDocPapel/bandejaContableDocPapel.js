import { LightningElement, api } from 'lwc';

/**
 * Vista de ejemplo del documento (cuando no hay archivo que mostrar): la factura dibujada con los datos
 * extraídos, con las zonas que se resaltan al pasar por los campos. Se usa en el visor del documento y en
 * el visor ampliado. papel = { x, hl, fijo, ivaPreview, conCliente, clienteNombre, clienteCif }
 */
export default class BandejaContableDocPapel extends LightningElement {
    @api papel;
}
