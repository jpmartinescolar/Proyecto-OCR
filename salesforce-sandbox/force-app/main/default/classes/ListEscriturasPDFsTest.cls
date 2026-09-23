@IsTest
private class ListEscriturasPDFsTest {

    @TestSetup
    static void setup() {
        Account acc = new Account(Name = 'Empresa Test PDFs', Procedencia_del_cliente__c = 'Test');
        insert acc;

        List<Escrituras__c> escrituras = new List<Escrituras__c>{
            new Escrituras__c(
                T_tulo_Escritura__c = 'Escritura A',
                Fecha_escritura__c = Date.newInstance(2024, 1, 10),
                Empresa__c = acc.Id
            ),
            new Escrituras__c(
                T_tulo_Escritura__c = 'Escritura B',
                Fecha_escritura__c = Date.newInstance(2024, 5, 20),
                Empresa__c = acc.Id
            )
        };
        insert escrituras;

        ContentVersion v1 = new ContentVersion(
            Title = 'doc_uno', PathOnClient = 'doc_uno.pdf',
            VersionData = Blob.valueOf('%PDF-1.4 fake'), IsMajorVersion = true
        );
        ContentVersion v2 = new ContentVersion(
            Title = 'doc_dos', PathOnClient = 'doc_dos.pdf',
            VersionData = Blob.valueOf('%PDF-1.4 fake'), IsMajorVersion = true
        );
        ContentVersion vTxt = new ContentVersion(
            Title = 'notas', PathOnClient = 'notas.txt',
            VersionData = Blob.valueOf('notas'), IsMajorVersion = true
        );
        insert new List<ContentVersion>{ v1, v2, vTxt };

        Map<Id, Id> versionToDoc = new Map<Id, Id>();
        for (ContentVersion cv : [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id IN :new Set<Id>{v1.Id, v2.Id, vTxt.Id}]) {
            versionToDoc.put(cv.Id, cv.ContentDocumentId);
        }

        insert new List<ContentDocumentLink>{
            new ContentDocumentLink(ContentDocumentId = versionToDoc.get(v1.Id),  LinkedEntityId = escrituras[0].Id, ShareType = 'V'),
            new ContentDocumentLink(ContentDocumentId = versionToDoc.get(v2.Id),  LinkedEntityId = escrituras[1].Id, ShareType = 'V'),
            new ContentDocumentLink(ContentDocumentId = versionToDoc.get(vTxt.Id), LinkedEntityId = escrituras[0].Id, ShareType = 'V')
        };
    }

    @IsTest
    static void devuelve_lista_plana_de_pdfs() {
        Account acc = [SELECT Id FROM Account WHERE Name = 'Empresa Test PDFs' LIMIT 1];

        ListEscriturasPDFs.Request req = new ListEscriturasPDFs.Request();
        req.accountId = acc.Id;

        Test.startTest();
        List<ListEscriturasPDFs.Response> rs = ListEscriturasPDFs.run(new List<ListEscriturasPDFs.Request>{ req });
        Test.stopTest();

        ListEscriturasPDFs.Response r = rs[0];
        System.assertEquals(2, r.totalEscrituras);
        System.assertEquals(2, r.totalArchivosPDF, 'Solo los 2 PDFs, no el txt');
        System.assertEquals(2, r.archivos.size());

        Set<String> titulos = new Set<String>();
        for (EscriturasPDFInfo a : r.archivos) {
            titulos.add(a.escrituraTitulo);
            System.assertNotEquals(null, a.contentDocumentId);
            System.assertNotEquals(null, a.escrituraFecha);
        }
        System.assert(titulos.contains('Escritura A'));
        System.assert(titulos.contains('Escritura B'));
    }

    @IsTest
    static void cuenta_sin_escrituras_devuelve_lista_vacia() {
        Account vacia = new Account(Name = 'Sin Escrituras', Procedencia_del_cliente__c = 'Test');
        insert vacia;

        ListEscriturasPDFs.Request req = new ListEscriturasPDFs.Request();
        req.accountId = vacia.Id;

        Test.startTest();
        ListEscriturasPDFs.Response r = ListEscriturasPDFs.run(new List<ListEscriturasPDFs.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(0, r.totalEscrituras);
        System.assertEquals(0, r.totalArchivosPDF);
        System.assertEquals(0, r.archivos.size());
    }
}