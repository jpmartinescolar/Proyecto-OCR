/**
 * Estructura de datos para representar un PDF adjunto a una escritura,
 * con metadatos de su escritura padre. Top-level para que sea referenciable
 * como tipo de variable en Flow Builder y en Agent Script.
 */
public class EscriturasPDFInfo {

    @AuraEnabled
    @InvocableVariable(label='ContentDocument Id')
    public String contentDocumentId;

    @AuraEnabled
    @InvocableVariable(label='Nombre del archivo')
    public String nombreArchivo;

    @AuraEnabled
    @InvocableVariable(label='Escritura Id')
    public String escrituraId;

    @AuraEnabled
    @InvocableVariable(label='Título Escritura')
    public String escrituraTitulo;

    @AuraEnabled
    @InvocableVariable(label='Fecha Escritura')
    public String escrituraFecha;
}