/*
 * Created Date: September 2023
 * Author: Lester Romero Bernardo
 * -----
 * Copyright (c) 2023 Calibre360.io
 * -----
 * HISTORY:
 * Date      	By	Comments
 * ----------	---	---------------------------------------------------------
 */

public class CI_GenerarPedidoSubscripcionHelper {
    public static final String ORDER_STATUS_PENDIENTE   = 'Pendiente';
    public static final String ORDER_STATUS_DRAFT       = 'Draft';

    public static final String SUB_RECURR_FREC_MENSUAL  = 'Mensual';
    public static final String SUB_RECURR_FREC_TRIMEST  = 'Trimestral';
    public static final String SUB_RECURR_FREC_ANUAL    = 'Anual';

    public static void generarPedido(List<contratos_suscripci_n__c> lstSubscripciones){
        List<Order> lstGenerarPedidos = new List<Order>();
        List<OrderItem> lstGenerarLineaPedidos = new List<OrderItem>();

        Pricebook2 pb = [SELECT Id FROM Pricebook2 WHERE isStandard = true LIMIT 1];

        Set<Id> lstProds = new Set<Id>();
        for (contratos_suscripci_n__c iter : lstSubscripciones) {
            lstProds.add(iter.Productos_y_Servicios__c);
        }

        Map<Id, Id> mapStandPEntryByProduct = new Map<Id, Id>();
        for (PricebookEntry pe : [SELECT Id, Product2Id 
                                 FROM PricebookEntry 
                                 WHERE Pricebook2Id =: pb.Id 
                                 AND Product2Id IN: lstProds]) {
            if (!mapStandPEntryByProduct.containsKey(pe.Product2Id)) {
                mapStandPEntryByProduct.put(pe.Product2Id, pe.Id);
            }
        }

        for (contratos_suscripci_n__c iter : lstSubscripciones) {
            Order obj = new Order(
                Estado_Facturaci_n__c               = iter.Estados_de_facturaci_n__c,
                Cuotas_recurrentes__c               = iter.Id,
                Empresa_Titular__c                  = iter.Empresa_Titular__c,
                EffectiveDate                       = Date.today(),
                Pricebook2Id                        = pb.Id,
                AccountId                           = iter.Empresa__c,
                Status                              = ORDER_STATUS_DRAFT, 
                Formas_de_pago__c                   = iter.Forma_de_pago__c, 
                Vencimiento_d_as_primer_plazo__c    = iter.Vencimientos_d_as_primer_plazo__c, 
                N_Plazos__c                         = iter.N_Plazos__c, 
                Empresa_emisora__c                  = iter.Empresa_emisora__c, 
                BillToContactId                     = iter.Contacto_facturaci_n__c, 
                Mandato_SEPA__c                     = iter.Mandato_SEPA__c, 
                BillingCity                         = iter.Empresa__r.BillingCity, 
                BillingCountryCode                  = iter.Empresa__r.BillingCountryCode, 
                BillingPostalCode                   = iter.Empresa__r.BillingPostalCode, 
                BillingStateCode                    = iter.Empresa__r.BillingStateCode, 
                BillingStreet                       = iter.Empresa__r.BillingStreet, 
                CIF__c                              = iter.Empresa__r.CIF__c, 
                Nombre_de_la_Empresa__c             = iter.Empresa__r.Name, 
                Agrupaci_n__c                       = iter.Agrupaci_n__c
            );

            lstGenerarPedidos.add(obj);

            lstGenerarLineaPedidos.add(
                new OrderItem(
                    Order                                       = obj,
                    Product2Id                                  = iter.Productos_y_Servicios__c,
                    Quantity                                    = iter.Unidades__c,
                    UnitPrice                                   = iter.Importe__c,
                    IC_Description__c                           = iter.Descripci_n_l_nea__c,
                    Tipos_de_IVA__c                             = iter.Tipo_de_impuestos__c,
                    Comisionista__c                             = iter.Comisionista__c,
                    Comisi_n__c                                 = iter.Comisi_n__c,
                    PricebookEntryId                            = mapStandPEntryByProduct.get(iter.Productos_y_Servicios__c), 
                    Cuotas_recurrentes__c                       = iter.Id, 
                    Cuenta_contable_IVA_repercutido__c          = iter.Cuenta_contable_IVA_repercutido__c, 
                    Cuota_IVA__c                                = iter.Cuota_IVA__c, 
                    Tipo_comisi_n__c                            = iter.Tipo_comisi_n__c, 
                    Total_comisi_n__c                           = iter.Cuota_comisi_n__c, 
                    Id_Tipo_de_IVA__c                           = iter.Id_Tipo_de_IVA__c, 
                    Comisionista_2__c                           = iter.Comisionista_2__c, 
                    Tipo_comisi_n_2__c                          = iter.Tipo_comisi_n_2__c, 
                    comisi_n_2__c                               = iter.comisi_n_2__c, 
                    Total_comisi_n_2__c                         = iter.Total_comisi_n_2__c, 
                    Operaci_n_vinculada__c                      = iter.Operaci_n_vinculada__c, 
                    Tipo_operaci_n_vinculada__c                 = iter.Tipo_operaci_n_vinculada__c, 
                    Operaci_n_intragrupo__c                     = iter.operaci_n_intragrupo__c
                )
            );

            iter.Pr_xima_fecha_facturaci_n__c = generarFechaRecurrente(iter);
            iter.CI_UltimaFechaPedido__c = Date.today();
        }

        if (!lstGenerarPedidos.isEmpty()) {
            insert lstGenerarPedidos;
        }

        if (!lstGenerarLineaPedidos.isEmpty()) {
            for (OrderItem iter : lstGenerarLineaPedidos) {
                iter.OrderId = iter.Order.Id;
            }
            insert lstGenerarLineaPedidos;
        }

        update lstSubscripciones;
    }

    public static Date generarFechaRecurrente(contratos_suscripci_n__c iter){

        Date response;
        if (!String.isEmpty(iter.Periodicidad__c)) {
            if (iter.Periodicidad__c == SUB_RECURR_FREC_MENSUAL) {
                response = iter.Pr_xima_fecha_facturaci_n__c.addMonths(1);
            } else if (iter.Periodicidad__c == SUB_RECURR_FREC_TRIMEST) {
                response = iter.Pr_xima_fecha_facturaci_n__c.addMonths(3);
            } else if (iter.Periodicidad__c == SUB_RECURR_FREC_ANUAL) {
                response = iter.Pr_xima_fecha_facturaci_n__c.addYears(1);
            }
        }

        return response;
    }
}