/**
 * Acción invocable para Agentforce.
 * Devuelve las escrituras relacionadas con una Account y un payload
 * textual con los datos de cada escritura más el texto extraído de
 * sus archivos adjuntos. Ese payload es consumido por un Prompt
 * Template que genera el análisis final.
 */
public with sharing class GetEscriturasOfAccount {

    private static final Integer MAX_ESCRITURAS = 25;
    private static final Integer MAX_TEXT_BYTES_PER_FILE = 2 * 1024 * 1024; // 2 MB
    private static final Integer MAX_TEXT_CHARS_PER_FILE = 20000;          // truncado para el LLM
    private static final Set<String> TEXT_EXTENSIONS = new Set<String>{
        'txt','csv','json','md','html','htm','xml','log','rtf','tsv','yaml','yml'
    };

    public class Request {
        @InvocableVariable(required=true label='Account Id' description='Id de la empresa cuyo análisis de escrituras se solicita')
        public Id accountId;
    }

    public class Response {
        @InvocableVariable(label='Total escrituras')
        public Integer totalEscrituras;

        @InvocableVariable(label='Total archivos procesados')
        public Integer totalArchivosProcesados;

        @InvocableVariable(label='Total archivos no procesables')
        public Integer totalArchivosNoProcesables;

        @InvocableVariable(label='Estado general')
        public String estado;

        @InvocableVariable(label='Payload para el modelo' description='Texto estructurado que se pasa al Prompt Template')
        public String payloadParaModelo;
    }

    @InvocableMethod(
        label='Obtener Escrituras con Texto de Adjuntos'
        description='Devuelve las escrituras relacionadas con una cuenta y el texto extraído de los archivos adjuntos para que un Prompt Template genere el resumen.'
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
        resp.totalEscrituras = 0;
        resp.totalArchivosProcesados = 0;
        resp.totalArchivosNoProcesables = 0;

        if (accountId == null) {
            resp.estado = 'No se ha recibido un Id de cuenta.';
            resp.payloadParaModelo = '';
            return resp;
        }

        Account acc;
        try {
            acc = [SELECT Id, Name FROM Account WHERE Id = :accountId LIMIT 1];
        } catch (QueryException qe) {
            resp.estado = 'No se ha podido localizar la cuenta indicada.';
            resp.payloadParaModelo = '';
            return resp;
        }

        List<Escrituras__c> escrituras = [
            SELECT Id, Name, T_tulo_Escritura__c, Fecha_escritura__c,
                   Notario__c, N_Protocolo__c
            FROM Escrituras__c
            WHERE Empresa__c = :accountId
            WITH SECURITY_ENFORCED
            ORDER BY Fecha_escritura__c DESC NULLS LAST
            LIMIT :MAX_ESCRITURAS
        ];

        resp.totalEscrituras = escrituras.size();

        if (escrituras.isEmpty()) {
            resp.estado = 'La cuenta "' + acc.Name + '" no tiene escrituras relacionadas.';
            resp.payloadParaModelo = buildEmptyPayload(acc.Name);
            return resp;
        }

        Map<Id, List<ContentDocumentLink>> linksByEsc = loadLinks(escrituras);
        Set<Id> docIds = new Set<Id>();
        for (List<ContentDocumentLink> ls : linksByEsc.values()) {
            for (ContentDocumentLink l : ls) docIds.add(l.ContentDocumentId);
        }

        Map<Id, ContentVersion> metaByDoc = loadVersionsMetadata(docIds);
        Map<Id, Blob> dataByVersion = loadTextVersionData(metaByDoc.values());

        String payload = buildPayloadHeader(acc.Name, escrituras.size());

        for (Escrituras__c esc : escrituras) {
            EscrituraBlock block = buildEscrituraBlock(esc, linksByEsc.get(esc.Id), metaByDoc, dataByVersion);
            payload += block.text;
            resp.totalArchivosProcesados += block.filesProcessed;
            resp.totalArchivosNoProcesables += block.filesUnprocessable;
        }

        resp.estado = String.format(
            'Empresa: {0}. Escrituras: {1}. Archivos procesados: {2}. Archivos no procesables (formato binario): {3}.',
            new List<Object>{
                acc.Name,
                resp.totalEscrituras,
                resp.totalArchivosProcesados,
                resp.totalArchivosNoProcesables
            }
        );
        resp.payloadParaModelo = payload;
        return resp;
    }

    private static Map<Id, List<ContentDocumentLink>> loadLinks(List<Escrituras__c> escrituras) {
        Set<Id> escIds = new Set<Id>();
        Map<Id, List<ContentDocumentLink>> result = new Map<Id, List<ContentDocumentLink>>();
        for (Escrituras__c e : escrituras) {
            escIds.add(e.Id);
            result.put(e.Id, new List<ContentDocumentLink>());
        }
        for (ContentDocumentLink link : [
            SELECT LinkedEntityId, ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId IN :escIds
        ]) {
            result.get(link.LinkedEntityId).add(link);
        }
        return result;
    }

    private static Map<Id, ContentVersion> loadVersionsMetadata(Set<Id> docIds) {
        Map<Id, ContentVersion> result = new Map<Id, ContentVersion>();
        if (docIds.isEmpty()) return result;
        for (ContentVersion cv : [
            SELECT Id, Title, FileExtension, ContentSize, ContentDocumentId
            FROM ContentVersion
            WHERE ContentDocumentId IN :docIds AND IsLatest = true
        ]) {
            result.put(cv.ContentDocumentId, cv);
        }
        return result;
    }

    private static Map<Id, Blob> loadTextVersionData(Iterable<ContentVersion> versions) {
        Map<Id, Blob> result = new Map<Id, Blob>();
        Set<Id> textVersionIds = new Set<Id>();
        for (ContentVersion cv : versions) {
            String ext = normalizeExt(cv.FileExtension);
            if (TEXT_EXTENSIONS.contains(ext) && cv.ContentSize != null && cv.ContentSize <= MAX_TEXT_BYTES_PER_FILE) {
                textVersionIds.add(cv.Id);
            }
        }
        if (textVersionIds.isEmpty()) return result;
        for (ContentVersion cv : [
            SELECT Id, VersionData
            FROM ContentVersion
            WHERE Id IN :textVersionIds
        ]) {
            result.put(cv.Id, cv.VersionData);
        }
        return result;
    }

    private class EscrituraBlock {
        String text;
        Integer filesProcessed = 0;
        Integer filesUnprocessable = 0;
    }

    private static EscrituraBlock buildEscrituraBlock(
        Escrituras__c esc,
        List<ContentDocumentLink> links,
        Map<Id, ContentVersion> metaByDoc,
        Map<Id, Blob> dataByVersion
    ) {
        EscrituraBlock block = new EscrituraBlock();
        String titulo = blank(esc.T_tulo_Escritura__c) ? esc.Name : esc.T_tulo_Escritura__c;
        String fecha = esc.Fecha_escritura__c != null ? String.valueOf(esc.Fecha_escritura__c) : 'sin fecha';

        String sb = '\n\n========================================\n';
        sb += 'ESCRITURA: ' + titulo + '\n';
        sb += 'Nº interno: ' + esc.Name + ' | Fecha: ' + fecha + '\n';
        if (!blank(esc.Notario__c))    sb += 'Notario (campo): ' + esc.Notario__c + '\n';
        if (!blank(esc.N_Protocolo__c)) sb += 'Nº Protocolo (campo): ' + esc.N_Protocolo__c + '\n';
        sb += 'Id registro: ' + esc.Id + '\n';

        if (links == null || links.isEmpty()) {
            sb += 'Archivos adjuntos: ninguno.\n';
            block.text = sb;
            return block;
        }

        List<String> fileNames = new List<String>();
        String textBlock = '';
        for (ContentDocumentLink link : links) {
            ContentVersion cv = metaByDoc.get(link.ContentDocumentId);
            if (cv == null) continue;
            String ext = normalizeExt(cv.FileExtension);
            String display = (cv.Title != null ? cv.Title : 'sin_título') + (ext != '' ? '.' + ext : '');
            fileNames.add(display + ' (' + ext + ')');

            if (TEXT_EXTENSIONS.contains(ext)) {
                Blob data = dataByVersion.get(cv.Id);
                String content = '';
                if (data != null) {
                    try {
                        content = data.toString();
                    } catch (Exception ex) {
                        content = '[No se pudo decodificar como UTF-8]';
                    }
                }
                if (String.isNotBlank(content)) {
                    if (content.length() > MAX_TEXT_CHARS_PER_FILE) {
                        content = content.substring(0, MAX_TEXT_CHARS_PER_FILE) + '\n[... contenido truncado ...]';
                    }
                    textBlock += '\n--- Contenido de ' + display + ' ---\n' + content + '\n';
                    block.filesProcessed++;
                } else {
                    textBlock += '\n--- ' + display + ' (vacío o ilegible) ---\n';
                    block.filesUnprocessable++;
                }
            } else {
                block.filesUnprocessable++;
            }
        }

        sb += 'Archivos adjuntos (' + fileNames.size() + '): ' + String.join(fileNames, '; ') + '\n';
        if (String.isNotBlank(textBlock)) {
            sb += 'TEXTO EXTRAÍDO DE LOS ARCHIVOS:\n' + textBlock;
        } else {
            sb += 'No se ha podido extraer texto de los archivos adjuntos (formatos binarios no soportados en esta versión).\n';
        }
        block.text = sb;
        return block;
    }

    private static String buildPayloadHeader(String accountName, Integer total) {
        return 'EMPRESA: ' + accountName + '\n' +
               'TOTAL DE ESCRITURAS ENCONTRADAS: ' + total + '\n' +
               '------------------------------------------------------------\n' +
               'A continuación se incluye, para cada escritura, su título, fecha y el contenido textual extraído de los archivos adjuntos. ' +
               'Cuando el archivo es binario (PDF, Word, Excel, imágenes…) no se incluye su contenido en esta versión.';
    }

    private static String buildEmptyPayload(String accountName) {
        return 'EMPRESA: ' + accountName + '\n' +
               'No se han encontrado escrituras relacionadas con esta empresa.';
    }

    private static String normalizeExt(String ext) {
        return ext == null ? '' : ext.toLowerCase();
    }

    private static Boolean blank(String s) {
        return String.isBlank(s);
    }
}