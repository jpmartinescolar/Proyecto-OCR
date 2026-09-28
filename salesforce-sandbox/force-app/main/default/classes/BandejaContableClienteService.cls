/**
 * Datos fiscales del cliente (Account) para las pantallas de documento y de empresa.
 *
 * Fuentes en Salesforce (ver docs/diseno.md):
 *  - Perfil fiscal: Contrato_Contabilidad_y_Fiscal__c abierto (régimen de estimación, operador
 *    intracomunitario, situación censal, territorio, consolidación, programa de facturación, código ERP)
 *    y Account (censo VIES manual, ERP contable, grupo empresarial, notas de deducción de vehículos).
 *  - Modelos que presenta: Impuestos__c ("Obligaciones tributarias") en Alta.
 *  - Domicilio fiscal: dirección de facturación de la cuenta.
 *  - Actividades (IAE): actividad_economica__c vigentes (catálogo Epigrafes__c).
 *  - Locales afectos: Actividad_Economica_Local_afecto__c vigentes (+ Local_afecto__c).
 *  - Vinculados: Socios__c (titularidad real) y Administrador__c (órgano de gobierno) vigentes.
 *
 * NO EXISTE en Salesforce (va en pendientes y la pantalla lo muestra como dato de ejemplo):
 *  régimen de IVA (general, recargo de equivalencia, criterio de caja, REAGP), prorrata y su %,
 *  alta en el ROI, turismos del cliente con % de afectación al IVA, plan de cuentas del cliente
 *  (está en Sage vía Skyvia, clave C_digo_ERP__c) y consulta al censo AEAT o a VIES.
 *
 * Cada sección se consulta por separado en USER_MODE: si el usuario no tiene acceso a un objeto,
 * esa sección se marca como no disponible y el resto se muestra igual.
 */
public with sharing class BandejaContableClienteService {

    public class ParDTO {
        @AuraEnabled public String label;
        @AuraEnabled public String valor;
        /** De dónde sale el dato (objeto de Salesforce), para mostrarlo en pantalla */
        @AuraEnabled public String fuente;
        ParDTO(String label, Object valor, String fuente) {
            this.label = label;
            this.valor = valor == null ? null : String.valueOf(valor);
            this.fuente = fuente;
        }
    }

    public class ModeloDTO {
        @AuraEnabled public String modelo;
        @AuraEnabled public String periodicidad;
        @AuraEnabled public String modalidad;
        @AuraEnabled public Date alta;
        @AuraEnabled public String presentacion;
    }

    public class ActividadDTO {
        @AuraEnabled public String epigrafe;
        @AuraEnabled public String descripcion;
        @AuraEnabled public Date alta;
        @AuraEnabled public String seccion;
    }

    public class LocalDTO {
        @AuraEnabled public String direccion;
        @AuraEnabled public String referenciaCatastral;
        @AuraEnabled public Decimal afectacion;
        @AuraEnabled public String epigrafe;
        @AuraEnabled public Date alta;
    }

    public class VinculadoDTO {
        @AuraEnabled public String nombre;
        @AuraEnabled public String nif;
        @AuraEnabled public String relacion;
    }

    public class DatosClienteDTO {
        @AuraEnabled public Id empresaId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String cif;
        @AuraEnabled public String domicilio;
        @AuraEnabled public String localidad;
        @AuraEnabled public String softwareContable;
        @AuraEnabled public List<ParDTO> perfil = new List<ParDTO>();
        @AuraEnabled public List<ModeloDTO> modelos = new List<ModeloDTO>();
        @AuraEnabled public List<ActividadDTO> actividades = new List<ActividadDTO>();
        @AuraEnabled public List<LocalDTO> locales = new List<LocalDTO>();
        @AuraEnabled public List<VinculadoDTO> vinculados = new List<VinculadoDTO>();
        /** Secciones que no se han podido leer (sin acceso o error) */
        @AuraEnabled public List<String> noDisponibles = new List<String>();
        /** Datos que el diseño usa y que no existen en Salesforce */
        @AuraEnabled public List<String> pendientes = new List<String>{
            'Régimen de IVA (general, recargo de equivalencia, criterio de caja, REAGP)',
            'Prorrata (general o especial) y su porcentaje',
            'Alta en el Registro de Operadores Intracomunitarios (ROI)',
            'Turismos del cliente con su % de afectación al IVA',
            'Plan de cuentas del cliente (está en Sage; clave Contrato.C_digo_ERP__c)',
            'Consulta al censo de la AEAT y a VIES (Censo_VIES__c es manual)'
        };
    }

    public static DatosClienteDTO getDatosCliente(Id empresaId) {
        DatosClienteDTO d = new DatosClienteDTO();
        List<Account> cuentas = [
            SELECT Id, Name, CIF__c, BillingStreet, BillingPostalCode, BillingCity, BillingState, Censo_VIES__c,
                   Software_gesti_n_Despachos__c, Deducci_n_IVA_Veh_culos__c, Grupo_Empresarial__r.Name
            FROM Account WHERE Id = :empresaId WITH USER_MODE LIMIT 1
        ];
        if (cuentas.isEmpty()) {
            throw new BandejaContableEmpresasService.BandejaContableException('No se encuentra la empresa o no tienes acceso.');
        }
        Account a = cuentas[0];
        d.empresaId = a.Id;
        d.nombre = a.Name;
        d.cif = a.CIF__c;
        d.domicilio = a.BillingStreet;
        d.localidad = String.join(new List<String>{
            a.BillingPostalCode == null ? '' : a.BillingPostalCode,
            a.BillingCity == null ? '' : a.BillingCity,
            a.BillingState == null ? '' : '(' + a.BillingState + ')'
        }, ' ').normalizeSpace();
        d.softwareContable = a.Software_gesti_n_Despachos__c;

        cargarContrato(d);
        d.perfil.add(new ParDTO('Censo VIES', a.Censo_VIES__c, 'Cuenta (manual)'));
        d.perfil.add(new ParDTO('Grupo empresarial', a.Grupo_Empresarial__r == null ? null : a.Grupo_Empresarial__r.Name, 'Cuenta'));
        if (String.isNotBlank(a.Deducci_n_IVA_Veh_culos__c)) {
            d.perfil.add(new ParDTO('Deducción IVA vehículos', a.Deducci_n_IVA_Veh_culos__c, 'Cuenta (texto libre)'));
        }
        cargarModelos(d);
        cargarActividades(d);
        cargarLocales(d);
        cargarVinculados(d);
        return d;
    }

    private static void cargarContrato(DatosClienteDTO d) {
        try {
            List<Contrato_Contabilidad_y_Fiscal__c> cs = [
                SELECT Tipo_de_regimen__c, Operador_intracomunitario__c, Tipo_de_Contrato__c, Territorio_fiscal__c,
                       Consolidaci_n_fiscal__c, Programa_de_facturaci_n__c, C_digo_ERP__c
                FROM Contrato_Contabilidad_y_Fiscal__c
                WHERE Empresa__c = :d.empresaId AND Estado__c = 'Abierto'
                WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1
            ];
            if (cs.isEmpty()) {
                d.noDisponibles.add('Contrato de contabilidad y fiscal abierto');
                return;
            }
            aplicarContrato(d, cs[0]);
        } catch (Exception e) {
            d.noDisponibles.add('Contrato de contabilidad y fiscal: ' + e.getMessage());
        }
    }

    @TestVisible
    private static void aplicarContrato(DatosClienteDTO d, Contrato_Contabilidad_y_Fiscal__c c) {
        String f = 'Contrato contable y fiscal';
        d.perfil.add(new ParDTO('Régimen (estimación)', c.Tipo_de_regimen__c, f));
        d.perfil.add(new ParDTO('Operador intracomunitario', c.Operador_intracomunitario__c, f));
        d.perfil.add(new ParDTO('Situación censal AEAT', c.Tipo_de_Contrato__c, f + ' (manual)'));
        d.perfil.add(new ParDTO('Territorio fiscal', c.Territorio_fiscal__c, f));
        d.perfil.add(new ParDTO('Consolidación fiscal', c.Consolidaci_n_fiscal__c, f));
        d.perfil.add(new ParDTO('Software facturas emitidas', c.Programa_de_facturaci_n__c, f));
        d.perfil.add(new ParDTO('Código de empresa en el ERP', c.C_digo_ERP__c, f));
    }

    private static void cargarModelos(DatosClienteDTO d) {
        try {
            for (Impuestos__c i : [
                SELECT Modelos__c, Periodicidad__c, Modalidad__c, Fecha_Alta__c, Presentaci_n_del_impuesto__c
                FROM Impuestos__c WHERE Empresa__c = :d.empresaId AND Estado__c = 'Alta'
                WITH USER_MODE ORDER BY Modelos__c LIMIT 60
            ]) {
                d.modelos.add(toModelo(i));
            }
        } catch (Exception e) {
            d.noDisponibles.add('Obligaciones tributarias: ' + e.getMessage());
        }
    }

    @TestVisible
    private static ModeloDTO toModelo(Impuestos__c i) {
        ModeloDTO m = new ModeloDTO();
        m.modelo = i.Modelos__c;
        m.periodicidad = i.Periodicidad__c;
        m.modalidad = i.Modalidad__c;
        m.alta = i.Fecha_Alta__c;
        m.presentacion = i.Presentaci_n_del_impuesto__c;
        return m;
    }

    private static void cargarActividades(DatosClienteDTO d) {
        try {
            for (actividad_economica__c x : [
                SELECT N_Ep_grafe__c, Descripci_n_ep_grafe__c, Fecha_de_Alta__c, Ep_grafes_IAE__r.Seccion__c
                FROM actividad_economica__c WHERE Empresa__c = :d.empresaId AND Fecha_de_baja__c = null
                WITH USER_MODE ORDER BY Fecha_de_Alta__c LIMIT 50
            ]) {
                d.actividades.add(toActividad(x));
            }
        } catch (Exception e) {
            d.noDisponibles.add('Actividades económicas: ' + e.getMessage());
        }
    }

    @TestVisible
    private static ActividadDTO toActividad(actividad_economica__c x) {
        ActividadDTO act = new ActividadDTO();
        act.epigrafe = x.N_Ep_grafe__c;
        act.descripcion = x.Descripci_n_ep_grafe__c;
        act.alta = x.Fecha_de_Alta__c;
        act.seccion = x.Ep_grafes_IAE__r == null ? null : x.Ep_grafes_IAE__r.Seccion__c;
        return act;
    }

    private static void cargarLocales(DatosClienteDTO d) {
        try {
            for (Actividad_Economica_Local_afecto__c x : [
                SELECT afectaci_n__c, C_digo_ep_grafe__c, Fecha_alta__c, Local_afecto__r.Referencia_catastral__c,
                       Local_afecto__r.Localizaci_n__Street__s, Local_afecto__r.Localizaci_n__PostalCode__s,
                       Local_afecto__r.Localizaci_n__City__s
                FROM Actividad_Economica_Local_afecto__c
                WHERE Local_afecto__r.Empresa__c = :d.empresaId AND Fecha_de_baja__c = null
                WITH USER_MODE LIMIT 50
            ]) {
                d.locales.add(toLocal(x));
            }
        } catch (Exception e) {
            d.noDisponibles.add('Locales afectos: ' + e.getMessage());
        }
    }

    @TestVisible
    private static LocalDTO toLocal(Actividad_Economica_Local_afecto__c x) {
        LocalDTO l = new LocalDTO();
        l.direccion = String.join(new List<String>{
            x.Local_afecto__r.Localizaci_n__Street__s == null ? '' : x.Local_afecto__r.Localizaci_n__Street__s + ',',
            x.Local_afecto__r.Localizaci_n__PostalCode__s == null ? '' : x.Local_afecto__r.Localizaci_n__PostalCode__s,
            x.Local_afecto__r.Localizaci_n__City__s == null ? '' : x.Local_afecto__r.Localizaci_n__City__s
        }, ' ').normalizeSpace().removeEnd(',');
        l.referenciaCatastral = x.Local_afecto__r.Referencia_catastral__c;
        l.afectacion = x.afectaci_n__c;
        l.epigrafe = x.C_digo_ep_grafe__c;
        l.alta = x.Fecha_alta__c;
        return l;
    }

    private static void cargarVinculados(DatosClienteDTO d) {
        try {
            for (Socios__c s : [
                SELECT Empresa_Socio__r.Name, DNI__c FROM Socios__c WHERE Empresa__c = :d.empresaId WITH USER_MODE LIMIT 30
            ]) {
                d.vinculados.add(toVinculado(s));
            }
            for (Administrador__c ad : [
                SELECT Cargo__r.Name, Empresacargo__r.Name, Empresacargo__r.CIF__c, Tipo_de_cargo__c
                FROM Administrador__c WHERE Empresa__c = :d.empresaId AND Fecha_Fin__c = null WITH USER_MODE LIMIT 30
            ]) {
                d.vinculados.add(toVinculado(ad));
            }
        } catch (Exception e) {
            d.noDisponibles.add('Vinculados: ' + e.getMessage());
        }
    }

    @TestVisible
    private static VinculadoDTO toVinculado(Socios__c s) {
        VinculadoDTO v = new VinculadoDTO();
        v.nombre = s.Empresa_Socio__r == null ? null : s.Empresa_Socio__r.Name;
        v.nif = s.DNI__c;
        v.relacion = 'Socio / titular real';
        return v;
    }

    @TestVisible
    private static VinculadoDTO toVinculado(Administrador__c ad) {
        VinculadoDTO v = new VinculadoDTO();
        v.nombre = ad.Empresacargo__r != null ? ad.Empresacargo__r.Name : (ad.Cargo__r == null ? null : ad.Cargo__r.Name);
        v.nif = ad.Empresacargo__r == null ? null : ad.Empresacargo__r.CIF__c;
        v.relacion = ad.Tipo_de_cargo__c;
        return v;
    }
}
