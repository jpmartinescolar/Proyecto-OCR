/**
 * Devuelve una lista plana de los PDFs adjuntos a las escrituras de una cuenta,
 * con metadatos de la escritura para contextualizar cada archivo.
 * Pensada para que un Flow itere y, por cada archivo, llame a un Prompt
 * Template que resume su contenido.
 */
public with sharing class ListEscriturasPDFs {

    private static final Integer MAX_ESCRITURAS = 25;
    private static final Integer MAX_FILES_RETURNED = 50;

    public class Request {
        @InvocableVariable(required=true label='Account Id' description='Id de la cuenta')
        public Id accountId;
    }

    public class Response {
        @InvocableVariable(label='Account Name')
        public String accountName;

        @InvocableVariable(label='Total escrituras')
        public Integer totalEscrituras;

        @InvocableVariable(label='Total archivos PDF')
        public Integer totalArchivosPDF;

        @InvocableVariable(label='Archivos')
        public List<EscriturasPDFInfo> archivos;
    }

    @InvocableMethod(
        label='Listar PDFs de Escrituras de Cuenta'
        description='Devuelve una lista plana de los PDFs adjuntos a las escrituras de una cuenta, con título y fecha de cada escritura para usar como contexto.'
        category='Escrituras Agent'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request r : requests) {
            out.add(processAccount(r.accountId));
        }
        return out;
    }

    private static Response processAccount(Id accountId) {
        Response resp = new Response();
        resp.archivos = new List<EscriturasPDFInfo>();
        resp.totalEscrituras = 0;
        resp.totalArchivosPDF = 0;
        resp.accountName = '';

        if (accountId == null) return resp;

        List<Account> accs = [SELECT Id, Name FROM Account WHERE Id = :accountId LIMIT 1];
        if (accs.isEmpty()) return resp;
        resp.accountName = accs[0].Name;

        List<Escrituras__c> escrituras = [
            SELECT Id, Name, T_tulo_Escritura__c, Fecha_escritura__c
            FROM Escrituras__c
            WHERE Empresa__c = :accountId
            WITH SECURITY_ENFORCED
            ORDER BY Fecha_escritura__c DESC NULLS LAST
            LIMIT :MAX_ESCRITURAS
        ];
        resp.totalEscrituras = escrituras.size();
        if (escrituras.isEmpty()) return resp;

        Map<Id, Escrituras__c> escMap = new Map<Id, Escrituras__c>();
        for (Escrituras__c e : escrituras) escMap.put(e.Id, e);

        // ContentDocumentLinks for these escrituras
        Map<Id, Id> docToEscritura = new Map<Id, Id>(); // contentDocumentId → escrituraId
        for (ContentDocumentLink l : [
            SELECT ContentDocumentId, LinkedEntityId
            FROM ContentDocumentLink
            WHERE LinkedEntityId IN :escMap.keySet()
        ]) {
            docToEscritura.put(l.ContentDocumentId, l.LinkedEntityId);
        }

        if (docToEscritura.isEmpty()) return resp;

        // Latest ContentVersions for PDFs only
        for (ContentVersion cv : [
            SELECT Id, Title, FileExtension, ContentDocumentId
            FROM ContentVersion
            WHERE ContentDocumentId IN :docToEscritura.keySet()
              AND IsLatest = true
              AND FileExtension = 'pdf'
            ORDER BY CreatedDate DESC
        ]) {
            if (resp.archivos.size() >= MAX_FILES_RETURNED) break;
            Id escId = docToEscritura.get(cv.ContentDocumentId);
            Escrituras__c esc = escMap.get(escId);
            if (esc == null) continue;

            EscriturasPDFInfo info = new EscriturasPDFInfo();
            info.contentDocumentId = cv.ContentDocumentId;
            info.nombreArchivo = (cv.Title != null ? cv.Title : 'sin_titulo') + '.pdf';
            info.escrituraId = esc.Id;
            info.escrituraTitulo = String.isNotBlank(esc.T_tulo_Escritura__c) ? esc.T_tulo_Escritura__c : esc.Name;
            info.escrituraFecha = esc.Fecha_escritura__c != null ? String.valueOf(esc.Fecha_escritura__c) : 'sin fecha';
            resp.archivos.add(info);
        }
        resp.totalArchivosPDF = resp.archivos.size();
        return resp;
    }
}