/**
 * Controller del componente "Tesorería" (pestaña Medios de pago).
 * Devuelve las cuentas bancarias (Cuenta_bancaria__c, label "Medios de pago")
 * con su saldo acumulado de extractos, y la serie diaria de importes de los
 * extractos de cuentas de tipo "Cuenta bancaria" (todo el histórico).
 */
public with sharing class TesoreriaController {

    // Empresas titulares consideradas "propias"; el resto se agrupa como "Otras"
    private static final Set<String> EMPRESAS_PROPIAS = new Set<String>{
        'Rosetta Advisor Corporate, S.L',
        'Centro de Innovación de Despachos y Pymes, S.L',
        'Inversiones Finariam, S.L',
        'GM Consulting Empresarial, S.L',
        'GM Consulting Abogados, S.L.P',
        'Fundación Bienestar Despachos'
    };

    public class CuentaDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  banco;      // Entidad (fórmula desde Bancos)
        @AuraEnabled public String  empresa;    // Empresa titular
        @AuraEnabled public String  iban;       // IBAN o Descripción
        @AuraEnabled public String  tipo;       // Cuenta bancaria | Tarjetas | Hoja de Caja
        @AuraEnabled public Decimal saldo;      // Suma de importes de sus extractos
        @AuraEnabled public Boolean propia;
        @AuraEnabled public Integer numMovimientos;  // nº total de extractos
        @AuraEnabled public Integer numPendientes;   // extractos sin conciliar
        @AuraEnabled public Date    fechaUltimo;     // fecha del último movimiento
    }

    public class PuntoDTO {
        @AuraEnabled public Date    fecha;
        @AuraEnabled public Decimal importe;    // suma del día (el front acumula)
    }

    public class MediosPagoResult {
        @AuraEnabled public List<CuentaDTO> cuentas;
        @AuraEnabled public List<PuntoDTO>  serie;
    }

    @AuraEnabled
    public static MediosPagoResult getMediosPago() {
        MediosPagoResult res = new MediosPagoResult();

        // Nº de extractos por cuenta
        Map<Id, Integer> movsPorCuenta = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Cuenta_bancaria_bancos__c c, COUNT(Id) n
            FROM Extracto_bancario__c
            GROUP BY Cuenta_bancaria_bancos__c
        ]) {
            movsPorCuenta.put((Id) ar.get('c'), (Integer) ar.get('n'));
        }

        // Nº de extractos sin conciliar por cuenta (en SOQL != incluye los nulos)
        Map<Id, Integer> pendPorCuenta = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Cuenta_bancaria_bancos__c c, COUNT(Id) n
            FROM Extracto_bancario__c
            WHERE Estado__c != 'Conciliado'
            GROUP BY Cuenta_bancaria_bancos__c
        ]) {
            pendPorCuenta.put((Id) ar.get('c'), (Integer) ar.get('n'));
        }

        res.cuentas = new List<CuentaDTO>();
        for (Cuenta_bancaria__c c : [
            SELECT Id, Banco__c, Empresa_titular_medios__c, IBAN__c, Tipo__c, Suma_importes_extracto__c, Fecha_ltima__c
            FROM Cuenta_bancaria__c
            ORDER BY Suma_importes_extracto__c DESC NULLS LAST
        ]) {
            CuentaDTO d = new CuentaDTO();
            d.id      = c.Id;
            d.banco   = c.Banco__c;
            d.empresa = c.Empresa_titular_medios__c;
            d.iban    = c.IBAN__c;
            d.tipo    = c.Tipo__c;
            d.saldo   = (c.Suma_importes_extracto__c == null) ? 0 : c.Suma_importes_extracto__c;
            d.propia  = EMPRESAS_PROPIAS.contains(c.Empresa_titular_medios__c);
            d.numMovimientos = movsPorCuenta.containsKey(c.Id) ? movsPorCuenta.get(c.Id) : 0;
            d.numPendientes = pendPorCuenta.containsKey(c.Id) ? pendPorCuenta.get(c.Id) : 0;
            d.fechaUltimo = c.Fecha_ltima__c;
            res.cuentas.add(d);
        }

        res.serie = serieDiaria(null);
        return res;
    }

    /** Serie diaria de una empresa titular concreta (para el filtro del gráfico) */
    @AuraEnabled
    public static List<PuntoDTO> getSerieEmpresa(String empresaTitular) {
        if (String.isBlank(empresaTitular)) return new List<PuntoDTO>();
        return serieDiaria(new List<String>{ empresaTitular });
    }

    /** Serie diaria de un grupo de empresas titulares (propias u otras) */
    @AuraEnabled
    public static List<PuntoDTO> getSerieGrupo(List<String> empresasTitulares) {
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return new List<PuntoDTO>();
        return serieDiaria(empresasTitulares);
    }

    // =====================================================================
    //  Pestaña Efectos clientes: resumen por empresa titular / forma de pago / estado
    // =====================================================================
    private static final Set<String> ESTADOS_EFC_RESUMEN = new Set<String>{
        'Pendiente', 'Error o bloqueo', 'Abono',
        'Devuelto', 'Reclamación 1ª', 'Reclamación 2ª', 'Monitorio'
    };

    // Empresas titulares excluidas de toda la pestaña de efectos clientes
    // (visión por empresas, antigüedad, KPIs y listado)
    private static final Set<String> EMPRESAS_EFC_EXCLUIDAS = new Set<String>{
        'José Pedro Martín Escolar', 'Emilio José García Benjamín'
    };

    public class EfectoCelDTO {
        @AuraEnabled public String  empresa;
        @AuraEnabled public Boolean propia;
        @AuraEnabled public String  formaPago;
        @AuraEnabled public String  estado;
        @AuraEnabled public Boolean enPlazo;   // vencimiento >= hoy (o sin fecha)
        @AuraEnabled public Boolean negativo;  // importe efecto negativo (columna Abonar)
        @AuraEnabled public Decimal importe;   // suma de Importe efecto
        @AuraEnabled public Integer numero;    // nº de efectos
    }

    @AuraEnabled
    public static List<EfectoCelDTO> getEfectosClientesResumen() {
        List<EfectoCelDTO> out = new List<EfectoCelDTO>();
        Date hoy = Date.today();
        // En plazo: vencimiento hoy o posterior (los sin fecha cuentan como en plazo);
        // el signo del importe se separa para la columna Abonar
        for (AggregateResult ar : [
            SELECT Empresa_titular__c e, Forma_de_pago__c f, Estado__c st,
                   SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND (Fecha_Vencimiento__c >= :hoy OR Fecha_Vencimiento__c = null)
              AND Importe_factura__c >= 0
            GROUP BY Empresa_titular__c, Forma_de_pago__c, Estado__c
        ]) {
            out.add(efcCel(ar, true, false));
        }
        for (AggregateResult ar : [
            SELECT Empresa_titular__c e, Forma_de_pago__c f, Estado__c st,
                   SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND (Fecha_Vencimiento__c >= :hoy OR Fecha_Vencimiento__c = null)
              AND Importe_factura__c < 0
            GROUP BY Empresa_titular__c, Forma_de_pago__c, Estado__c
        ]) {
            out.add(efcCel(ar, true, true));
        }
        // Vencido: vencimiento anterior a hoy
        for (AggregateResult ar : [
            SELECT Empresa_titular__c e, Forma_de_pago__c f, Estado__c st,
                   SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND Fecha_Vencimiento__c < :hoy
              AND Importe_factura__c >= 0
            GROUP BY Empresa_titular__c, Forma_de_pago__c, Estado__c
        ]) {
            out.add(efcCel(ar, false, false));
        }
        for (AggregateResult ar : [
            SELECT Empresa_titular__c e, Forma_de_pago__c f, Estado__c st,
                   SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND Fecha_Vencimiento__c < :hoy
              AND Importe_factura__c < 0
            GROUP BY Empresa_titular__c, Forma_de_pago__c, Estado__c
        ]) {
            out.add(efcCel(ar, false, true));
        }
        return out;
    }

    public class EfcFiltroOpcionesDTO {
        @AuraEnabled public List<String> empresas;
        @AuraEnabled public List<String> estados;
        @AuraEnabled public List<String> formasPago;
        @AuraEnabled public List<String> agrupaciones;
    }

    /** Opciones de los filtros del listado de efectos clientes (todos los estados) */
    @AuraEnabled(cacheable=true)
    public static EfcFiltroOpcionesDTO getEfcFiltroOpciones() {
        EfcFiltroOpcionesDTO o = new EfcFiltroOpcionesDTO();
        o.empresas     = new List<String>();
        for (String v : picklistValues('Reclamaci_n_de_impagados__c', 'Empresa_titular__c')) {
            if (!EMPRESAS_EFC_EXCLUIDAS.contains(v)) o.empresas.add(v);
        }
        o.estados      = picklistValues('Reclamaci_n_de_impagados__c', 'Estado__c');
        o.formasPago   = picklistValues('Reclamaci_n_de_impagados__c', 'Forma_de_pago__c');
        o.agrupaciones = picklistValues('Reclamaci_n_de_impagados__c', 'Agrupaci_n__c');
        return o;
    }

    private static List<String> picklistValues(String objApi, String fieldApi) {
        List<String> out = new List<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return out;
        Schema.DescribeFieldResult fr = t.getDescribe().fields.getMap().get(fieldApi).getDescribe();
        for (Schema.PicklistEntry e : fr.getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    public class EfectoListaDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Date    fechaVencimiento;
        @AuraEnabled public Id      clienteId;
        @AuraEnabled public String  clienteNombre;
        @AuraEnabled public Id      grupoId;
        @AuraEnabled public String  grupoNombre;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public String  estado;
        @AuraEnabled public String  formaPago;
        @AuraEnabled public String  agrupacion;
        @AuraEnabled public Id      facturaId;
        @AuraEnabled public String  facturaNumero;
        @AuraEnabled public Id      mandatoId;
        @AuraEnabled public String  mandatoNumero;
        @AuraEnabled public String  iban;
        @AuraEnabled public Id      planId;
        @AuraEnabled public String  planNumero;
    }

    /** Listado de efectos clientes según los filtros (todos los estados) */
    @AuraEnabled
    public static List<EfectoListaDTO> buscarEfectosClientes(
        String empresaTitular,
        String estado,
        Decimal importe,
        String cliente,
        String formaPago,
        Date vencDesde,
        Date vencHasta,
        List<String> estados,   // filtro múltiple (navegación desde la visión general)
        Date vencIniDesde,      // rango sobre la fecha de vencimiento inicial (tramos de antigüedad)
        Date vencIniHasta,
        String agrupacion,
        String grupoEmpresarial,
        String signo,           // 'positivo' | 'negativo' (columnas Abonar / En plazo / Vencido)
        Boolean vencSinFecha    // con vencDesde: incluye también los efectos sin vencimiento
    ) {
        Set<String> empresasExcluidas = EMPRESAS_EFC_EXCLUIDAS;
        String clienteLike = String.isBlank(cliente) ? null : ('%' + cliente + '%');
        String grupoLike = String.isBlank(grupoEmpresarial) ? null : ('%' + grupoEmpresarial + '%');
        String soql = 'SELECT Id, Name, Fecha_Vencimiento__c, Cliente__c, Cliente__r.Name, '
                    + 'Cliente__r.Grupo_Empresarial__c, Cliente__r.Grupo_Empresarial__r.Name, '
                    + 'Empresa_titular__c, Importe_factura__c, Estado__c, Forma_de_pago__c, Agrupaci_n__c, '
                    + 'Facturas_emitidas__c, Facturas_emitidas__r.Name, Facturas_emitidas__r.N_factura__c, '
                    + 'Mandato_SEPA__c, Mandato_SEPA__r.Name, IBAN_Mandato__c, '
                    + 'Plan_general_contable__c, Plan_general_contable__r.Name '
                    + 'FROM Reclamaci_n_de_impagados__c WHERE Id != null ';
        soql += 'AND Empresa_titular__c NOT IN :empresasExcluidas ';
        if (String.isNotBlank(empresaTitular)) soql += 'AND Empresa_titular__c = :empresaTitular ';
        if (String.isNotBlank(estado))         soql += 'AND Estado__c = :estado ';
        if (estados != null && !estados.isEmpty()) soql += 'AND Estado__c IN :estados ';
        if (importe != null)                   soql += 'AND Importe_factura__c = :importe ';
        if (clienteLike != null)               soql += 'AND Cliente__r.Name LIKE :clienteLike ';
        if (String.isNotBlank(formaPago))      soql += 'AND Forma_de_pago__c = :formaPago ';
        if (vencDesde != null) {
            soql += (vencSinFecha == true)
                ? 'AND (Fecha_Vencimiento__c >= :vencDesde OR Fecha_Vencimiento__c = null) '
                : 'AND Fecha_Vencimiento__c >= :vencDesde ';
        }
        if (vencHasta != null)                 soql += 'AND Fecha_Vencimiento__c <= :vencHasta ';
        if (signo == 'positivo')               soql += 'AND Importe_factura__c >= 0 ';
        if (signo == 'negativo')               soql += 'AND Importe_factura__c < 0 ';
        if (vencIniDesde != null)              soql += 'AND Fecha_de_vencimiento_inicial__c >= :vencIniDesde ';
        if (vencIniHasta != null)              soql += 'AND Fecha_de_vencimiento_inicial__c <= :vencIniHasta ';
        if (String.isNotBlank(agrupacion))     soql += 'AND Agrupaci_n__c = :agrupacion ';
        if (grupoLike != null)                 soql += 'AND Cliente__r.Grupo_Empresarial__r.Name LIKE :grupoLike ';
        soql += 'ORDER BY Fecha_Vencimiento__c ASC NULLS LAST, Name ASC LIMIT 10000';

        List<EfectoListaDTO> out = new List<EfectoListaDTO>();
        for (Reclamaci_n_de_impagados__c r : Database.query(soql)) {
            EfectoListaDTO d = new EfectoListaDTO();
            d.id = r.Id;
            d.numero = r.Name;
            d.fechaVencimiento = r.Fecha_Vencimiento__c;
            d.clienteId = r.Cliente__c;
            d.clienteNombre = (r.Cliente__r == null) ? '' : r.Cliente__r.Name;
            d.grupoId = (r.Cliente__r == null) ? null : r.Cliente__r.Grupo_Empresarial__c;
            d.grupoNombre = (r.Cliente__r != null && r.Cliente__r.Grupo_Empresarial__r != null)
                ? r.Cliente__r.Grupo_Empresarial__r.Name : '';
            d.empresaTitular = r.Empresa_titular__c;
            d.importe = zeroDec(r.Importe_factura__c);
            d.estado = r.Estado__c;
            d.formaPago = r.Forma_de_pago__c;
            d.agrupacion = r.Agrupaci_n__c;
            d.facturaId = r.Facturas_emitidas__c;
            // Nº de factura real; si no lo tiene, el número interno
            d.facturaNumero = (r.Facturas_emitidas__r == null) ? ''
                : (String.isNotBlank(r.Facturas_emitidas__r.N_factura__c)
                    ? r.Facturas_emitidas__r.N_factura__c : r.Facturas_emitidas__r.Name);
            d.mandatoId = r.Mandato_SEPA__c;
            d.mandatoNumero = (r.Mandato_SEPA__r == null) ? '' : r.Mandato_SEPA__r.Name;
            d.iban = r.IBAN_Mandato__c;
            d.planId = r.Plan_general_contable__c;
            d.planNumero = (r.Plan_general_contable__r == null) ? '' : r.Plan_general_contable__r.Name;
            out.add(d);
        }
        return out;
    }

    private static Decimal zeroDec(Decimal v) { return (v == null) ? 0 : v; }

    public class TramoDTO {
        @AuraEnabled public String  clave;     // 0-30 | 31-60 | 61-90 | 91-120 | +120
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Integer numero;
    }

    public class EfcKpisDTO {
        @AuraEnabled public Decimal totalRemesable;
        @AuraEnabled public Integer numRemesables;
        @AuraEnabled public List<TramoDTO> tramos;
    }

    /**
     * KPIs de efectos clientes: total remesable (importe en origen positivo,
     * estado Pendiente, domiciliación bancaria y vencimiento hoy o anterior)
     * y antigüedad del vencido (días desde el vencimiento inicial a hoy, por tramos).
     */
    @AuraEnabled
    public static EfcKpisDTO getEfectosClientesKpis() {
        EfcKpisDTO res = new EfcKpisDTO();
        res.totalRemesable = 0;
        res.numRemesables = 0;
        Date hoyRem = Date.today();
        for (AggregateResult ar : [
            SELECT SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c = 'Pendiente'
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND Forma_de_pago__c = 'Domiciliación bancaria'
              AND Importe_factura__c > 0
              AND Fecha_Vencimiento__c <= :hoyRem
        ]) {
            Decimal imp = (Decimal) ar.get('imp');
            res.totalRemesable = (imp == null) ? 0 : imp;
            res.numRemesables = (Integer) ar.get('n');
        }

        Date hoy = Date.today();
        res.tramos = new List<TramoDTO>{
            tramoEnPlazo(hoy),
            tramoVencido('0-30',   hoy.addDays(-30),  hoy.addDays(-1)),
            tramoVencido('31-60',  hoy.addDays(-60),  hoy.addDays(-31)),
            tramoVencido('61-90',  hoy.addDays(-90),  hoy.addDays(-61)),
            tramoVencido('91-120', hoy.addDays(-120), hoy.addDays(-91)),
            tramoVencido('+120',   null,              hoy.addDays(-121))
        };
        return res;
    }

    public class AntCelDTO {
        @AuraEnabled public String  clave;     // tramo: 0-30 | 31-60 | 61-90 | 91-120 | +120
        @AuraEnabled public String  estado;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Integer numero;
    }

    /** Pendiente por antigüedad (vencimiento inicial) desglosado por estado */
    @AuraEnabled
    public static List<AntCelDTO> getEfectosAntiguedadResumen() {
        Date hoy = Date.today();
        List<AntCelDTO> out = new List<AntCelDTO>();
        antTramoEnPlazo(out, hoy);
        antTramo(out, '0-30',   hoy.addDays(-30),  hoy.addDays(-1));
        antTramo(out, '31-60',  hoy.addDays(-60),  hoy.addDays(-31));
        antTramo(out, '61-90',  hoy.addDays(-90),  hoy.addDays(-61));
        antTramo(out, '91-120', hoy.addDays(-120), hoy.addDays(-91));
        antTramo(out, '+120',   null,              hoy.addDays(-121));
        return out;
    }

    private static void antTramo(List<AntCelDTO> out, String clave, Date desde, Date hasta) {
        List<AggregateResult> ars;
        if (desde == null) {
            ars = [SELECT Estado__c st, SUM(Importe_factura__c) imp, COUNT(Id) n
                   FROM Reclamaci_n_de_impagados__c
                   WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
                     AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
                     AND Fecha_de_vencimiento_inicial__c <= :hasta
                   GROUP BY Estado__c];
        } else {
            ars = [SELECT Estado__c st, SUM(Importe_factura__c) imp, COUNT(Id) n
                   FROM Reclamaci_n_de_impagados__c
                   WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
                     AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
                     AND Fecha_de_vencimiento_inicial__c >= :desde
                     AND Fecha_de_vencimiento_inicial__c <= :hasta
                   GROUP BY Estado__c];
        }
        for (AggregateResult ar : ars) {
            AntCelDTO c = new AntCelDTO();
            c.clave = clave;
            c.estado = (String) ar.get('st');
            Decimal imp = (Decimal) ar.get('imp');
            c.importe = (imp == null) ? 0 : imp;
            c.numero = (Integer) ar.get('n');
            out.add(c);
        }
    }

    /** Celdas del tramo "En plazo": vencimiento inicial hoy o posterior (o sin fecha) */
    private static void antTramoEnPlazo(List<AntCelDTO> out, Date hoy) {
        for (AggregateResult ar : [
            SELECT Estado__c st, SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND (Fecha_de_vencimiento_inicial__c >= :hoy OR Fecha_de_vencimiento_inicial__c = null)
            GROUP BY Estado__c
        ]) {
            AntCelDTO c = new AntCelDTO();
            c.clave = 'EN_PLAZO';
            c.estado = (String) ar.get('st');
            Decimal imp = (Decimal) ar.get('imp');
            c.importe = (imp == null) ? 0 : imp;
            c.numero = (Integer) ar.get('n');
            out.add(c);
        }
    }

    /** Tramo "En plazo" del KPI: todos los efectos del resumen aún no vencidos */
    private static TramoDTO tramoEnPlazo(Date hoy) {
        TramoDTO t = new TramoDTO();
        t.clave = 'EN_PLAZO';
        t.importe = 0;
        t.numero = 0;
        for (AggregateResult ar : [
            SELECT SUM(Importe_factura__c) imp, COUNT(Id) n
            FROM Reclamaci_n_de_impagados__c
            WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
              AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
              AND (Fecha_de_vencimiento_inicial__c >= :hoy OR Fecha_de_vencimiento_inicial__c = null)
        ]) {
            Decimal imp = (Decimal) ar.get('imp');
            t.importe = (imp == null) ? 0 : imp;
            t.numero = (Integer) ar.get('n');
        }
        return t;
    }

    // La antigüedad se calcula sobre la fecha de vencimiento inicial del efecto
    private static TramoDTO tramoVencido(String clave, Date desde, Date hasta) {
        TramoDTO t = new TramoDTO();
        t.clave = clave;
        t.importe = 0;
        t.numero = 0;
        List<AggregateResult> ars;
        if (desde == null) {
            ars = [SELECT SUM(Importe_factura__c) imp, COUNT(Id) n
                   FROM Reclamaci_n_de_impagados__c
                   WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
                     AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
                     AND Fecha_de_vencimiento_inicial__c <= :hasta];
        } else {
            ars = [SELECT SUM(Importe_factura__c) imp, COUNT(Id) n
                   FROM Reclamaci_n_de_impagados__c
                   WHERE Estado__c IN :ESTADOS_EFC_RESUMEN
                     AND Empresa_titular__c NOT IN :EMPRESAS_EFC_EXCLUIDAS
                     AND Fecha_de_vencimiento_inicial__c >= :desde
                     AND Fecha_de_vencimiento_inicial__c <= :hasta];
        }
        for (AggregateResult ar : ars) {
            Decimal imp = (Decimal) ar.get('imp');
            t.importe = (imp == null) ? 0 : imp;
            t.numero = (Integer) ar.get('n');
        }
        return t;
    }

    private static EfectoCelDTO efcCel(AggregateResult ar, Boolean enPlazo, Boolean negativo) {
        EfectoCelDTO c = new EfectoCelDTO();
        c.empresa   = (String) ar.get('e');
        c.propia    = EMPRESAS_PROPIAS.contains(c.empresa);
        c.formaPago = (String) ar.get('f');
        c.estado    = (String) ar.get('st');
        c.enPlazo   = enPlazo;
        c.negativo  = negativo;
        Decimal imp = (Decimal) ar.get('imp');
        c.importe   = (imp == null) ? 0 : imp;
        c.numero    = (Integer) ar.get('n');
        return c;
    }

    // =====================================================================
    //  Conciliación bancaria: movimientos de una cuenta y efectos candidatos
    // =====================================================================
    public class ConcMovDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;    // Nº de extracto
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  concepto;
        @AuraEnabled public String  masDatos;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public String  estado;    // Pendiente | Conciliado
        @AuraEnabled public Id      pdfId;     // ContentDocument del PDF adjunto (si lo hay)
    }

    public class ConciliacionCuentaDTO {
        @AuraEnabled public List<ConcMovDTO> movimientos;  // orden cronológico ascendente
        @AuraEnabled public Datetime ultimaSync;           // última modificación de un extracto
        @AuraEnabled public Id     cuentaContableId;       // Plan general contable de la cuenta bancaria
        @AuraEnabled public String cuentaContableNumero;
        @AuraEnabled public String cuentaContableTitulo;
    }

    // Cuenta contable de los ingresos de remesas (movimientos FATIR de Caixa)
    private static final String CUENTA_REMESA_EFECTOS = '4310000001';

    public class RemesaDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Date    fechaRemesa;
        @AuraEnabled public Decimal importeRemesa;
        @AuraEnabled public Decimal totalOtros;
        @AuraEnabled public Decimal totalCaixa;
        @AuraEnabled public Decimal pendienteIngreso;
    }

    /**
     * Remesas con pendiente de ingreso de la empresa titular de la cuenta,
     * para conciliar los movimientos FATIR (ingresos de remesas de Caixa).
     */
    @AuraEnabled
    public static List<RemesaDTO> getRemesasPendientes(Id cuentaId) {
        List<RemesaDTO> out = new List<RemesaDTO>();
        if (cuentaId == null) return out;
        Cuenta_bancaria__c cb = [
            SELECT Empresa_titular_medios__c FROM Cuenta_bancaria__c WHERE Id = :cuentaId LIMIT 1
        ];
        for (CI_Remesa__c r : [
            SELECT Id, Name, CI_FechaRemesa__c, CI_ImporteRemesa__c,
                   Total_Otros__c, Total_Caixa__c, Pendiente_ingreso__c
            FROM CI_Remesa__c
            WHERE Pendiente_ingreso__c > 0
              AND CI_EmpresaTitular__c = :cb.Empresa_titular_medios__c
            ORDER BY CI_FechaRemesa__c DESC
            LIMIT 500
        ]) {
            RemesaDTO d = new RemesaDTO();
            d.id = r.Id;
            d.numero = r.Name;
            d.fechaRemesa = r.CI_FechaRemesa__c;
            d.importeRemesa = r.CI_ImporteRemesa__c;
            d.totalOtros = r.Total_Otros__c;
            d.totalCaixa = r.Total_Caixa__c;
            d.pendienteIngreso = r.Pendiente_ingreso__c;
            out.add(d);
        }
        return out;
    }

    /** Movimientos del extracto bancario de una cuenta (el front acumula el saldo) */
    @AuraEnabled
    public static ConciliacionCuentaDTO getExtractosCuenta(Id cuentaId) {
        ConciliacionCuentaDTO res = new ConciliacionCuentaDTO();
        res.movimientos = new List<ConcMovDTO>();
        if (cuentaId == null) return res;
        // Cuenta contable de la cuenta bancaria (línea del banco en la propuesta de asiento)
        for (Cuenta_bancaria__c cb : [
            SELECT Cuenta_contable__c, Cuenta_contable__r.Name, T_tulo_cuenta_contable__c
            FROM Cuenta_bancaria__c WHERE Id = :cuentaId LIMIT 1
        ]) {
            res.cuentaContableId     = cb.Cuenta_contable__c;
            res.cuentaContableNumero = (cb.Cuenta_contable__r == null) ? '' : cb.Cuenta_contable__r.Name;
            res.cuentaContableTitulo = cb.T_tulo_cuenta_contable__c;
        }
        for (Extracto_bancario__c e : [
            SELECT Id, Name, Fecha_movimiento__c, Concepto__c, M_s_datos__c, importe__c, Estado__c, LastModifiedDate
            FROM Extracto_bancario__c
            WHERE Cuenta_bancaria_bancos__c = :cuentaId
            ORDER BY Fecha_movimiento__c ASC NULLS FIRST, CreatedDate ASC
            LIMIT 10000
        ]) {
            ConcMovDTO d = new ConcMovDTO();
            d.id       = e.Id;
            d.numero   = e.Name;
            d.fecha    = e.Fecha_movimiento__c;
            d.concepto = e.Concepto__c;
            d.masDatos = e.M_s_datos__c;
            d.importe  = zeroDec(e.importe__c);
            d.estado   = e.Estado__c;
            res.movimientos.add(d);
            if (res.ultimaSync == null || e.LastModifiedDate > res.ultimaSync) {
                res.ultimaSync = e.LastModifiedDate;
            }
        }

        // PDF adjunto de cada movimiento (el más reciente si hay varios).
        // ContentDocumentLink devuelve resultados incompletos con listas IN muy
        // grandes, así que se consulta por lotes de 1000 ids.
        if (!res.movimientos.isEmpty()) {
            List<Id> ids = new List<Id>();
            for (ConcMovDTO d : res.movimientos) ids.add(d.id);
            Map<Id, Id> pdfPorMov = new Map<Id, Id>();
            Integer lote = 1000;
            for (Integer i = 0; i < ids.size(); i += lote) {
                Set<Id> chunk = new Set<Id>();
                for (Integer j = i; j < Math.min(i + lote, ids.size()); j++) chunk.add(ids[j]);
                for (ContentDocumentLink l : [
                    SELECT LinkedEntityId, ContentDocumentId, ContentDocument.FileType
                    FROM ContentDocumentLink
                    WHERE LinkedEntityId IN :chunk
                    ORDER BY SystemModstamp DESC
                ]) {
                    if (l.ContentDocument.FileType != 'PDF') continue;
                    if (!pdfPorMov.containsKey(l.LinkedEntityId)) pdfPorMov.put(l.LinkedEntityId, l.ContentDocumentId);
                }
            }
            for (ConcMovDTO d : res.movimientos) d.pdfId = pdfPorMov.get(d.id);
        }
        return res;
    }

    /**
     * Enlaces públicos (ContentDistribution) de los PDFs adjuntos, en bloque:
     * reutiliza los que ya existen y crea los que falten. El front los usa como
     * href reales, así el navegador nunca bloquea la pestaña nueva.
     */
    @AuraEnabled
    public static Map<Id, String> getPdfPublicUrls(List<Id> contentDocumentIds) {
        Map<Id, String> out = new Map<Id, String>();
        if (contentDocumentIds == null || contentDocumentIds.isEmpty()) return out;
        List<ContentVersion> versiones = [
            SELECT Id, Title, ContentDocumentId FROM ContentVersion
            WHERE ContentDocumentId IN :contentDocumentIds AND IsLatest = true
        ];
        if (versiones.isEmpty()) return out;
        Set<Id> versionIds = new Set<Id>();
        for (ContentVersion cv : versiones) versionIds.add(cv.Id);

        Map<Id, String> urlPorVersion = new Map<Id, String>();
        for (ContentDistribution cd : [
            SELECT ContentVersionId, DistributionPublicUrl FROM ContentDistribution
            WHERE ContentVersionId IN :versionIds
            ORDER BY CreatedDate ASC
        ]) {
            urlPorVersion.put(cd.ContentVersionId, cd.DistributionPublicUrl);
        }

        List<ContentDistribution> nuevas = new List<ContentDistribution>();
        for (ContentVersion cv : versiones) {
            if (!urlPorVersion.containsKey(cv.Id)) {
                nuevas.add(new ContentDistribution(
                    Name = cv.Title,
                    ContentVersionId = cv.Id,
                    PreferencesAllowViewInBrowser = true,
                    PreferencesAllowOriginalDownload = true,
                    PreferencesNotifyOnVisit = false));
            }
        }
        if (!nuevas.isEmpty()) {
            try {
                insert nuevas;
            } catch (DmlException ex) {
                throw new AuraHandledException('No se pudieron crear los enlaces públicos: ' + ex.getDmlMessage(0));
            }
            for (ContentDistribution cd : [
                SELECT ContentVersionId, DistributionPublicUrl FROM ContentDistribution WHERE Id IN :nuevas
            ]) {
                urlPorVersion.put(cd.ContentVersionId, cd.DistributionPublicUrl);
            }
        }
        for (ContentVersion cv : versiones) {
            String u = urlPorVersion.get(cv.Id);
            if (u != null) out.put(cv.ContentDocumentId, u);
        }
        return out;
    }

    public class ConcEfectoDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Date    fechaFactura;      // de la factura emitida
        @AuraEnabled public Date    fechaVencimiento;
        @AuraEnabled public Id      clienteId;
        @AuraEnabled public String  clienteNombre;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public String  estado;
        @AuraEnabled public Id      facturaId;
        @AuraEnabled public String  facturaNumero;
        @AuraEnabled public Id      planId;        // Plan general contable del efecto
        @AuraEnabled public String  planNumero;
        @AuraEnabled public String  tipo;          // 'Cliente' | 'Proveedor'
    }

    // Estados de efecto admitidos al conciliar un ingreso del banco
    private static final Set<String> ESTADOS_CONC_INGRESO = new Set<String>{
        'Pendiente', 'Error o bloqueo', 'Devuelto',
        'Reclamación 1ª', 'Reclamación 2ª', 'Monitorio', 'Abono'
    };
    // Estados admitidos al conciliar un pago: devoluciones de remesados
    // ('Pagado', que en pantalla se muestra como Remesado) y abonos transferidos
    private static final Set<String> ESTADOS_CONC_PAGO = new Set<String>{
        'Pagado', 'Transferido'
    };
    // Estados de efectos de proveedores EXCLUIDOS al conciliar (ingresos y pagos)
    private static final Set<String> ESTADOS_PROV_EXCLUIDOS = new Set<String>{
        'Tarjeta', 'Transferido', 'Conciliado'
    };

    /**
     * Efectos candidatos para conciliar un movimiento del banco: por importe
     * (en positivo o negativo) y/o por texto (nombre, NIF o nº de factura).
     * Clientes: en ingresos solo estados pendientes de cobro; en pagos solo
     * Pagado (remesado) o Transferido. Proveedores: en ingresos y pagos se
     * excluyen Tarjeta, Transferido y Conciliado. El tipoEfectos permite
     * limitar a 'cliente' o 'proveedor' (null o 'auto' = ambos). Con la
     * cuenta bancaria informada, solo salen efectos de su misma empresa
     * titular (Empresa_titular_medios__c de la cuenta).
     */
    @AuraEnabled
    public static List<ConcEfectoDTO> buscarEfectosConciliacion(Decimal importe, String texto, Boolean esIngreso, Boolean esPago, String tipoEfectos, Id cuentaId) {
        List<ConcEfectoDTO> out = new List<ConcEfectoDTO>();
        if (importe == null && String.isBlank(texto)) return out;
        String textoLike = String.isBlank(texto) ? null : ('%' + texto + '%');
        Decimal importeNeg = (importe == null) ? null : -importe;
        Set<String> estadosIngreso = ESTADOS_CONC_INGRESO;
        Set<String> estadosPago = ESTADOS_CONC_PAGO;
        Boolean incluirClientes    = (tipoEfectos != 'proveedor');
        Boolean incluirProveedores = (tipoEfectos != 'cliente');
        String titular = null;
        if (cuentaId != null) {
            List<Cuenta_bancaria__c> cbs = [
                SELECT Empresa_titular_medios__c FROM Cuenta_bancaria__c WHERE Id = :cuentaId LIMIT 1
            ];
            if (!cbs.isEmpty()) titular = cbs[0].Empresa_titular_medios__c;
        }
        String soql = 'SELECT Id, Name, Importe_factura__c, Fecha_Vencimiento__c, Estado__c, Empresa_titular__c, '
                    + 'Cliente__c, Cliente__r.Name, '
                    + 'Facturas_emitidas__c, Facturas_emitidas__r.Name, Facturas_emitidas__r.N_factura__c, '
                    + 'Facturas_emitidas__r.Fecha_factura__c, '
                    + 'Plan_general_contable__c, Plan_general_contable__r.Name '
                    + 'FROM Reclamaci_n_de_impagados__c WHERE Id != null ';
        // El importe casa en positivo y en negativo (devoluciones y abonos)
        if (importe != null)   soql += 'AND (Importe_factura__c = :importe OR Importe_factura__c = :importeNeg) ';
        if (textoLike != null) soql += 'AND (Cliente__r.Name LIKE :textoLike OR Cliente__r.CIF__c LIKE :textoLike '
                                     + 'OR Facturas_emitidas__r.N_factura__c LIKE :textoLike OR Name LIKE :textoLike) ';
        if (esIngreso == true) soql += 'AND Estado__c IN :estadosIngreso ';
        if (esPago == true)    soql += 'AND Estado__c IN :estadosPago ';
        if (titular != null)   soql += 'AND Empresa_titular__c = :titular ';
        soql += 'ORDER BY Fecha_Vencimiento__c ASC NULLS LAST, Name ASC LIMIT 200';

        if (incluirClientes) {
            for (Reclamaci_n_de_impagados__c r : Database.query(soql)) {
                out.add(mapConcEfecto(r));
            }
        }

        // Efectos de proveedores: en ingresos y pagos se excluyen los que ya
        // están en Tarjeta, Transferido o Conciliado
        if (incluirProveedores) {
            Set<String> excluidosProv = ESTADOS_PROV_EXCLUIDOS;
            String soqlProv = 'SELECT Id, Name, Importe_efecto__c, Fecha_vencimiento__c, Fecha_factura__c, Estado__c, '
                            + 'Empresa_titular__c, Empresa__c, Empresa__r.Name, Empresa__r.CIF__c, '
                            + 'Empresa__r.Cuenta_contable_proveedor__c, Empresa__r.Cuenta_contable_proveedor__r.Name, '
                            + 'Facturas_recibidas__c, N_factura_recibida__c, '
                            + 'Plan_general_contable__c, Plan_general_contable__r.Name '
                            + 'FROM Efectos_proveedores__c WHERE Id != null ';
            if (esIngreso == true || esPago == true) {
                soqlProv += 'AND (Estado__c NOT IN :excluidosProv OR Estado__c = null) ';
            }
            if (importe != null)   soqlProv += 'AND (Importe_efecto__c = :importe OR Importe_efecto__c = :importeNeg) ';
            if (textoLike != null) soqlProv += 'AND (Empresa__r.Name LIKE :textoLike OR Empresa__r.CIF__c LIKE :textoLike '
                                             + 'OR N_factura_recibida__c LIKE :textoLike OR Name LIKE :textoLike) ';
            if (titular != null)   soqlProv += 'AND Empresa_titular__c = :titular ';
            soqlProv += 'ORDER BY Fecha_vencimiento__c ASC NULLS LAST, Name ASC LIMIT 200';
            for (Efectos_proveedores__c p : Database.query(soqlProv)) {
                out.add(mapConcEfectoProv(p));
            }
        }
        return out;
    }

    private static ConcEfectoDTO mapConcEfectoProv(Efectos_proveedores__c p) {
        ConcEfectoDTO d = new ConcEfectoDTO();
        d.id = p.Id;
        d.numero = p.Name;
        d.fechaFactura = p.Fecha_factura__c;
        d.fechaVencimiento = p.Fecha_vencimiento__c;
        d.clienteId = p.Empresa__c;
        d.clienteNombre = (p.Empresa__r == null) ? '' : p.Empresa__r.Name;
        d.empresaTitular = p.Empresa_titular__c;
        d.importe = zeroDec(p.Importe_efecto__c);
        d.estado = p.Estado__c;
        d.facturaId = p.Facturas_recibidas__c;
        d.facturaNumero = String.isBlank(p.N_factura_recibida__c) ? '' : p.N_factura_recibida__c;
        // La cuenta contable del asiento es la "Cuenta contable proveedor" de la
        // empresa; si no la tiene informada, la del propio efecto
        if (p.Empresa__r != null && p.Empresa__r.Cuenta_contable_proveedor__c != null) {
            d.planId = p.Empresa__r.Cuenta_contable_proveedor__c;
            d.planNumero = (p.Empresa__r.Cuenta_contable_proveedor__r == null) ? ''
                : p.Empresa__r.Cuenta_contable_proveedor__r.Name;
        } else {
            d.planId = p.Plan_general_contable__c;
            d.planNumero = (p.Plan_general_contable__r == null) ? '' : p.Plan_general_contable__r.Name;
        }
        d.tipo = 'Proveedor';
        return d;
    }

    /** Todos los efectos de un cliente (todos los estados), para la subvista del panel */
    @AuraEnabled
    public static List<ConcEfectoDTO> getEfectosDeCliente(Id clienteId) {
        List<ConcEfectoDTO> out = new List<ConcEfectoDTO>();
        if (clienteId == null) return out;
        for (Reclamaci_n_de_impagados__c r : [
            SELECT Id, Name, Importe_factura__c, Fecha_Vencimiento__c, Estado__c, Empresa_titular__c,
                   Cliente__c, Cliente__r.Name,
                   Facturas_emitidas__c, Facturas_emitidas__r.Name, Facturas_emitidas__r.N_factura__c,
                   Facturas_emitidas__r.Fecha_factura__c,
                   Plan_general_contable__c, Plan_general_contable__r.Name
            FROM Reclamaci_n_de_impagados__c
            WHERE Cliente__c = :clienteId
            ORDER BY Fecha_Vencimiento__c ASC NULLS LAST, Name ASC
            LIMIT 500
        ]) {
            out.add(mapConcEfecto(r));
        }
        return out;
    }

    /** Todos los efectos de proveedores de una empresa (todos los estados), para la subvista */
    @AuraEnabled
    public static List<ConcEfectoDTO> getEfectosDeProveedor(Id empresaId) {
        List<ConcEfectoDTO> out = new List<ConcEfectoDTO>();
        if (empresaId == null) return out;
        for (Efectos_proveedores__c p : [
            SELECT Id, Name, Importe_efecto__c, Fecha_vencimiento__c, Fecha_factura__c, Estado__c,
                   Empresa_titular__c, Empresa__c, Empresa__r.Name,
                   Empresa__r.Cuenta_contable_proveedor__c, Empresa__r.Cuenta_contable_proveedor__r.Name,
                   Facturas_recibidas__c, N_factura_recibida__c,
                   Plan_general_contable__c, Plan_general_contable__r.Name
            FROM Efectos_proveedores__c
            WHERE Empresa__c = :empresaId
            ORDER BY Fecha_vencimiento__c ASC NULLS LAST, Name ASC
            LIMIT 500
        ]) {
            out.add(mapConcEfectoProv(p));
        }
        return out;
    }

    private static ConcEfectoDTO mapConcEfecto(Reclamaci_n_de_impagados__c r) {
        ConcEfectoDTO d = new ConcEfectoDTO();
        d.id = r.Id;
        d.numero = r.Name;
        d.fechaFactura = (r.Facturas_emitidas__r == null) ? null : r.Facturas_emitidas__r.Fecha_factura__c;
        d.fechaVencimiento = r.Fecha_Vencimiento__c;
        d.clienteId = r.Cliente__c;
        d.clienteNombre = (r.Cliente__r == null) ? '' : r.Cliente__r.Name;
        d.empresaTitular = r.Empresa_titular__c;
        d.importe = zeroDec(r.Importe_factura__c);
        d.estado = r.Estado__c;
        d.facturaId = r.Facturas_emitidas__c;
        // Nº de factura real; si no lo tiene, el número interno
        d.facturaNumero = (r.Facturas_emitidas__r == null) ? ''
            : (String.isNotBlank(r.Facturas_emitidas__r.N_factura__c)
                ? r.Facturas_emitidas__r.N_factura__c : r.Facturas_emitidas__r.Name);
        d.planId = r.Plan_general_contable__c;
        d.planNumero = (r.Plan_general_contable__r == null) ? '' : r.Plan_general_contable__r.Name;
        d.tipo = 'Cliente';
        return d;
    }

    public class ConcLineaDTO {
        @AuraEnabled public Id      id;             // Conciliacion_bancaria__c
        @AuraEnabled public String  numero;         // Nº de la conciliación
        @AuraEnabled public Id      cuentaId;       // Plan general contable
        @AuraEnabled public String  cuentaNumero;
        @AuraEnabled public String  cuentaTitulo;   // título de la cuenta contable
        @AuraEnabled public String  nombreCuenta;
        @AuraEnabled public Decimal debe;           // Importe__c
        @AuraEnabled public Decimal haber;          // Haber__c
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Id      efectoId;       // efecto de cliente conciliado
        @AuraEnabled public String  efectoNumero;
        @AuraEnabled public String  efectoEstado;
        @AuraEnabled public Id      efectoProvId;   // efecto de proveedor conciliado
        @AuraEnabled public String  efectoProvNumero;
        @AuraEnabled public Decimal efectoImporte;
        @AuraEnabled public Date    fechaFactura;
        @AuraEnabled public Date    fechaVencimiento;
        @AuraEnabled public String  clienteNombre;
        @AuraEnabled public String  facturaNumero;
        @AuraEnabled public Id      remesaId;       // remesa conciliada (movimientos FATIR)
        @AuraEnabled public String  remesaNumero;
    }

    /**
     * Crea un movimiento manual del extracto bancario asociado a la cuenta.
     * El importe llega siempre en positivo: se guarda tal cual si es un ingreso
     * y en negativo si es un pago. Si llega un fichero (base64), se adjunta
     * al registro recién creado.
     */
    @AuraEnabled
    public static Id crearMovimientoBanco(Id cuentaId, Date fecha, String concepto, String masDatos,
                                          Decimal importe, String tipo,
                                          String nombreFichero, String ficheroBase64) {
        if (cuentaId == null) throw new AuraHandledException('Falta la cuenta bancaria.');
        if (fecha == null) throw new AuraHandledException('Falta la fecha del movimiento.');
        if (String.isBlank(concepto)) throw new AuraHandledException('Falta el concepto.');
        if (importe == null || importe <= 0) throw new AuraHandledException('El importe debe ser un número positivo.');
        Decimal imp = (tipo == 'ingreso') ? importe : -importe;
        Extracto_bancario__c e = new Extracto_bancario__c(
            Cuenta_bancaria_bancos__c = cuentaId,
            Fecha_movimiento__c = fecha,
            Concepto__c = concepto,
            M_s_datos__c = masDatos,
            importe__c = imp,
            Estado__c = 'Pendiente'
        );
        try {
            insert e;
            if (String.isNotBlank(ficheroBase64) && String.isNotBlank(nombreFichero)) {
                insert new ContentVersion(
                    Title = nombreFichero.contains('.')
                        ? nombreFichero.substringBeforeLast('.') : nombreFichero,
                    PathOnClient = nombreFichero,
                    VersionData = EncodingUtil.base64Decode(ficheroBase64),
                    FirstPublishLocationId = e.Id   // lo enlaza directamente al extracto
                );
            }
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al guardar: ' + ex.getDmlMessage(0));
        }
        return e.Id;
    }

    /**
     * Concilia un movimiento pendiente: crea un registro de Conciliación bancaria
     * por cada efecto seleccionado (cuenta contable del efecto, debe si su importe
     * es negativo / haber si es positivo, y el nº de factura como descripción) y
     * marca el extracto como Conciliado con su tipo (Cobro si el importe del banco
     * es positivo, Pago si es negativo). Al pasar a Conciliado, el flow de la org
     * "Extracto bancario. Conciliado" crea el asiento contable (canal 001 General,
     * fecha del movimiento, empresa titular de la cuenta) con sus apuntes.
     */
    public class CuentasSeguroDTO {
        @AuraEnabled public Id cuentaSeguroId;          // 6250000000
        @AuraEnabled public String cuentaSeguroNumero;
        @AuraEnabled public Id cuentaPeriodificacionId; // 4802000000
        @AuraEnabled public String cuentaPeriodificacionNumero;
    }

    /** Cuentas fijas del asiento de seguro periodificado, localizadas por su número */
    @AuraEnabled
    public static CuentasSeguroDTO getCuentasSeguro() {
        CuentasSeguroDTO d = new CuentasSeguroDTO();
        for (Plan_general_contable__c p : [
            SELECT Id, Name FROM Plan_general_contable__c
            WHERE Name IN ('6250000000', '4802000000')
        ]) {
            if (p.Name == '6250000000') { d.cuentaSeguroId = p.Id; d.cuentaSeguroNumero = p.Name; }
            else { d.cuentaPeriodificacionId = p.Id; d.cuentaPeriodificacionNumero = p.Name; }
        }
        if (d.cuentaSeguroId == null || d.cuentaPeriodificacionId == null) {
            throw new AuraHandledException('No se encontraron las cuentas 6250000000 y 4802000000 en el plan contable.');
        }
        return d;
    }

    public class LineaManualDTO {
        @AuraEnabled public Id      cuentaId;      // Plan general contable
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public String  descripcion;
    }

    @AuraEnabled
    public static Id conciliarMovimiento(Id extractoId, List<Id> efectoIds, List<Id> efectoProvIds, String lineasManualesJson, Id remesaId) {
        if (extractoId == null) throw new AuraHandledException('Falta el movimiento del banco.');
        // Las líneas manuales llegan como JSON: la deserialización directa de
        // Aura dejaba los campos del DTO a null
        List<LineaManualDTO> lineasManuales = String.isBlank(lineasManualesJson)
            ? null
            : (List<LineaManualDTO>) JSON.deserialize(lineasManualesJson, List<LineaManualDTO>.class);
        Boolean hayClientes = (efectoIds != null && !efectoIds.isEmpty());
        Boolean hayProveedores = (efectoProvIds != null && !efectoProvIds.isEmpty());
        Boolean hayManuales = (lineasManuales != null && !lineasManuales.isEmpty());
        Boolean hayRemesa = (remesaId != null);
        // Se permite conciliar sin efectos (solo el asiento con las líneas
        // manuales o la remesa de un FATIR), pero nunca sin nada: eso solo ocurre
        // cuando el navegador ejecuta una versión antigua del componente
        if (!hayClientes && !hayProveedores && !hayManuales && !hayRemesa) {
            throw new AuraHandledException('No ha llegado ninguna línea para conciliar. '
                + 'Recarga la página (Ctrl+Mayús+R) para actualizar el componente e inténtalo de nuevo.');
        }
        Extracto_bancario__c ext = [
            SELECT Id, importe__c, Estado__c
            FROM Extracto_bancario__c WHERE Id = :extractoId LIMIT 1
        ];
        if (ext.Estado__c == 'Conciliado') throw new AuraHandledException('El movimiento ya está conciliado.');

        // La validación "Diferencia_en_contrapartida" del extracto exige que la
        // COLUMNA de contrapartida sume el importe del banco: en un ingreso todo
        // va al Haber (los abonos en negativo) y en un pago todo al Debe, tal y
        // como guardan las conciliaciones que vienen de Sage.
        Boolean esIngresoMov = zeroDec(ext.importe__c) >= 0;
        List<Conciliacion_bancaria__c> lineas = new List<Conciliacion_bancaria__c>();
        if (hayClientes)
        for (Reclamaci_n_de_impagados__c r : [
            SELECT Id, Name, Importe_factura__c, Plan_general_contable__c,
                   Facturas_emitidas__r.Name, Facturas_emitidas__r.N_factura__c
            FROM Reclamaci_n_de_impagados__c WHERE Id IN :efectoIds
        ]) {
            Decimal imp = zeroDec(r.Importe_factura__c);
            String factura = (r.Facturas_emitidas__r == null) ? r.Name
                : (String.isNotBlank(r.Facturas_emitidas__r.N_factura__c)
                    ? r.Facturas_emitidas__r.N_factura__c : r.Facturas_emitidas__r.Name);
            // Fecha extracto, empresa titular, tipo (Cobro/Pago) e importe
            // contabilidad son fórmulas: se calculan solos desde el extracto
            Conciliacion_bancaria__c c = new Conciliacion_bancaria__c(
                Extracto_bancario__c = extractoId,
                Efectos_clientes__c = r.Id,
                Cuenta_contable__c = r.Plan_general_contable__c,
                // En los ingresos el apunte lleva "Ingreso Fra." delante del nº de factura
                Descripci_n__c = (esIngresoMov ? 'Ingreso Fra. ' : '') + factura
            );
            // Ingreso: Haber con signo (los abonos en negativo netean la columna).
            // Pago: Debe en valor absoluto, como las conciliaciones de Sage
            if (esIngresoMov) c.Haber__c = imp; else c.Importe__c = imp.abs();
            lineas.add(c);
        }

        // Efectos de proveedores seleccionados (devoluciones en ingresos, etc.)
        if (hayProveedores)
        for (Efectos_proveedores__c p : [
            SELECT Id, Name, Importe_efecto__c, N_factura_recibida__c, Plan_general_contable__c,
                   Empresa__r.Cuenta_contable_proveedor__c
            FROM Efectos_proveedores__c WHERE Id IN :efectoProvIds
        ]) {
            // El efecto de proveedor computa con signo contrario: positivo = sale
            // dinero, abono (negativo) = entra dinero
            Decimal imp = -zeroDec(p.Importe_efecto__c);
            String factura = String.isBlank(p.N_factura_recibida__c) ? p.Name : p.N_factura_recibida__c;
            // Cuenta contable proveedor de la empresa; la del efecto como respaldo
            Id ctaProveedor = (p.Empresa__r != null && p.Empresa__r.Cuenta_contable_proveedor__c != null)
                ? p.Empresa__r.Cuenta_contable_proveedor__c : p.Plan_general_contable__c;
            Conciliacion_bancaria__c c = new Conciliacion_bancaria__c(
                Extracto_bancario__c = extractoId,
                Efectos_proveedores__c = p.Id,
                Cuenta_contable__c = ctaProveedor,
                Descripci_n__c = (esIngresoMov ? 'Ingreso Fra. ' : '') + factura
            );
            if (esIngresoMov) c.Haber__c = imp; else c.Importe__c = imp.abs();
            lineas.add(c);
        }

        // Líneas manuales de la propuesta (sin efecto): se guardan siguiendo la
        // convención de columna (ingreso -> Haber, pago -> Debe) neteando debe/haber
        if (lineasManuales != null) {
            for (LineaManualDTO lm : lineasManuales) {
                Decimal neto = zeroDec(lm.haber) - zeroDec(lm.debe);
                if (neto == 0 && String.isBlank(lm.descripcion)) continue;
                Conciliacion_bancaria__c c = new Conciliacion_bancaria__c(
                    Extracto_bancario__c = extractoId,
                    Cuenta_contable__c = lm.cuentaId,
                    Descripci_n__c = lm.descripcion
                );
                if (esIngresoMov) c.Haber__c = neto; else c.Importe__c = -neto;
                lineas.add(c);
            }
        }

        // Movimiento FATIR conciliado contra una remesa: una sola línea con la
        // remesa asignada, la cuenta de remesas y el importe del banco, como
        // guardan las conciliaciones de remesas que vienen de Sage
        if (hayRemesa) {
            List<Plan_general_contable__c> ctaRemesa = [
                SELECT Id FROM Plan_general_contable__c WHERE Name = :CUENTA_REMESA_EFECTOS LIMIT 1
            ];
            if (ctaRemesa.isEmpty()) {
                throw new AuraHandledException('No se encontró la cuenta ' + CUENTA_REMESA_EFECTOS + ' en el plan contable.');
            }
            Conciliacion_bancaria__c c = new Conciliacion_bancaria__c(
                Extracto_bancario__c = extractoId,
                Remesa__c = remesaId,
                Cuenta_contable__c = ctaRemesa[0].Id,
                Descripci_n__c = 'Ingreso remesa efectos'
            );
            Decimal imp = zeroDec(ext.importe__c);
            if (esIngresoMov) c.Haber__c = imp; else c.Importe__c = imp.abs();
            lineas.add(c);
        }

        ext.Estado__c = 'Conciliado';
        try {
            insert lineas;
            // El flow de la org crea el asiento y todos sus apuntes, incluidos
            // los de las conciliaciones sin efecto (líneas manuales)
            update ext;
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al conciliar: ' + ex.getDmlMessage(0));
        }
        return extractoId;
    }

    public class ConcApunteDTO {
        @AuraEnabled public Id      id;            // Linea_asiento_contable__c
        @AuraEnabled public String  numero;        // Nº de apunte contable
        @AuraEnabled public Id      cuentaId;      // Plan general contable
        @AuraEnabled public String  cuentaNumero;
        @AuraEnabled public String  cuentaTitulo;  // título de la cuenta contable
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public String  descripcion;
    }

    public class ConcExistenteDTO {
        @AuraEnabled public List<ConcLineaDTO>  lineas;    // Conciliación bancaria (efectos seleccionados)
        @AuraEnabled public List<ConcApunteDTO> apuntes;   // apuntes contables del extracto
        @AuraEnabled public Id     asientoId;              // asiento contable creado
        @AuraEnabled public String asientoNumero;
    }

    /** Conciliación existente de un movimiento: efectos, apuntes contables y asiento */
    @AuraEnabled
    public static ConcExistenteDTO getConciliacionMovimiento(Id extractoId) {
        ConcExistenteDTO res = new ConcExistenteDTO();
        res.lineas = new List<ConcLineaDTO>();
        res.apuntes = new List<ConcApunteDTO>();
        if (extractoId == null) return res;
        List<ConcLineaDTO> out = res.lineas;
        for (Conciliacion_bancaria__c c : [
            SELECT Id, Name, Cuenta_contable__c, Cuenta_contable__r.Name, Cuenta_contable__r.T_tulo_cuenta__c, Nombre_cuenta__c,
                   Importe__c, Haber__c, Descripci_n__c,
                   Remesa__c, Remesa__r.Name,
                   Efectos_proveedores__c, Efectos_proveedores__r.Name,
                   Efectos_clientes__c, Efectos_clientes__r.Name, Efectos_clientes__r.Importe_factura__c,
                   Efectos_clientes__r.Estado__c,
                   Efectos_clientes__r.Fecha_Vencimiento__c, Efectos_clientes__r.Cliente__r.Name,
                   Efectos_clientes__r.Facturas_emitidas__r.Name,
                   Efectos_clientes__r.Facturas_emitidas__r.N_factura__c,
                   Efectos_clientes__r.Facturas_emitidas__r.Fecha_factura__c
            FROM Conciliacion_bancaria__c
            WHERE Extracto_bancario__c = :extractoId
            ORDER BY CreatedDate ASC
            LIMIT 1000
        ]) {
            ConcLineaDTO d = new ConcLineaDTO();
            d.id = c.Id;
            d.numero = c.Name;
            d.cuentaId = c.Cuenta_contable__c;
            d.cuentaNumero = (c.Cuenta_contable__r == null) ? '' : c.Cuenta_contable__r.Name;
            d.cuentaTitulo = (c.Cuenta_contable__r == null) ? '' : c.Cuenta_contable__r.T_tulo_cuenta__c;
            d.nombreCuenta = c.Nombre_cuenta__c;
            d.debe = c.Importe__c;
            d.haber = c.Haber__c;
            d.descripcion = c.Descripci_n__c;
            d.efectoProvId = c.Efectos_proveedores__c;
            d.efectoProvNumero = (c.Efectos_proveedores__r == null) ? '' : c.Efectos_proveedores__r.Name;
            d.remesaId = c.Remesa__c;
            d.remesaNumero = (c.Remesa__r == null) ? '' : c.Remesa__r.Name;
            d.efectoId = c.Efectos_clientes__c;
            if (c.Efectos_clientes__r != null) {
                d.efectoNumero = c.Efectos_clientes__r.Name;
                d.efectoEstado = c.Efectos_clientes__r.Estado__c;
                d.efectoImporte = zeroDec(c.Efectos_clientes__r.Importe_factura__c);
                d.fechaVencimiento = c.Efectos_clientes__r.Fecha_Vencimiento__c;
                d.clienteNombre = (c.Efectos_clientes__r.Cliente__r == null) ? '' : c.Efectos_clientes__r.Cliente__r.Name;
                if (c.Efectos_clientes__r.Facturas_emitidas__r != null) {
                    d.facturaNumero = String.isNotBlank(c.Efectos_clientes__r.Facturas_emitidas__r.N_factura__c)
                        ? c.Efectos_clientes__r.Facturas_emitidas__r.N_factura__c
                        : c.Efectos_clientes__r.Facturas_emitidas__r.Name;
                    d.fechaFactura = c.Efectos_clientes__r.Facturas_emitidas__r.Fecha_factura__c;
                }
            }
            out.add(d);
        }

        // Asiento contable al que quedó asociado el extracto
        for (Extracto_bancario__c e : [
            SELECT Asientos_contable__c, Asientos_contable__r.Name
            FROM Extracto_bancario__c WHERE Id = :extractoId LIMIT 1
        ]) {
            res.asientoId = e.Asientos_contable__c;
            res.asientoNumero = (e.Asientos_contable__r == null) ? '' : e.Asientos_contable__r.Name;
        }

        // Todos los apuntes contables relacionados con el extracto bancario
        for (Linea_asiento_contable__c l : [
            SELECT Id, Name, Plan__c, Plan__r.Name, Plan__r.T_tulo_cuenta__c, Debe__c, Haber__c, Descripci_n__c,
                   Asientos_contable__c, Asientos_contable__r.Name
            FROM Linea_asiento_contable__c
            WHERE Extracto_bancario__c = :extractoId
            ORDER BY Name ASC
            LIMIT 1000
        ]) {
            ConcApunteDTO a = new ConcApunteDTO();
            a.id = l.Id;
            a.numero = l.Name;
            a.cuentaId = l.Plan__c;
            a.cuentaNumero = (l.Plan__r == null) ? '' : l.Plan__r.Name;
            a.cuentaTitulo = (l.Plan__r == null) ? '' : l.Plan__r.T_tulo_cuenta__c;
            a.debe = l.Debe__c;
            a.haber = l.Haber__c;
            a.descripcion = l.Descripci_n__c;
            res.apuntes.add(a);
            if (res.asientoId == null && l.Asientos_contable__c != null) {
                res.asientoId = l.Asientos_contable__c;
                res.asientoNumero = (l.Asientos_contable__r == null) ? '' : l.Asientos_contable__r.Name;
            }
        }
        return res;
    }

    // =====================================================================
    //  Hoja de caja extraordinaria (pestaña Extraordinario)
    // =====================================================================
    public class HojaCajaDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
    }

    /** Movimientos de la hoja de caja extraordinaria en orden cronológico (el front acumula el saldo) */
    @AuraEnabled
    public static List<HojaCajaDTO> getHojaCajaExtra() {
        List<HojaCajaDTO> out = new List<HojaCajaDTO>();
        for (Hoja_de_caja_extraordinaria__c h : [
            SELECT Id, Name, Fecha_movimiento__c, Descripci_n__c, Debe__c, Haber__c
            FROM Hoja_de_caja_extraordinaria__c
            ORDER BY Fecha_movimiento__c ASC NULLS FIRST, CreatedDate ASC
            LIMIT 10000
        ]) {
            HojaCajaDTO d = new HojaCajaDTO();
            d.id = h.Id;
            d.numero = h.Name;
            d.fecha = h.Fecha_movimiento__c;
            d.descripcion = h.Descripci_n__c;
            d.debe = h.Debe__c;
            d.haber = h.Haber__c;
            out.add(d);
        }
        return out;
    }

    /**
     * Crea un movimiento de la hoja de caja extraordinaria. El importe llega
     * siempre en positivo: un ingreso va al Haber y un gasto al Debe.
     */
    @AuraEnabled
    public static Id crearMovimientoHojaCaja(Date fecha, String descripcion, Decimal importe, String tipo) {
        if (fecha == null) throw new AuraHandledException('Falta la fecha del movimiento.');
        if (String.isBlank(descripcion)) throw new AuraHandledException('Falta la descripción.');
        if (importe == null || importe <= 0) throw new AuraHandledException('El importe debe ser un número positivo.');
        Hoja_de_caja_extraordinaria__c h = new Hoja_de_caja_extraordinaria__c(
            Fecha_movimiento__c = fecha,
            Descripci_n__c = descripcion
        );
        if (tipo == 'ingreso') h.Haber__c = importe; else h.Debe__c = importe;
        try {
            insert h;
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al guardar: ' + ex.getDmlMessage(0));
        }
        return h.Id;
    }

    /** Suma diaria de importes de extractos de cuentas tipo "Cuenta bancaria" */
    private static List<PuntoDTO> serieDiaria(List<String> empresasTitulares) {
        List<PuntoDTO> out = new List<PuntoDTO>();
        String soql = 'SELECT Fecha_movimiento__c f, SUM(importe__c) s '
                    + 'FROM Extracto_bancario__c '
                    + 'WHERE Cuenta_bancaria_bancos__r.Tipo__c = \'Cuenta bancaria\' '
                    + 'AND Fecha_movimiento__c != null ';
        if (empresasTitulares != null && !empresasTitulares.isEmpty()) {
            soql += 'AND Cuenta_bancaria_bancos__r.Empresa_titular_medios__c IN :empresasTitulares ';
        }
        soql += 'GROUP BY Fecha_movimiento__c ORDER BY Fecha_movimiento__c ASC';
        for (AggregateResult ar : Database.query(soql)) {
            PuntoDTO p = new PuntoDTO();
            p.fecha   = (Date) ar.get('f');
            Decimal s = (Decimal) ar.get('s');
            p.importe = (s == null) ? 0 : s;
            out.add(p);
        }
        return out;
    }
}