@IsTest
private class GetEscriturasOfAccountTest {

    @TestSetup
    static void setup() {
        Account acc = new Account(
            Name = 'Empresa Test Escrituras',
            Procedencia_del_cliente__c = 'Test'
        );
        insert acc;

        List<Escrituras__c> escrituras = new List<Escrituras__c>{
            new Escrituras__c(
                T_tulo_Escritura__c = 'Escritura de Constitución',
                Fecha_escritura__c = Date.newInstance(2018, 3, 15),
                Notario__c = 'Javier Sánchez Ruiz',
                N_Protocolo__c = '1234/2018',
                Empresa__c = acc.Id
            ),
            new Escrituras__c(
                T_tulo_Escritura__c = 'Escritura de Poder General',
                Fecha_escritura__c = Date.newInstance(2021, 6, 20),
                Notario__c = 'Elena Martín Pino',
                N_Protocolo__c = '2876/2021',
                Empresa__c = acc.Id
            )
        };
        insert escrituras;

        ContentVersion txtVersion = new ContentVersion(
            Title = 'extracto_escritura',
            PathOnClient = 'extracto_escritura.txt',
            VersionData = Blob.valueOf('En Madrid, a 15 de marzo de 2018, ante mí, Javier Sánchez Ruiz, Notario...'),
            IsMajorVersion = true
        );
        insert txtVersion;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :txtVersion.Id].ContentDocumentId;
        insert new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId = escrituras[0].Id,
            ShareType = 'V'
        );

        ContentVersion pdfVersion = new ContentVersion(
            Title = 'poder_general',
            PathOnClient = 'poder_general.pdf',
            VersionData = Blob.valueOf('%PDF-1.4 simulado de binario'),
            IsMajorVersion = true
        );
        insert pdfVersion;
        Id pdfDocId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :pdfVersion.Id].ContentDocumentId;
        insert new ContentDocumentLink(
            ContentDocumentId = pdfDocId,
            LinkedEntityId = escrituras[1].Id,
            ShareType = 'V'
        );
    }

    @IsTest
    static void devuelve_escrituras_con_payload() {
        Account acc = [SELECT Id FROM Account WHERE Name = 'Empresa Test Escrituras' LIMIT 1];

        GetEscriturasOfAccount.Request req = new GetEscriturasOfAccount.Request();
        req.accountId = acc.Id;

        Test.startTest();
        List<GetEscriturasOfAccount.Response> responses = GetEscriturasOfAccount.run(new List<GetEscriturasOfAccount.Request>{ req });
        Test.stopTest();

        System.assertEquals(1, responses.size(), 'Una respuesta por petición');
        GetEscriturasOfAccount.Response r = responses[0];
        System.assertEquals(2, r.totalEscrituras, 'Debe encontrar 2 escrituras');
        System.assertEquals(1, r.totalArchivosProcesados, 'El .txt es procesable');
        System.assertEquals(1, r.totalArchivosNoProcesables, 'El .pdf no es procesable en esta versión');
        System.assert(r.payloadParaModelo.contains('Escritura de Constitución'), 'Payload debe incluir la primera escritura');
        System.assert(r.payloadParaModelo.contains('Escritura de Poder General'), 'Payload debe incluir la segunda escritura');
        System.assert(r.payloadParaModelo.contains('Javier Sánchez Ruiz'), 'Payload debe contener texto del .txt extraído');
    }

    @IsTest
    static void cuenta_sin_escrituras_devuelve_estado_correcto() {
        Account vacia = new Account(
            Name = 'Cuenta Sin Escrituras',
            Procedencia_del_cliente__c = 'Test'
        );
        insert vacia;

        GetEscriturasOfAccount.Request req = new GetEscriturasOfAccount.Request();
        req.accountId = vacia.Id;

        Test.startTest();
        List<GetEscriturasOfAccount.Response> responses = GetEscriturasOfAccount.run(new List<GetEscriturasOfAccount.Request>{ req });
        Test.stopTest();

        GetEscriturasOfAccount.Response r = responses[0];
        System.assertEquals(0, r.totalEscrituras, 'No debe encontrar escrituras');
        System.assert(r.estado.contains('no tiene escrituras'), 'Estado debe indicar ausencia de escrituras');
    }

    @IsTest
    static void account_id_nulo_devuelve_estado_correcto() {
        GetEscriturasOfAccount.Request req = new GetEscriturasOfAccount.Request();
        req.accountId = null;

        Test.startTest();
        List<GetEscriturasOfAccount.Response> responses = GetEscriturasOfAccount.run(new List<GetEscriturasOfAccount.Request>{ req });
        Test.stopTest();

        GetEscriturasOfAccount.Response r = responses[0];
        System.assertEquals(0, r.totalEscrituras);
        System.assert(r.estado.contains('No se ha recibido'), 'Debe avisar de falta de Id');
    }
}