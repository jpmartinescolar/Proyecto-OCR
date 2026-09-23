/**
 * Controlador de la intranet: facturas emitidas por el despacho (objeto Facturas__c).
 * `with sharing`: respeta las reglas de compartición y FLS del usuario que consulta.
 */
public with sharing class FacturasDespachoController {

    @AuraEnabled(cacheable=true)
    public static FacturasResult getFacturas(Integer lim, String search) {
        Integer n = (lim == null || lim <= 0 || lim > 500) ? 100 : lim;
        String whereClause = '';
        Map<String, Object> binds = new Map<String, Object>{ 'n' => n };
        if (String.isNotBlank(search)) {
            binds.put('s', '%' + search.trim() + '%');
            whereClause = 'WHERE N_factura__c LIKE :s OR Nombre_del_cliente__c LIKE :s ';
        }

        String soql =
            'SELECT Id, N_factura__c, Fecha_factura__c, Nombre_del_cliente__c, Importe_factura__c, ' +
            'Subtotal__c, IVA__c, Estado__c, Estado_cobro__c, Pendiente__c, Fecha_vencimiento__c ' +
            'FROM Facturas__c ' + whereClause +
            'ORDER BY Fecha_factura__c DESC NULLS LAST, CreatedDate DESC ' +
            'LIMIT :n';

        List<FacturaDTO> items = new List<FacturaDTO>();
        for (Facturas__c f : (List<Facturas__c>) Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE)) {
            items.add(new FacturaDTO(f));
        }

        FacturasResult r = new FacturasResult();
        r.items = items;
        r.total = Database.countQuery('SELECT COUNT() FROM Facturas__c', AccessLevel.USER_MODE);
        return r;
    }

    public class FacturasResult {
        @AuraEnabled public List<FacturaDTO> items;
        @AuraEnabled public Integer total;
    }

    public class FacturaDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public Date fecha;
        @AuraEnabled public String cliente;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Decimal baseImponible;
        @AuraEnabled public Decimal iva;
        @AuraEnabled public String estado;
        @AuraEnabled public String estadoCobro;
        @AuraEnabled public Decimal pendiente;
        @AuraEnabled public Date vencimiento;

        public FacturaDTO(Facturas__c f) {
            this.id = f.Id;
            this.numero = f.N_factura__c;
            this.fecha = f.Fecha_factura__c;
            this.cliente = f.Nombre_del_cliente__c;
            this.importe = f.Importe_factura__c;
            this.baseImponible = f.Subtotal__c;
            this.iva = f.IVA__c;
            this.estado = f.Estado__c;
            this.estadoCobro = f.Estado_cobro__c;
            this.pendiente = f.Pendiente__c;
            this.vencimiento = f.Fecha_vencimiento__c;
        }
    }
}