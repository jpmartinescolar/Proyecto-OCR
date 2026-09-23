/**
 * Controller genérico para el componente LWC modular del portal.
 * Lee la configuración desde Portal_Data_Source__mdt y Portal_Data_Column__mdt
 * y construye una consulta SOQL dinámica y segura contra el objeto configurado.
 */
public with sharing class PortalDataController {

    /**
     * Wrapper de columna para que el LWC pueda montar el lightning-datatable
     * sin conocer de antemano qué objeto está mostrando.
     */
    public class ColumnWrapper {
        @AuraEnabled public String label;
        @AuraEnabled public String fieldName;
        @AuraEnabled public String type;
        @AuraEnabled public String iconName;
        @AuraEnabled public Boolean isButton;
        @AuraEnabled public Boolean isSearchable;
        @AuraEnabled public Map<String, BadgeColorWrapper> badgeColors;

        public ColumnWrapper(String label, String fieldName, String type) {
            this.label = label;
            this.fieldName = fieldName;
            this.type = type;
        }
    }

    /**
     * Colores de un valor concreto de badge (ej. "Vigente" -> verde),
     * configurados en Portal_Badge_Color__mdt.
     */
    public class BadgeColorWrapper {
        @AuraEnabled public String backgroundColor;
        @AuraEnabled public String textColor;

        public BadgeColorWrapper(String backgroundColor, String textColor) {
            this.backgroundColor = backgroundColor;
            this.textColor = textColor;
        }
    }

    /**
     * Respuesta combinada: columnas a pintar + registros encontrados.
     * Los registros van como Map aplanado (no SObject crudo) para poder
     * incluir campos de relación (ej. "Account__r.Name") con una clave
     * plana que el lightning-datatable pueda leer directamente.
     */
    public class DataResponse {
        @AuraEnabled public List<ColumnWrapper> columns;
        @AuraEnabled public List<Map<String, Object>> records;
    }

    /**
     * Método principal que llama el LWC.
     * @param dataSourceName  DeveloperName del registro Portal_Data_Source__mdt (ej. 'Escrituras')
     * @param searchTerm      Texto escrito por el usuario en el buscador (nombre o CIF)
     */
    @AuraEnabled(cacheable=true)
    public static DataResponse getData(String dataSourceName, String searchTerm) {

        // Sin nombre de configuración: la sección aún no se ha configurado.
        // No es un error del usuario, así que devolvemos una respuesta vacía
        // en vez de lanzar una excepción — el LWC lo interpreta como "sin
        // resultados" en vez de mostrar un mensaje de error confuso.
        if (String.isBlank(dataSourceName)) {
            return emptyResponse();
        }

        // 1. Leer la configuración del "padre": qué objeto consultar.
        // Se consulta como lista (no como asignación directa a un único
        // registro) para poder comprobar de forma segura si existe o no,
        // sin que Salesforce lance su propia excepción interna si no hay
        // ningún registro con ese DeveloperName todavía.
        List<Portal_Data_Source__mdt> sourceMatches = [
            SELECT Id, Object_API_Name__c
            FROM Portal_Data_Source__mdt
            WHERE DeveloperName = :dataSourceName
            LIMIT 1
        ];

        if (sourceMatches.isEmpty()) {
            return emptyResponse();
        }
        Portal_Data_Source__mdt source = sourceMatches[0];

        String objectApiName = source.Object_API_Name__c;

        // 2. Leer las columnas hijas asociadas a este padre, ya ordenadas
        List<Portal_Data_Column__mdt> columnConfigs = [
            SELECT Id, Field_API_Name__c, Label__c, Order__c, Type__c, Is_Searchable__c, Icon_Name__c, Is_Button__c
            FROM Portal_Data_Column__mdt
            WHERE Portal_Data_Source__c = :source.Id
            ORDER BY Order__c ASC NULLS LAST
        ];

        if (columnConfigs.isEmpty()) {
            // El padre existe pero aún no tiene columnas — configuración a
            // medias, no un error: mismo tratamiento que "sin configurar".
            return emptyResponse();
        }

        // 3. Validar objeto y campos contra el schema real (defensa en profundidad:
        //    evita romper la query o exponer campos que no existan/no sean accesibles)
        Schema.DescribeSObjectResult objDescribe = describeObjectSafely(objectApiName);
        Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();

        Set<String> fieldsToSelect = new Set<String>{ 'Id' };
        List<ColumnWrapper> columns = new List<ColumnWrapper>();
        List<String> searchableFields = new List<String>();
        Map<Id, ColumnWrapper> badgeColumnWrappersByConfigId = new Map<Id, ColumnWrapper>();

        for (Portal_Data_Column__mdt col : columnConfigs) {
            String fieldApiName = col.Field_API_Name__c;
            validateFieldExists(fieldMap, fieldApiName, objectApiName);
            fieldsToSelect.add(fieldApiName);
            String columnType = String.isBlank(col.Type__c) ? 'text' : col.Type__c;

            // Si está marcado como buscable pero su tipo real (Fecha, Número,
            // Moneda, Lookup...) no admite LIKE, se ignora silenciosamente
            // para la búsqueda — no bloquea el resto del componente, y el
            // texto del buscador tampoco lo menciona (isSearchable queda en
            // false), para no prometer un filtro que en realidad no aplica.
            Boolean isActuallySearchable = col.Is_Searchable__c
                && SEARCHABLE_TYPES.contains(getFieldDisplayType(fieldMap, fieldApiName, objectApiName));

            ColumnWrapper wrapper = new ColumnWrapper(col.Label__c, fieldApiName, columnType);
            wrapper.iconName = String.isBlank(col.Icon_Name__c) ? 'utility:file' : col.Icon_Name__c;
            wrapper.isButton = col.Is_Button__c;
            wrapper.isSearchable = isActuallySearchable;
            columns.add(wrapper);

            if (isActuallySearchable) {
                searchableFields.add(fieldApiName);
            }
            if (columnType == 'badge') {
                badgeColumnWrappersByConfigId.put(col.Id, wrapper);
            }
        }

        // Colores de badge: una única query para todas las columnas tipo badge,
        // en vez de una query por columna dentro del bucle (evita gastar límites
        // de SOQL si en el futuro hay varias columnas de este tipo).
        if (!badgeColumnWrappersByConfigId.isEmpty()) {
            List<Portal_Badge_Color__mdt> badgeColorConfigs = [
                SELECT Portal_Data_Column__c, Value__c, Background_Color__c, Text_Color__c
                FROM Portal_Badge_Color__mdt
                WHERE Portal_Data_Column__c IN :badgeColumnWrappersByConfigId.keySet()
            ];
            for (Portal_Badge_Color__mdt colorConfig : badgeColorConfigs) {
                ColumnWrapper wrapper = badgeColumnWrappersByConfigId.get(colorConfig.Portal_Data_Column__c);
                if (wrapper != null) {
                    if (wrapper.badgeColors == null) {
                        wrapper.badgeColors = new Map<String, BadgeColorWrapper>();
                    }
                    wrapper.badgeColors.put(
                        colorConfig.Value__c,
                        new BadgeColorWrapper(colorConfig.Background_Color__c, colorConfig.Text_Color__c)
                    );
                }
            }
        }

        // 4. Construir la SOQL dinámica.
        // El WHERE se construye con un OR entre todas las columnas marcadas
        // como buscables (Is_Searchable__c). Si una sección no marca ninguna,
        // simplemente no se aplica filtro y se devuelven todos los registros
        // (nunca se rompe la query por falta de configuración).
        String searchPattern = '%' + String.escapeSingleQuotes(searchTerm == null ? '' : searchTerm) + '%';

        String whereClause = '';
        if (!searchableFields.isEmpty() && String.isNotBlank(searchTerm)) {
            List<String> conditions = new List<String>();
            for (String searchableField : searchableFields) {
                conditions.add(searchableField + ' LIKE :searchPattern');
            }
            whereClause = ' WHERE (' + String.join(conditions, ' OR ') + ')';
        }

        // Orden por defecto: la primera columna configurada (Order__c más bajo)
        String orderByField = columnConfigs[0].Field_API_Name__c;

        String query =
            'SELECT ' + String.join(new List<String>(fieldsToSelect), ', ') +
            ' FROM ' + objectApiName +
            whereClause +
            ' WITH SECURITY_ENFORCED' +
            ' ORDER BY ' + orderByField + ' ASC' +
            ' LIMIT 200';

        List<SObject> queriedRecords;
        try {
            queriedRecords = Database.query(query);
        } catch (Exception e) {
            throw new AuraHandledException('Error al consultar los datos: ' + e.getMessage());
        }

        // Aplanar cada registro: los campos normales se copian tal cual,
        // los campos de relación (ej. "Account__r.Name") se resuelven a mano
        // y se guardan bajo esa misma clave literal, para que el LWC los lea directo.
        List<Map<String, Object>> flattenedRecords = new List<Map<String, Object>>();
        for (SObject record : queriedRecords) {
            Map<String, Object> flatRow = new Map<String, Object>();
            flatRow.put('Id', record.Id);

            for (String fieldApiName : fieldsToSelect) {
                if (fieldApiName == 'Id') {
                    continue;
                }
                if (fieldApiName.contains('.')) {
                    List<String> parts = fieldApiName.split('\\.');
                    SObject relatedRecord = record.getSObject(parts[0]);
                    flatRow.put(fieldApiName, relatedRecord != null ? relatedRecord.get(parts[1]) : null);
                } else {
                    flatRow.put(fieldApiName, record.get(fieldApiName));
                }
            }
            flattenedRecords.add(flatRow);
        }

        DataResponse response = new DataResponse();
        response.columns = columns;
        response.records = flattenedRecords;
        return response;
    }

    // Respuesta neutra para cuando la sección aún no está configurada
    // (o está a medio configurar). El LWC la interpreta como "sin resultados",
    // no como un error — evita mensajes de excepción confusos en producción.
    private static DataResponse emptyResponse() {
        DataResponse response = new DataResponse();
        response.columns = new List<ColumnWrapper>();
        response.records = new List<Map<String, Object>>();
        return response;
    }

    // Tipos de campo compatibles con el operador LIKE en SOQL.
    // Fecha, Número, Moneda, Checkbox o un Lookup NO son válidos.
    private static final Set<Schema.DisplayType> SEARCHABLE_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.STRING,
        Schema.DisplayType.TEXTAREA,
        Schema.DisplayType.PICKLIST,
        Schema.DisplayType.MULTIPICKLIST,
        Schema.DisplayType.EMAIL,
        Schema.DisplayType.PHONE,
        Schema.DisplayType.URL,
        Schema.DisplayType.COMBOBOX
    };

    @TestVisible
    private static Schema.DisplayType getFieldDisplayType(Map<String, Schema.SObjectField> fieldMap, String fieldApiName, String objectApiName) {
        if (fieldApiName.contains('.')) {
            List<String> parts = fieldApiName.split('\\.');
            String relationshipName = parts[0];
            String relatedFieldName = parts[1];
            String lookupFieldName = relationshipName.endsWith('__r')
                ? relationshipName.removeEnd('__r') + '__c'
                : relationshipName + 'Id';

            Schema.DescribeFieldResult lookupDescribe = fieldMap.get(lookupFieldName.toLowerCase()).getDescribe();
            for (Schema.SObjectType relatedType : lookupDescribe.getReferenceTo()) {
                Map<String, Schema.SObjectField> relatedFieldMap = relatedType.getDescribe().fields.getMap();
                if (relatedFieldMap.containsKey(relatedFieldName.toLowerCase())) {
                    return relatedFieldMap.get(relatedFieldName.toLowerCase()).getDescribe().getType();
                }
            }
            return null;
        }
        return fieldMap.get(fieldApiName.toLowerCase()).getDescribe().getType();
    }

    @TestVisible
    private static Schema.DescribeSObjectResult describeObjectSafely(String objectApiName) {
        Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
        if (sObjType == null) {
            throw new AuraHandledException('El objeto configurado no existe: ' + objectApiName);
        }
        return sObjType.getDescribe();
    }

    @TestVisible
    private static void validateFieldExists(Map<String, Schema.SObjectField> fieldMap, String fieldApiName, String objectApiName) {
        if (String.isBlank(fieldApiName)) {
            throw new AuraHandledException('Hay un campo vacío en la configuración de ' + objectApiName);
        }

        // Campo de relación, ej. "Account__r.Name": se valida en dos partes
        if (fieldApiName.contains('.')) {
            List<String> parts = fieldApiName.split('\\.');
            if (parts.size() != 2) {
                throw new AuraHandledException('Formato de campo de relación no soportado: ' + fieldApiName);
            }
            String relationshipName = parts[0];
            String relatedFieldName = parts[1];

            // De "Account__r" deducimos el campo lookup real "Account__c"
            String lookupFieldName = relationshipName.endsWith('__r')
                ? relationshipName.removeEnd('__r') + '__c'
                : relationshipName + 'Id'; // caso de relaciones estándar, ej. Owner -> OwnerId

            if (!fieldMap.containsKey(lookupFieldName.toLowerCase())) {
                throw new AuraHandledException('No existe el campo de relación "' + relationshipName + '" en ' + objectApiName);
            }

            Schema.DescribeFieldResult lookupDescribe = fieldMap.get(lookupFieldName.toLowerCase()).getDescribe();
            Boolean fieldFoundOnRelatedObject = false;
            for (Schema.SObjectType relatedType : lookupDescribe.getReferenceTo()) {
                Map<String, Schema.SObjectField> relatedFieldMap = relatedType.getDescribe().fields.getMap();
                if (relatedFieldMap.containsKey(relatedFieldName.toLowerCase())) {
                    fieldFoundOnRelatedObject = true;
                    break;
                }
            }
            if (!fieldFoundOnRelatedObject) {
                throw new AuraHandledException('El campo "' + relatedFieldName + '" no existe en el objeto relacionado por "' + relationshipName + '"');
            }
            return;
        }

        // Campo normal, plano
        if (!fieldMap.containsKey(fieldApiName.toLowerCase())) {
            throw new AuraHandledException('El campo "' + fieldApiName + '" no existe en ' + objectApiName + '. Revisa el metadato.');
        }
    }
}