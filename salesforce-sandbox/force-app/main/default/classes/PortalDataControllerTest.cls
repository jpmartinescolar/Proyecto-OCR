/**
 * @description Test de PortalDataController, el controlador genérico del portal de clientes.
 *              Los Custom Metadata Types (Portal_Data_Source__mdt, Portal_Data_Column__mdt y
 *              Portal_Badge_Color__mdt) son visibles en los tests sin SeeAllData, así que se
 *              usan las fuentes reales Escrituras (Escrituras__c, con registros creados aquí) y
 *              Expedientes (Proyecto__c, solo la configuración: su flujo de creación impide
 *              insertar expedientes en un test). Las comprobaciones de columnas se derivan de
 *              la propia configuración para no depender de valores concretos.
 */
@isTest
private class PortalDataControllerTest {

    private static Account crearEmpresa(String nombre, String cif) {
        Account acc = new Account(Name = nombre, Procedencia_del_cliente__c = 'Test', CIF__c = cif);
        insert acc;
        return acc;
    }

    private static Escrituras__c crearEscritura(Id empresaId, Date fecha, String titulo) {
        return new Escrituras__c(
            Empresa__c = empresaId,
            Fecha_escritura__c = fecha,
            N_Protocolo__c = 'P-' + titulo.left(5),
            Notario__c = 'Notario Test',
            T_tulo_Escritura__c = titulo,
            Observaciones__c = 'Obs ' + titulo,
            Contiene_descripci_n_objeto_social__c = 'Si'
        );
    }

    // Configuracion de columnas de una fuente, indexada por campo (el ORDER BY sobre
    // metadatos con filtro de relacion no es fiable, asi que el orden se calcula aqui)
    private static Map<String, Portal_Data_Column__mdt> columnasDe(String fuente) {
        Map<String, Portal_Data_Column__mdt> out = new Map<String, Portal_Data_Column__mdt>();
        for (Portal_Data_Column__mdt c : [
            SELECT Field_API_Name__c, Type__c, Is_Searchable__c, Icon_Name__c, Order__c
            FROM Portal_Data_Column__mdt
            WHERE Portal_Data_Source__r.DeveloperName = :fuente
        ]) {
            out.put(c.Field_API_Name__c, c);
        }
        return out;
    }

    private static String campoConMenorOrden(Map<String, Portal_Data_Column__mdt> config) {
        String campo;
        Decimal menor;
        for (Portal_Data_Column__mdt c : config.values()) {
            if (c.Order__c != null && (menor == null || c.Order__c < menor)) {
                menor = c.Order__c;
                campo = c.Field_API_Name__c;
            }
        }
        return campo;
    }

    private static void comprobarColumnas(List<PortalDataController.ColumnWrapper> columnas,
                                          Map<String, Portal_Data_Column__mdt> config) {
        System.assertEquals(config.size(), columnas.size(), 'Una columna por registro de Portal_Data_Column__mdt');
        System.assertEquals(campoConMenorOrden(config), columnas[0].fieldName, 'La primera columna es la de menor Order__c');
        for (PortalDataController.ColumnWrapper col : columnas) {
            Portal_Data_Column__mdt c = config.get(col.fieldName);
            System.assertNotEquals(null, c, 'Cada columna corresponde a un registro configurado: ' + col.fieldName);
            System.assertEquals(String.isBlank(c.Type__c) ? 'text' : c.Type__c, col.type, 'Sin tipo configurado, text');
            System.assertEquals(String.isBlank(c.Icon_Name__c) ? 'utility:file' : c.Icon_Name__c, col.iconName,
                'Sin icono configurado se usa utility:file');
            if (!c.Is_Searchable__c) {
                System.assertEquals(false, col.isSearchable, 'Lo no marcado como buscable no se busca');
            }
        }
    }

    @isTest
    static void sinConfiguracionDevuelveRespuestaVacia() {
        Test.startTest();
        PortalDataController.DataResponse vacia = PortalDataController.getData('', 'algo');
        PortalDataController.DataResponse nula = PortalDataController.getData(null, null);
        PortalDataController.DataResponse inexistente =
            PortalDataController.getData('Fuente_Inexistente_' + Datetime.now().getTime(), null);
        Test.stopTest();

        System.assertEquals(0, vacia.columns.size(), 'Sin nombre de configuracion no hay columnas');
        System.assertEquals(0, vacia.records.size(), 'Ni registros');
        System.assertEquals(0, nula.columns.size(), 'Con nulo tampoco');
        System.assertEquals(0, inexistente.columns.size(), 'Una configuracion inexistente no es un error, es una respuesta vacia');
        System.assertEquals(0, inexistente.records.size());
    }

    @isTest
    static void escriturasColumnasBuscadorYAplanado() {
        Account acc = crearEmpresa('Empresa Portal Escrituras', 'B11111111');
        insert new List<Escrituras__c>{
            crearEscritura(acc.Id, Date.newInstance(2024, 3, 1), 'Constitucion de sociedad portal'),
            crearEscritura(acc.Id, Date.newInstance(2025, 6, 15), 'Ampliacion de capital portal')
        };

        Test.startTest();
        PortalDataController.DataResponse todo = PortalDataController.getData('Escrituras', null);
        PortalDataController.DataResponse filtrado = PortalDataController.getData('Escrituras', 'Ampliacion de capital');
        PortalDataController.DataResponse ninguno = PortalDataController.getData('Escrituras', 'zzz-no-existe-zzz');
        Test.stopTest();

        Map<String, Portal_Data_Column__mdt> config = columnasDe('Escrituras');
        if (config.isEmpty()) {
            // Entorno sin la configuracion todavia (por ejemplo, validando el change set que la
            // trae): la fuente se comporta como no configurada y responde vacia, sin error
            System.assertEquals(0, todo.columns.size(), 'Sin columnas configuradas, respuesta vacia');
            System.assertEquals(0, todo.records.size(), 'Y sin registros');
            System.assertEquals(0, filtrado.columns.size());
            return;
        }
        comprobarColumnas(todo.columns, config);
        for (PortalDataController.ColumnWrapper col : todo.columns) {
            // La fecha nunca es buscable aunque se marque: LIKE no vale para un campo de fecha
            if (col.fieldName == 'Fecha_escritura__c') {
                System.assertEquals(false, col.isSearchable, 'Una fecha no admite LIKE');
            }
        }

        // Sin termino: las dos escrituras, cada fila plana con Id y todas las columnas
        System.assertEquals(2, todo.records.size(), 'Sin buscador salen todas las escrituras del test');
        for (Map<String, Object> fila : todo.records) {
            System.assert(fila.containsKey('Id'), 'Cada fila lleva su Id');
            for (PortalDataController.ColumnWrapper col : todo.columns) {
                System.assert(fila.containsKey(col.fieldName), 'Cada fila lleva la clave de cada columna: ' + col.fieldName);
            }
        }
        if (campoConMenorOrden(config) == 'T_tulo_Escritura__c') {
            System.assertEquals('Ampliacion de capital portal', todo.records[0].get('T_tulo_Escritura__c'),
                'Ordenadas por la primera columna configurada (el titulo), ascendente');
        }

        // Con termino: solo la que coincide en alguna columna buscable
        System.assertEquals(1, filtrado.records.size(), 'El buscador filtra por las columnas buscables');
        System.assertEquals('Ampliacion de capital portal', filtrado.records[0].get('T_tulo_Escritura__c'));
        System.assertEquals(0, ninguno.records.size(), 'Sin coincidencias, lista vacia pero con columnas');
        System.assertEquals(config.size(), ninguno.columns.size());
    }

    @isTest
    static void expedientesBadgeConColores() {
        Test.startTest();
        PortalDataController.DataResponse res = PortalDataController.getData('Expedientes', null);
        PortalDataController.DataResponse buscado = PortalDataController.getData('Expedientes', 'Abierto');
        Test.stopTest();

        Map<String, Portal_Data_Column__mdt> config = columnasDe('Expedientes');
        if (config.isEmpty()) {
            // Entorno sin la configuracion todavia: respuesta vacia, sin error
            System.assertEquals(0, res.columns.size(), 'Sin columnas configuradas, respuesta vacia');
            System.assertEquals(0, buscado.columns.size());
            return;
        }
        comprobarColumnas(res.columns, config);
        // Sin expedientes visibles en el test (su flujo de creacion impide insertarlos aqui),
        // la respuesta trae las columnas completas y ningun registro, con y sin buscador
        System.assertEquals(0, res.records.size(), 'Sin datos de prueba no hay filas');
        System.assertEquals(config.size(), buscado.columns.size(), 'El buscador no altera las columnas');
        System.assertEquals(0, buscado.records.size());

        PortalDataController.ColumnWrapper badge;
        for (PortalDataController.ColumnWrapper col : res.columns) {
            if (col.type == 'badge') badge = col;
        }
        System.assertNotEquals(null, badge, 'Expedientes tiene una columna de tipo badge (el estado)');
        System.assertNotEquals(null, badge.badgeColors, 'La columna badge lleva sus colores de Portal_Badge_Color__mdt');
        List<Portal_Badge_Color__mdt> colores = [
            SELECT Value__c, Background_Color__c, Text_Color__c
            FROM Portal_Badge_Color__mdt
            WHERE Portal_Data_Column__r.Field_API_Name__c = :badge.fieldName
              AND Portal_Data_Column__r.Portal_Data_Source__r.DeveloperName = 'Expedientes'
        ];
        System.assertEquals(colores.size(), badge.badgeColors.size(), 'Un color por valor configurado');
        for (Portal_Badge_Color__mdt c : colores) {
            PortalDataController.BadgeColorWrapper w = badge.badgeColors.get(c.Value__c);
            System.assertNotEquals(null, w, 'Color del valor ' + c.Value__c);
            System.assertEquals(c.Background_Color__c, w.backgroundColor);
            System.assertEquals(c.Text_Color__c, w.textColor);
        }
    }

    // Caminos de validacion del esquema que la configuracion actual no recorre:
    // campos de relacion (personalizada y estandar), campos inexistentes y objeto inexistente
    @isTest
    static void validacionDeCamposYObjetos() {
        Map<String, Schema.SObjectField> campos = Schema.SObjectType.Escrituras__c.fields.getMap();
        Map<String, Schema.SObjectField> camposCuenta = Schema.SObjectType.Account.fields.getMap();

        // Campo de relacion valido (lookup personalizado) y campo plano valido: no lanzan
        PortalDataController.validateFieldExists(campos, 'Empresa__r.Name', 'Escrituras__c');
        PortalDataController.validateFieldExists(campos, 'T_tulo_Escritura__c', 'Escrituras__c');
        System.assertEquals(Schema.DisplayType.STRING,
            PortalDataController.getFieldDisplayType(campos, 'Empresa__r.Name', 'Escrituras__c'),
            'El tipo de un campo de relacion se resuelve en el objeto relacionado');
        System.assertEquals(Schema.DisplayType.DATE,
            PortalDataController.getFieldDisplayType(campos, 'Fecha_escritura__c', 'Escrituras__c'));
        // Relacion estandar (Owner -> OwnerId), en un objeto que tiene propietario
        PortalDataController.validateFieldExists(camposCuenta, 'Owner.Name', 'Account');
        System.assertEquals(Schema.DisplayType.STRING,
            PortalDataController.getFieldDisplayType(camposCuenta, 'Owner.Name', 'Account'));
        System.assertEquals(null,
            PortalDataController.getFieldDisplayType(campos, 'Empresa__r.Campo_Que_No_Existe__c', 'Escrituras__c'),
            'Campo relacionado inexistente: sin tipo');

        System.assertEquals('Escrituras__c', PortalDataController.describeObjectSafely('Escrituras__c').getName());

        Integer excepciones = 0;
        try { PortalDataController.validateFieldExists(campos, '', 'Escrituras__c'); } catch (AuraHandledException e) { excepciones++; }
        try { PortalDataController.validateFieldExists(campos, 'Campo_Inexistente__c', 'Escrituras__c'); } catch (AuraHandledException e) { excepciones++; }
        try { PortalDataController.validateFieldExists(campos, 'Relacion_Inexistente__r.Name', 'Escrituras__c'); } catch (AuraHandledException e) { excepciones++; }
        try { PortalDataController.validateFieldExists(campos, 'Empresa__r.Campo_Que_No_Existe__c', 'Escrituras__c'); } catch (AuraHandledException e) { excepciones++; }
        try { PortalDataController.validateFieldExists(campos, 'A.B.C', 'Escrituras__c'); } catch (AuraHandledException e) { excepciones++; }
        try { PortalDataController.describeObjectSafely('Objeto_Inexistente__c'); } catch (AuraHandledException e) { excepciones++; }
        System.assertEquals(6, excepciones, 'Cada configuracion invalida lanza una AuraHandledException con mensaje para el usuario');
    }
}