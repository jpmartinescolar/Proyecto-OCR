/*
*   @Class          :   CI_SummaryBankReceiptsController
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-02-25
*   @Description    :   Class CI_SummaryBankReceiptsController
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-02-25      	    Creation
*   2       Julián Martínez Cordones            2026-03-15              Paginación server-side (keyset) para soporte de volumen alto de registros
*
*/

public class CI_SummaryBankReceiptsController {

    public class BankReceiptWrapper {
        @AuraEnabled public String Id;
        @AuraEnabled public String Name;
        @AuraEnabled public String Estado;
        @AuraEnabled public String Situacion;
        @AuraEnabled public String Concepto;
        @AuraEnabled public String DatosExtra;
        @AuraEnabled public Date FechaMovimiento;
        @AuraEnabled public Decimal Importe;
        @AuraEnabled public Decimal AmountSummary;
        @AuraEnabled public Datetime CreatedDate;
    }

    public class PageResult {
        @AuraEnabled public List<BankReceiptWrapper> rows;
        @AuraEnabled public String nextCursor;
        @AuraEnabled public Decimal totalImporte;
    }

    // -------------------------
    // Sorting helpers (whitelist)
    // -------------------------
    private static String normalizeSortDirection(String dir) {
        return (dir != null && dir.toLowerCase() == 'asc') ? 'ASC' : 'DESC';
    }

    private static String resolveSortField(String sortBy) {
        Map<String, String> allowed = new Map<String, String>{
            'FechaMovimiento' => 'Fecha_movimiento__c',
            'Name'            => 'Name',
            'Concepto'        => 'Concepto__c',
            'DatosExtra'      => 'M_s_datos__c',
            'Importe'         => 'importe__c',
            'AmountSummary'   => 'Saldo_banco__c',
            'Estado'          => 'Estado__c'
        };
        return allowed.containsKey(sortBy) ? allowed.get(sortBy) : 'Fecha_movimiento__c';
    }

    private static Boolean isDateSortField(String sortField) {
        return sortField == 'Fecha_movimiento__c';
    }

    private static Boolean isDecimalSortField(String sortField) {
        return sortField == 'importe__c' || sortField == 'Saldo_banco__c';
    }

    // =========================
    // Paginado + filtros + search + server-side sorting
    // =========================
    @AuraEnabled(cacheable=true)
    public static PageResult getRelatedExtractosPaged(
        Id cuentaContableId,
        Integer pageSize,
        String cursor,
        Date startDate,
        Date endDate,
        String estado,
        String searchTerm,
        String sortBy,
        String sortDirection
    ) {
        if (cuentaContableId == null) {
            PageResult empty = new PageResult();
            empty.rows = new List<BankReceiptWrapper>();
            empty.nextCursor = null;
            empty.totalImporte = 0;
            return empty;
        }

        pageSize = (pageSize == null || pageSize <= 0) ? 500 : Math.min(pageSize, 1000);

        // Total importe (sin filtros adicionales, para el running total en JS)
        AggregateResult ar = [
            SELECT SUM(importe__c) saldo
            FROM Extracto_Bancario__c
            WHERE Cuenta_bancaria_bancos__c = :cuentaContableId
        ];
        Decimal totalImporte = (Decimal) ar.get('saldo');
        if (totalImporte == null) totalImporte = 0;

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
                        cursorSortValue = rawSort;
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
        whereParts.add('Cuenta_bancaria_bancos__c = :cuentaContableId');

        if (startDate != null) whereParts.add('Fecha_movimiento__c >= :startDate');
        if (endDate != null) whereParts.add('Fecha_movimiento__c <= :endDate');
        if (String.isNotBlank(estado)) whereParts.add('Estado__c = :estado');

        String likeTerm;
        if (String.isNotBlank(searchTerm)) {
            likeTerm = '%' + searchTerm.replaceAll('[%_]', '\\\\$0') + '%';
            whereParts.add('(Name LIKE :likeTerm OR Concepto__c LIKE :likeTerm OR M_s_datos__c LIKE :likeTerm)');
        }

        // Cursor clause keyset según dirección
        if (cursorSortValue != null && cursorCreated != null && cursorId != null) {
            String op = (sortDir == 'ASC') ? '>' : '<';
            whereParts.add(
                '(' +
                    sortField + ' ' + op + ' :cursorSortValue ' +
                    'OR (' + sortField + ' = :cursorSortValue AND CreatedDate > :cursorCreated) ' +
                    'OR (' + sortField + ' = :cursorSortValue AND CreatedDate = :cursorCreated AND Id > :cursorId)' +
                ')'
            );
        }

        String soql =
            'SELECT Id, Name, Fecha_movimiento__c, importe__c, Saldo_banco__c, ' +
            'Estado__c, Situaci_n__c, Concepto__c, M_s_datos__c, CreatedDate ' +
            'FROM Extracto_Bancario__c ' +
            'WHERE ' + String.join(whereParts, ' AND ') + ' ' +
            'ORDER BY ' + sortField + ' ' + sortDir + ', CreatedDate ASC, Id ASC ' +
            'LIMIT :pageSize';

        List<Extracto_Bancario__c> page = Database.query(soql);

        List<BankReceiptWrapper> rows = new List<BankReceiptWrapper>();
        for (Extracto_Bancario__c extracto : page) {
            BankReceiptWrapper wrapper = new BankReceiptWrapper();
            wrapper.Id = extracto.Id;
            wrapper.Name = extracto.Name;
            wrapper.Estado = extracto.Estado__c;
            wrapper.Situacion = extracto.Situaci_n__c;
            wrapper.Concepto = extracto.Concepto__c;
            wrapper.DatosExtra = extracto.M_s_datos__c;
            wrapper.FechaMovimiento = extracto.Fecha_movimiento__c;
            wrapper.Importe = extracto.importe__c;
            wrapper.AmountSummary = null; // calculado en JS (running total)
            wrapper.CreatedDate = extracto.CreatedDate;
            rows.add(wrapper);
        }

        // nextCursor basado en sortField
        String nextCursor;
        if (!page.isEmpty()) {
            Extracto_Bancario__c last = page[page.size() - 1];

            String sortVal;
            if (sortField == 'Fecha_movimiento__c') sortVal = String.valueOf(last.Fecha_movimiento__c);
            else if (sortField == 'importe__c') sortVal = String.valueOf(last.importe__c);
            else if (sortField == 'Saldo_banco__c') sortVal = String.valueOf(last.Saldo_banco__c);
            else if (sortField == 'Name') sortVal = String.valueOf(last.Name);
            else if (sortField == 'Concepto__c') sortVal = String.valueOf(last.Concepto__c);
            else if (sortField == 'M_s_datos__c') sortVal = String.valueOf(last.M_s_datos__c);
            else if (sortField == 'Estado__c') sortVal = String.valueOf(last.Estado__c);
            else sortVal = String.valueOf(last.Fecha_movimiento__c);

            sortVal = (sortVal != null) ? sortVal.replace('|', ' ') : '';
            nextCursor = sortVal + '|' + String.valueOfGmt(last.CreatedDate) + '|' + String.valueOf(last.Id);
        }

        PageResult pr = new PageResult();
        pr.rows = rows;
        pr.nextCursor = nextCursor;
        pr.totalImporte = totalImporte;
        return pr;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    @AuraEnabled(cacheable=true)
    public static List<String> getEstadoPicklistValues() {
        List<String> picklistValues = new List<String>();

        Schema.DescribeFieldResult fieldResult = Extracto_Bancario__c.Estado__c.getDescribe();

        List<Schema.PicklistEntry> values = fieldResult.getPicklistValues();

        for (Schema.PicklistEntry val : values) {
            if (val.isActive()) {
                picklistValues.add(val.getLabel());
            }
        }

        return picklistValues;
    }
}