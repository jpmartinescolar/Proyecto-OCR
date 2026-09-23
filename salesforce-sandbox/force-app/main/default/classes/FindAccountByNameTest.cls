@IsTest
private class FindAccountByNameTest {

    @TestSetup
    static void setup() {
        insert new List<Account>{
            new Account(Name = 'ONTIME',                       Procedencia_del_cliente__c = 'Test'),
            new Account(Name = 'ONTIME CORPORATE UNION S.A.',  Procedencia_del_cliente__c = 'Test'),
            new Account(Name = 'ONTIME SERVICIOS SL',          Procedencia_del_cliente__c = 'Test'),
            new Account(Name = 'CHAMONIX HOLDING',             Procedencia_del_cliente__c = 'Test'),
            new Account(Name = 'NELTOS INVERSIONES',           Procedencia_del_cliente__c = 'Test')
        };
    }

    @IsTest
    static void busqueda_con_una_coincidencia_devuelve_id_unico() {
        FindAccountByName.Request req = new FindAccountByName.Request();
        req.nombre = 'CHAMONIX';
        Test.startTest();
        FindAccountByName.Response r = FindAccountByName.run(new List<FindAccountByName.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(1, r.totalCoincidencias);
        System.assertNotEquals('', r.accountIdUnico);
        System.assert(r.estado.contains('Encontrada 1 empresa'), 'Estado: ' + r.estado);
    }

    @IsTest
    static void busqueda_con_varias_coincidencias_parciales_sin_exacto() {
        // "ONTI" matches 3 records, none of which is named exactly "ONTI"
        FindAccountByName.Request req = new FindAccountByName.Request();
        req.nombre = 'ONTI';
        Test.startTest();
        FindAccountByName.Response r = FindAccountByName.run(new List<FindAccountByName.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(3, r.totalCoincidencias);
        System.assertEquals('', r.accountIdUnico, 'Sin match exacto no debe haber Id único');
        System.assert(r.resultados.contains('ONTIME CORPORATE'),  'Listado debe incluir todas');
        System.assert(r.resultados.contains('ONTIME SERVICIOS'), 'Listado debe incluir todas');
        System.assert(r.estado.contains('desambiguar'), 'Estado: ' + r.estado);
    }

    @IsTest
    static void match_exacto_entre_varias_coincidencias_se_usa_directamente() {
        // "ONTIME" matches 3 records, one of which is named exactly "ONTIME"
        FindAccountByName.Request req = new FindAccountByName.Request();
        req.nombre = 'ONTIME';
        Test.startTest();
        FindAccountByName.Response r = FindAccountByName.run(new List<FindAccountByName.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(3, r.totalCoincidencias);
        System.assertNotEquals('', r.accountIdUnico, 'Debe usar el match exacto');
        System.assert(r.estado.contains('coincide exactamente'), 'Estado: ' + r.estado);
    }

    @IsTest
    static void busqueda_sin_coincidencias_devuelve_estado_correcto() {
        FindAccountByName.Request req = new FindAccountByName.Request();
        req.nombre = 'NoExisteEstaEmpresa';
        Test.startTest();
        FindAccountByName.Response r = FindAccountByName.run(new List<FindAccountByName.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(0, r.totalCoincidencias);
        System.assertEquals('', r.accountIdUnico);
        System.assert(r.estado.contains('No se ha encontrado'), 'Estado: ' + r.estado);
    }

    @IsTest
    static void nombre_en_blanco_devuelve_estado_correcto() {
        FindAccountByName.Request req = new FindAccountByName.Request();
        req.nombre = '   ';
        Test.startTest();
        FindAccountByName.Response r = FindAccountByName.run(new List<FindAccountByName.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(0, r.totalCoincidencias);
        System.assert(r.estado.contains('No se ha indicado'), 'Estado: ' + r.estado);
    }
}