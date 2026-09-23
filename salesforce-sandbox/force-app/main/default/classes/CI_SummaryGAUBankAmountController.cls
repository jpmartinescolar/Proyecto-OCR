/*
*   @Class          :   CI_SummaryGAUBankAmountController
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-03-26
*   @Description    :   Class CI_SummaryGAUBankAmountController
*/
public class CI_SummaryGAUBankAmountController {

    public class AccountingEntryWrapper {
        @AuraEnabled public String Id;
        @AuraEnabled public String AsientoId;
        @AuraEnabled public String NombreApunte;
        @AuraEnabled public String NombreAsiento;
        @AuraEnabled public String Descripcion;
        @AuraEnabled public String EmpresaTitular;
        @AuraEnabled public String FacturaEmitida;
        @AuraEnabled public String FacturaEmitidaId;
        @AuraEnabled public String FacturaRecibida;
        @AuraEnabled public String FacturaRecibidaId;
        @AuraEnabled public String Nominas;
        @AuraEnabled public String NominasId;
        @AuraEnabled public String Area;
        @AuraEnabled public String DirectorFacturacion;
        @AuraEnabled public String DirectorFacturacionId;
        @AuraEnabled public Date FechaAsiento;
        @AuraEnabled public Decimal ImporteDebe;
        @AuraEnabled public Decimal ImporteHaber;
        @AuraEnabled public Decimal Saldo;
        @AuraEnabled public String Check;
        @AuraEnabled public String Simulacion;

        @AuraEnabled public Datetime CreatedDate;
    }

    public class PageResult {
        @AuraEnabled public List<AccountingEntryWrapper> rows;
        @AuraEnabled public String nextCursor;
        @AuraEnabled public Decimal totalSaldo;
    }

    // -------------------------
    // Sorting helpers (whitelist)
    // -------------------------
    private static String normalizeSortDirection(String dir) {
        return (dir != null && dir.toLowerCase() == 'asc') ? 'ASC' : 'DESC';
    }

    private static String resolveSortField(String sortBy) {
        // sortBy viene del LWC (clave lógica). NO meter sortBy directo en SOQL.
        Map<String, String> allowed = new Map<String, String>{
            'FechaAsiento'          => 'Fecha_asiento__c',
            'NombreApunte'          => 'Name',
            'NombreAsiento'         => 'Asientos_contable__r.Name',
            'EmpresaTitular'        => 'Empresa_titular__c',
            'FacturaEmitida'        => 'Facturas_emitidas__r.N_factura__c',
            'FacturaRecibida'       => 'Facturas_recibidas__r.N_de_documento__c',
            'Nominas'               => 'N_minas_empleados__r.Name',
            'Area'                  => 'rea__c',
            'DirectorFacturacion'   => 'Director_asignado_facturaci_n__r.Name',
            'ImporteDebe'           => 'Debe__c',
            'ImporteHaber'          => 'Haber__c',
            'Saldo'                 => 'Saldo__c',
            'Check'                 => 'Check__c',
            'Simulacion'            => 'Simulaci_n__c'
        };
        return allowed.containsKey(sortBy) ? allowed.get(sortBy) : 'Fecha_asiento__c';
    }

    private static Boolean isDateSortField(String sortField) {
        return sortField == 'Fecha_asiento__c';
    }

    private static Boolean isDecimalSortField(String sortField) {
        return sortField == 'Debe__c' || sortField == 'Haber__c' || sortField == 'Saldo__c';
    }

    // =========================
    // Paginado + filtros + search + server-side sorting
    // =========================
    @AuraEnabled(cacheable=true)
    public static PageResult getRelatedAccountingEntriesPaged(
        Id gauRecordId,
        Integer pageSize,
        String cursor,
        Date startDate,
        Date endDate,
        String empresaTitular,
        String searchTerm,
        String sortBy,
        String sortDirection
    ) {
        if (gauRecordId == null) {
            PageResult empty = new PageResult();
            empty.rows = new List<AccountingEntryWrapper>();
            empty.nextCursor = null;
            empty.totalSaldo = 0;
            return empty;
        }

        pageSize = (pageSize == null || pageSize <= 0) ? 500 : Math.min(pageSize, 1000);

        // Total saldo (para UI)
        AggregateResult ar = [
            SELECT SUM(Saldo__c) saldo
            FROM Linea_asiento_contable__c
            WHERE Plan__c = :gauRecordId
        ];
        Decimal totalSaldo = (Decimal) ar.get('saldo');
        if (totalSaldo == null) totalSaldo = 0;

        String sortField = resolveSortField(sortBy);
        String sortDir = normalizeSortDirection(sortDirection);

        // Cursor (sortValue|CreatedDateGMT|Id)
        Object cursorSortValue;
        Datetime cursorCreated;
        Id cursorId;

        if (String.isNotBlank(cursor)) {
            List<String> parts = cursor.split('\\|');
            if (parts.size() == 3) {
                try {
                    String rawSort = parts[0];
                    cursorCreated = Datetime.valueOfGmt(parts[1]);
                    cursorId = (Id) parts[2];

                    if (isDateSortField(sortField)) {
                        cursorSortValue = Date.valueOf(rawSort);
                    } else if (isDecimalSortField(sortField)) {
                        cursorSortValue = Decimal.valueOf(rawSort);
                    } else {
                        cursorSortValue = rawSort; // texto (incluye campos de relación)
                    }
                } catch (Exception e) {
                    cursorSortValue = null;
                    cursorCreated = null;
                    cursorId = null;
                }
            }
        }

        // WHERE dinámico
        List<String> whereParts = new List<String>();
        whereParts.add('Plan__c = :gauRecordId');

        if (startDate != null) whereParts.add('Fecha_asiento__c >= :startDate');
        if (endDate != null) whereParts.add('Fecha_asiento__c <= :endDate');
        if (String.isNotBlank(empresaTitular)) whereParts.add('Empresa_titular__c = :empresaTitular');

        // Search (acotada)
        String likeTerm;
        if (String.isNotBlank(searchTerm)) {
            likeTerm = '%' + searchTerm.replaceAll('[%_]', '\\\\$0') + '%';
            whereParts.add('(Name LIKE :likeTerm OR Descripci_n__c LIKE :likeTerm)');
        }

        // Cursor clause keyset según dirección
        if (cursorSortValue != null && cursorCreated != null && cursorId != null) {
            String op = (sortDir == 'ASC') ? '>' : '<';

            // (sortField op cursorSortValue) OR (sortField = cursorSortValue AND CreatedDate > cursorCreated) OR ...
            whereParts.add(
                '(' +
                    sortField + ' ' + op + ' :cursorSortValue ' +
                    'OR (' + sortField + ' = :cursorSortValue AND CreatedDate > :cursorCreated) ' +
                    'OR (' + sortField + ' = :cursorSortValue AND CreatedDate = :cursorCreated AND Id > :cursorId)' +
                ')'
            );
        }

        String soql =
            'SELECT Id, Name, Fecha_asiento__c, Asientos_contable__c, Asientos_contable__r.Name,' +
            ' Descripci_n__c, Debe__c, Haber__c, Saldo__c, Empresa_titular__c,' +
            ' Facturas_emitidas__c, Facturas_emitidas__r.N_factura__c,' +
            ' Facturas_recibidas__c, Facturas_recibidas__r.N_de_documento__c,' +
            ' rea__c, Director_asignado_facturaci_n__c, Director_asignado_facturaci_n__r.Name,' +
            ' N_minas_empleados__c, N_minas_empleados__r.Name, Check__c, Simulaci_n__c, CreatedDate ' +
            'FROM Linea_asiento_contable__c ' +
            'WHERE ' + String.join(whereParts, ' AND ') + ' ' +
            'ORDER BY ' + sortField + ' ' + sortDir + ', CreatedDate ASC, Id ASC ' +
            'LIMIT :pageSize';

        List<Linea_asiento_contable__c> page = Database.query(soql);

        // Map wrapper
        List<AccountingEntryWrapper> rows = new List<AccountingEntryWrapper>();
        for (Linea_asiento_contable__c l : page) {
            AccountingEntryWrapper w = new AccountingEntryWrapper();
            w.Id = l.Id;
            w.AsientoId = l.Asientos_contable__c;
            w.NombreApunte = l.Name;
            w.NombreAsiento = (l.Asientos_contable__r != null) ? l.Asientos_contable__r.Name : null;

            w.FacturaEmitidaId = l.Facturas_emitidas__c;
            w.FacturaEmitida = (l.Facturas_emitidas__r != null) ? l.Facturas_emitidas__r.N_factura__c : null;

            w.FacturaRecibidaId = l.Facturas_recibidas__c;
            w.FacturaRecibida = (l.Facturas_recibidas__r != null) ? l.Facturas_recibidas__r.N_de_documento__c : null;

            w.NominasId = l.N_minas_empleados__c;
            w.Nominas = (l.N_minas_empleados__r != null) ? l.N_minas_empleados__r.Name : null;

            w.DirectorFacturacionId = l.Director_asignado_facturaci_n__c;
            w.DirectorFacturacion = (l.Director_asignado_facturaci_n__r != null) ? l.Director_asignado_facturaci_n__r.Name : null;

            w.Area = l.rea__c;
            w.EmpresaTitular = l.Empresa_titular__c;
            w.Check = l.Check__c;
            w.Simulacion = l.Simulaci_n__c;
            w.FechaAsiento = l.Fecha_asiento__c;
            w.Descripcion = l.Descripci_n__c;
            w.ImporteDebe = l.Debe__c;
            w.ImporteHaber = l.Haber__c;
            w.Saldo = l.Saldo__c;
            w.CreatedDate = l.CreatedDate;

            rows.add(w);
        }

        // nextCursor basado en sortField
        String nextCursor;
        if (!page.isEmpty()) {
            Linea_asiento_contable__c last = page[page.size() - 1];

            String sortVal;
            if (sortField == 'Fecha_asiento__c') sortVal = String.valueOf(last.Fecha_asiento__c);
            else if (sortField == 'Debe__c') sortVal = String.valueOf(last.Debe__c);
            else if (sortField == 'Haber__c') sortVal = String.valueOf(last.Haber__c);
            else if (sortField == 'Saldo__c') sortVal = String.valueOf(last.Saldo__c);
            else if (sortField == 'Name') sortVal = String.valueOf(last.Name);
            else if (sortField == 'Empresa_titular__c') sortVal = String.valueOf(last.Empresa_titular__c);
            else if (sortField == 'rea__c') sortVal = String.valueOf(last.rea__c);
            else if (sortField == 'Check__c') sortVal = String.valueOf(last.Check__c);
            else if (sortField == 'Simulaci_n__c') sortVal = String.valueOf(last.Simulaci_n__c);
            else if (sortField == 'Asientos_contable__r.Name') sortVal = (last.Asientos_contable__r != null) ? String.valueOf(last.Asientos_contable__r.Name) : '';
            else if (sortField == 'Facturas_emitidas__r.N_factura__c') sortVal = (last.Facturas_emitidas__r != null) ? String.valueOf(last.Facturas_emitidas__r.N_factura__c) : '';
            else if (sortField == 'Facturas_recibidas__r.N_de_documento__c') sortVal = (last.Facturas_recibidas__r != null) ? String.valueOf(last.Facturas_recibidas__r.N_de_documento__c) : '';
            else if (sortField == 'N_minas_empleados__r.Name') sortVal = (last.N_minas_empleados__r != null) ? String.valueOf(last.N_minas_empleados__r.Name) : '';
            else if (sortField == 'Director_asignado_facturaci_n__r.Name') sortVal = (last.Director_asignado_facturaci_n__r != null) ? String.valueOf(last.Director_asignado_facturaci_n__r.Name) : '';
            else sortVal = String.valueOf(last.Fecha_asiento__c);

            sortVal = (sortVal != null) ? sortVal.replace('|', ' ') : '';
            nextCursor = sortVal + '|' + String.valueOfGmt(last.CreatedDate) + '|' + String.valueOf(last.Id);
        }

        PageResult pr = new PageResult();
        pr.rows = rows;
        pr.nextCursor = nextCursor;
        pr.totalSaldo = totalSaldo;
        return pr;
    }

    // =========================
    // Picklists
    // =========================
    @AuraEnabled(cacheable=true)
    public static List<String> getEmpresaTitularPicklistValues() {
        List<String> picklistValues = new List<String>();
        Schema.DescribeFieldResult fieldResult = Linea_asiento_contable__c.Empresa_titular__c.getDescribe();
        for (Schema.PicklistEntry val : fieldResult.getPicklistValues()) {
            if (val.isActive()) picklistValues.add(val.getLabel());
        }
        return picklistValues;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getAreaPicklistValues() {
        List<String> picklistValues = new List<String>();
        Schema.DescribeFieldResult fieldResult = Linea_asiento_contable__c.rea__c.getDescribe();
        for (Schema.PicklistEntry val : fieldResult.getPicklistValues()) {
            if (val.isActive()) picklistValues.add(val.getLabel());
        }
        return picklistValues;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getSimulacionPicklistValues() {
        List<String> picklistValues = new List<String>();
        Schema.DescribeFieldResult fieldResult = Linea_asiento_contable__c.Simulaci_n__c.getDescribe();
        for (Schema.PicklistEntry val : fieldResult.getPicklistValues()) {
            if (val.isActive()) picklistValues.add(val.getLabel());
        }
        return picklistValues;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getCheckPicklistValues() {
        List<String> picklistValues = new List<String>();
        Schema.DescribeFieldResult fieldResult = Linea_asiento_contable__c.Check__c.getDescribe();
        for (Schema.PicklistEntry val : fieldResult.getPicklistValues()) {
            if (val.isActive()) picklistValues.add(val.getLabel());
        }
        return picklistValues;
    }

    // =========================
    // Update (FLS safe)
    // =========================
    @AuraEnabled
    public static void updateAccountingEntries(List<Linea_asiento_contable__c> updatedRecords) {
        if (updatedRecords == null || updatedRecords.isEmpty()) return;

        SObjectAccessDecision d = Security.stripInaccessible(AccessType.UPDATABLE, updatedRecords);
        update d.getRecords();
    }
}