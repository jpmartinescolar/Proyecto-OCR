/**
 * Asistente de "Cierre de ejercicio": genera los tres asientos del proceso de
 * cierre y apertura de una empresa titular.
 *
 *  1. Asiento Reg. Cierre (31/12): salda las cuentas 6 y 7 (apunte contrario a
 *     su saldo) y lleva la diferencia a la cuenta 129 (resultado del ejercicio).
 *  2. Asiento de cierre (31/12): salda todas las cuentas de balance (grupos 1-5,
 *     con la 129 ya ajustada por la regularización).
 *  3. Asiento de apertura (01/01 del año siguiente): reabre los mismos saldos.
 *
 *  Reglas:
 *   - Criterio del BALANCE OFICIAL: todas las simulaciones incluidas y sin
 *     apuntes extraordinarios (solo apuntes contables del libro).
 *   - Saldos = movimientos DEL EJERCICIO (01/01 a 31/12): el asiento de apertura
 *     del propio ejercicio aporta el saldo inicial de las cuentas de balance.
 *   - Los apuntes creados llevan Check = 'Si' y la Empresa titular del asiento.
 *   - Bloqueo: no se permite si ya existe un asiento de ese tipo en el ejercicio
 *     (apertura: en el ejercicio siguiente).
 */
public with sharing class CierreEjercicioController {

    private static final String TIPO_REG      = 'Asiento Reg. Cierre';
    private static final String TIPO_CIERRE   = 'Asiento de cierre';
    private static final String TIPO_APERTURA = 'Asiento de apertura';
    private static final String CANAL_GENERAL = '001 General';

    // ------------------------------------------------------------------ DTOs
    public class LineaPreview {
        @AuraEnabled public String  numero;
        @AuraEnabled public String  titulo;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
    }
    public class AsientoPreview {
        @AuraEnabled public String  tipo;
        @AuraEnabled public Date    fecha;
        @AuraEnabled public Decimal totalDebe;
        @AuraEnabled public Decimal totalHaber;
        @AuraEnabled public List<LineaPreview> lineas;
    }
    public class Bloqueo {
        @AuraEnabled public String tipo;
        @AuraEnabled public Id     asientoId;
        @AuraEnabled public String asientoName;
        @AuraEnabled public Date   fecha;
    }
    public class Analisis {
        @AuraEnabled public List<Bloqueo> bloqueos;
        @AuraEnabled public Integer descuadrados;
        @AuraEnabled public Integer sinCuenta;
        @AuraEnabled public Decimal arrastre67;           // saldo 6/7 pendiente de ejercicios anteriores sin cerrar
        @AuraEnabled public Decimal resultadoEjercicio;   // beneficio (+) o pérdida (−)
        @AuraEnabled public AsientoPreview regularizacion;
        @AuraEnabled public AsientoPreview cierre;
        @AuraEnabled public AsientoPreview apertura;
        @AuraEnabled public String error;
    }
    public class Resultado {
        @AuraEnabled public Id     regId;      @AuraEnabled public String regName;
        @AuraEnabled public Id     cierreId;   @AuraEnabled public String cierreName;
        @AuraEnabled public Id     aperturaId; @AuraEnabled public String aperturaName;
    }

    /** Fila del histórico de cierres: una por empresa + ejercicio cerrado */
    public class HistoricoRow implements Comparable {
        @AuraEnabled public String  empresa;
        @AuraEnabled public Integer ejercicio;      // ejercicio cerrado (la apertura es de ejercicio+1)
        @AuraEnabled public Id      regId;      @AuraEnabled public String regName;
        @AuraEnabled public Id      cierreId;   @AuraEnabled public String cierreName;
        @AuraEnabled public Id      aperturaId; @AuraEnabled public String aperturaName;
        @AuraEnabled public Datetime creado;
        @AuraEnabled public Boolean completo;   // tiene los tres asientos
        @AuraEnabled public String  estado;     // 'COMPLETO' | 'INCOMPLETO' | 'PENDIENTE'

        // Orden: ejercicio descendente y, dentro del mismo, empresa ascendente
        public Integer compareTo(Object o) {
            HistoricoRow x = (HistoricoRow) o;
            if (this.ejercicio != x.ejercicio) return (this.ejercicio > x.ejercicio) ? -1 : 1;
            if (this.empresa == x.empresa) return 0;
            return (this.empresa < x.empresa) ? -1 : 1;
        }
    }

    /**
     * Histórico de cierres: una fila por empresa titular y ejercicio CON MOVIMIENTOS
     * contables (aunque no exista ningún asiento de cierre, p.ej. primer año de
     * constitución → estado PENDIENTE). Excluye las empresas marcadas en la
     * configuración personalizada Cierre_Empresa_Excluida__c.
     */
    @AuraEnabled
    public static List<HistoricoRow> getHistorico() {
        Set<String> excluidas = new Set<String>(getExclusiones());
        Map<String, HistoricoRow> porClave = new Map<String, HistoricoRow>();

        // 1) Todas las combinaciones empresa + ejercicio con movimientos contables
        for (AggregateResult ar : [
            SELECT Empresa_titular__c emp, CALENDAR_YEAR(Asientos_contable__r.Fecha_asiento_contable__c) yr
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c != null
              AND Asientos_contable__r.Fecha_asiento_contable__c != null
            GROUP BY Empresa_titular__c, CALENDAR_YEAR(Asientos_contable__r.Fecha_asiento_contable__c)
        ]) {
            String emp = (String) ar.get('emp');
            Object yo = ar.get('yr');
            if (yo == null || excluidas.contains(emp)) continue;
            Integer ej = Integer.valueOf(yo);
            HistoricoRow h = new HistoricoRow();
            h.empresa = emp;
            h.ejercicio = ej;
            porClave.put(emp + '|' + ej, h);
        }

        // 2) Asientos de cierre existentes, enlazados a su fila
        for (Asiento_contable__c a : [
            SELECT Id, Name, Tipo_de_asiento__c, Fecha_asiento_contable__c, Empresa_titular__c, CreatedDate
            FROM Asiento_contable__c
            WHERE Tipo_de_asiento__c IN (:TIPO_REG, :TIPO_CIERRE, :TIPO_APERTURA)
              AND Fecha_asiento_contable__c != null
              AND Empresa_titular__c != null
            ORDER BY CreatedDate ASC
            LIMIT 2000
        ]) {
            if (excluidas.contains(a.Empresa_titular__c)) continue;
            Integer ej = a.Fecha_asiento_contable__c.year();
            if (a.Tipo_de_asiento__c == TIPO_APERTURA) ej -= 1;   // la apertura de 2026 pertenece al cierre de 2025
            String clave = a.Empresa_titular__c + '|' + ej;
            HistoricoRow h = porClave.get(clave);
            if (h == null) {
                h = new HistoricoRow();
                h.empresa = a.Empresa_titular__c;
                h.ejercicio = ej;
                porClave.put(clave, h);
            }
            if (a.Tipo_de_asiento__c == TIPO_REG)      { h.regId = a.Id;      h.regName = a.Name; }
            if (a.Tipo_de_asiento__c == TIPO_CIERRE)   { h.cierreId = a.Id;   h.cierreName = a.Name; }
            if (a.Tipo_de_asiento__c == TIPO_APERTURA) { h.aperturaId = a.Id; h.aperturaName = a.Name; }
            if (h.creado == null || a.CreatedDate > h.creado) h.creado = a.CreatedDate;
        }
        List<HistoricoRow> out = porClave.values();
        for (HistoricoRow h : out) {
            h.completo = (h.regId != null && h.cierreId != null && h.aperturaId != null);
            Boolean alguno = (h.regId != null || h.cierreId != null || h.aperturaId != null);
            h.estado = h.completo ? 'COMPLETO' : (alguno ? 'INCOMPLETO' : 'PENDIENTE');
        }
        out.sort();
        return out;
    }

    // ------------------------------------------------------------------ EXCLUSIONES
    /** Empresas excluidas del histórico (configuración personalizada, compartida por todos) */
    @AuraEnabled
    public static List<String> getExclusiones() {
        List<String> out = new List<String>();
        for (Cierre_Empresa_Excluida__c e : Cierre_Empresa_Excluida__c.getAll().values()) {
            if (String.isNotBlank(e.Empresa__c)) out.add(e.Empresa__c);
        }
        return out;
    }

    /** Sustituye la lista de empresas excluidas del histórico */
    @AuraEnabled
    public static void guardarExclusiones(List<String> empresas) {
        delete [SELECT Id FROM Cierre_Empresa_Excluida__c];
        List<Cierre_Empresa_Excluida__c> nuevas = new List<Cierre_Empresa_Excluida__c>();
        Integer i = 0;
        for (String emp : (empresas == null ? new List<String>() : empresas)) {
            if (String.isBlank(emp)) continue;
            i++;
            nuevas.add(new Cierre_Empresa_Excluida__c(Name = 'EXC-' + i, Empresa__c = emp));
        }
        if (!nuevas.isEmpty()) insert nuevas;
    }

    // Estructura interna con el plan de los tres asientos
    private class LineaPlan {
        Id cuentaId; String numero; String titulo; Decimal debe = 0; Decimal haber = 0;
    }
    private class PlanCierre {
        List<LineaPlan> reg = new List<LineaPlan>();
        List<LineaPlan> cierre = new List<LineaPlan>();
        List<LineaPlan> apertura = new List<LineaPlan>();
        Decimal resultado = 0;      // beneficio (+) / pérdida (−)
        String error;
    }

    // ------------------------------------------------------------------ ANALIZAR
    @AuraEnabled
    public static Analisis analizar(String empresaTitular, Integer ejercicio) {
        validarParams(empresaTitular, ejercicio);
        Analisis a = new Analisis();
        a.bloqueos = buscarBloqueos(empresaTitular, ejercicio);

        Date ini = Date.newInstance(ejercicio, 1, 1);
        Date fin = Date.newInstance(ejercicio, 12, 31);
        a.descuadrados = [
            SELECT COUNT() FROM Asiento_contable__c
            WHERE Empresa_titular__c = :empresaTitular AND Diferencia__c != 0
              AND Fecha_asiento_contable__c >= :ini AND Fecha_asiento_contable__c <= :fin
        ];
        a.sinCuenta = [
            SELECT COUNT() FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c = :empresaTitular AND Plan__c = null
              AND Asientos_contable__r.Fecha_asiento_contable__c >= :ini
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :fin
        ];

        // Saldo 6/7 de ejercicios anteriores sin regularizar: informativo. El cierre
        // solo considera los movimientos del propio ejercicio, así que ese saldo
        // queda FUERA de este proceso.
        a.arrastre67 = 0;
        Date finAnterior = Date.newInstance(ejercicio - 1, 12, 31);
        for (AggregateResult ar : [
            SELECT SUM(Debe__c) d, SUM(Haber__c) h
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c = :empresaTitular
              AND (Plan__r.Name LIKE '6%' OR Plan__r.Name LIKE '7%')
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :finAnterior
        ]) {
            Decimal d = (Decimal) ar.get('d'), h = (Decimal) ar.get('h');
            a.arrastre67 = ((d == null ? 0 : d) - (h == null ? 0 : h)).setScale(2, System.RoundingMode.HALF_UP);
        }

        PlanCierre plan = construirPlan(empresaTitular, ejercicio);
        a.error = plan.error;
        a.resultadoEjercicio = plan.resultado;
        a.regularizacion = toPreview(TIPO_REG,      fin, plan.reg);
        a.cierre         = toPreview(TIPO_CIERRE,   fin, plan.cierre);
        a.apertura       = toPreview(TIPO_APERTURA, Date.newInstance(ejercicio + 1, 1, 1), plan.apertura);
        return a;
    }

    // ------------------------------------------------------------------ EJECUTAR
    @AuraEnabled
    public static Resultado ejecutar(String empresaTitular, Integer ejercicio) {
        validarParams(empresaTitular, ejercicio);
        List<Bloqueo> bloqueos = buscarBloqueos(empresaTitular, ejercicio);
        if (!bloqueos.isEmpty()) {
            throw new AuraHandledException('Ya existe un asiento de cierre/apertura/regularización en ese ejercicio. Revisa los bloqueos.');
        }
        PlanCierre plan = construirPlan(empresaTitular, ejercicio);
        if (plan.error != null) throw new AuraHandledException(plan.error);
        if (plan.reg.isEmpty() && plan.cierre.isEmpty()) {
            throw new AuraHandledException('No hay saldos que regularizar ni cerrar en ese ejercicio.');
        }

        Date fin = Date.newInstance(ejercicio, 12, 31);
        Date iniSiguiente = Date.newInstance(ejercicio + 1, 1, 1);
        String obs = 'Generado automáticamente por el asistente de Cierre de ejercicio ' + ejercicio + '.';

        Savepoint sp = Database.setSavepoint();
        try {
            Asiento_contable__c reg = nuevoAsiento(empresaTitular, TIPO_REG, fin, obs);
            Asiento_contable__c cie = nuevoAsiento(empresaTitular, TIPO_CIERRE, fin, obs);
            Asiento_contable__c ape = nuevoAsiento(empresaTitular, TIPO_APERTURA, iniSiguiente, obs);
            insert new List<Asiento_contable__c>{ reg, cie, ape };

            List<Linea_asiento_contable__c> lineas = new List<Linea_asiento_contable__c>();
            lineas.addAll(nuevasLineas(plan.reg,      reg.Id, empresaTitular, 'Regularización de cierre ' + ejercicio));
            lineas.addAll(nuevasLineas(plan.cierre,   cie.Id, empresaTitular, 'Asiento de cierre ' + ejercicio));
            lineas.addAll(nuevasLineas(plan.apertura, ape.Id, empresaTitular, 'Asiento de apertura ' + (ejercicio + 1)));
            insert lineas;

            // Algunas automatizaciones del org sobrescriben el Check al crear el apunte:
            // se reafirma a 'Si' en los que lo hayan perdido.
            List<Linea_asiento_contable__c> corregirCheck = new List<Linea_asiento_contable__c>();
            for (Linea_asiento_contable__c l : [
                SELECT Id FROM Linea_asiento_contable__c WHERE Id IN :lineas AND Check__c != 'Si'
            ]) {
                corregirCheck.add(new Linea_asiento_contable__c(Id = l.Id, Check__c = 'Si'));
            }
            if (!corregirCheck.isEmpty()) update corregirCheck;

            Resultado r = new Resultado();
            for (Asiento_contable__c x : [SELECT Id, Name, Tipo_de_asiento__c FROM Asiento_contable__c WHERE Id IN :new List<Id>{ reg.Id, cie.Id, ape.Id }]) {
                if (x.Tipo_de_asiento__c == TIPO_REG)      { r.regId = x.Id;      r.regName = x.Name; }
                if (x.Tipo_de_asiento__c == TIPO_CIERRE)   { r.cierreId = x.Id;   r.cierreName = x.Name; }
                if (x.Tipo_de_asiento__c == TIPO_APERTURA) { r.aperturaId = x.Id; r.aperturaName = x.Name; }
            }
            return r;
        } catch (Exception ex) {
            Database.rollback(sp);
            throw new AuraHandledException('Error creando los asientos (no se ha guardado nada): ' + ex.getMessage());
        }
    }

    // ------------------------------------------------------------------ NÚCLEO
    private static PlanCierre construirPlan(String empresaTitular, Integer ejercicio) {
        PlanCierre plan = new PlanCierre();
        Date ini = Date.newInstance(ejercicio, 1, 1);
        Date fin = Date.newInstance(ejercicio, 12, 31);

        // Saldos del ejercicio (01/01 a 31/12, apertura incluida) con criterio de balance
        // oficial: TODAS las simulaciones, solo apuntes contables (sin extraordinarios)
        Map<Id, Decimal> saldo = new Map<Id, Decimal>();
        for (AggregateResult ar : [
            SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c = :empresaTitular AND Plan__c != null
              AND Asientos_contable__r.Fecha_asiento_contable__c >= :ini
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :fin
            GROUP BY Plan__c
        ]) {
            Decimal d = (Decimal) ar.get('d'), h = (Decimal) ar.get('h');
            Decimal s = ((d == null ? 0 : d) - (h == null ? 0 : h)).setScale(2, System.RoundingMode.HALF_UP);
            if (s != 0) saldo.put((Id) ar.get('c'), s);
        }

        Map<Id, Plan_general_contable__c> cuentas = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c WHERE Id IN :saldo.keySet()]);

        // Cuenta 129 (resultado del ejercicio)
        Plan_general_contable__c c129;
        for (Plan_general_contable__c p : [
            SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c
            WHERE Name LIKE '129%' ORDER BY Name ASC LIMIT 1
        ]) { c129 = p; }

        // 1) Regularización: contrario de cada 6/7 + diferencia contra 129
        Decimal s67 = 0;
        List<Id> ordenados = ordenarPorNumero(saldo.keySet(), cuentas);
        for (Id cid : ordenados) {
            String num = cuentas.get(cid).Name;
            if (num == null || !(num.startsWith('6') || num.startsWith('7'))) continue;
            Decimal s = saldo.get(cid);
            plan.reg.add(lineaContraria(cid, cuentas, s));
            s67 += s;
        }
        plan.resultado = -s67;   // ingresos − gastos
        if (s67 != 0) {
            if (c129 == null) {
                plan.error = 'No existe ninguna cuenta 129 en el Plan general contable para llevar el resultado del ejercicio.';
                return plan;
            }
            LineaPlan l129 = new LineaPlan();
            l129.cuentaId = c129.Id; l129.numero = c129.Name;
            l129.titulo = (c129.T_tulo_cuenta__c == null) ? '' : c129.T_tulo_cuenta__c;
            if (s67 > 0) l129.debe = s67; else l129.haber = -s67;   // pérdida al Debe, beneficio al Haber
            plan.reg.add(l129);
        }

        // 2) Cierre: contrario de cada cuenta de balance (grupos 1-5), con la 129 ajustada
        Map<Id, Decimal> saldoBalance = new Map<Id, Decimal>();
        for (Id cid : ordenados) {
            String num = cuentas.get(cid).Name;
            if (num == null || num.startsWith('6') || num.startsWith('7')) continue;
            saldoBalance.put(cid, saldo.get(cid));
        }
        if (c129 != null && s67 != 0) {
            Decimal s129 = saldoBalance.containsKey(c129.Id) ? saldoBalance.get(c129.Id) : 0;
            s129 += s67;   // efecto de la regularización (Debe−Haber)
            if (s129 == 0) saldoBalance.remove(c129.Id); else saldoBalance.put(c129.Id, s129);
            if (!cuentas.containsKey(c129.Id)) cuentas.put(c129.Id, c129);
        }
        for (Id cid : ordenarPorNumero(saldoBalance.keySet(), cuentas)) {
            Decimal s = saldoBalance.get(cid);
            plan.cierre.add(lineaContraria(cid, cuentas, s));
            // 3) Apertura: mismo saldo con su signo original
            LineaPlan ap = new LineaPlan();
            ap.cuentaId = cid; ap.numero = cuentas.get(cid).Name;
            ap.titulo = (cuentas.get(cid).T_tulo_cuenta__c == null) ? '' : cuentas.get(cid).T_tulo_cuenta__c;
            if (s > 0) ap.debe = s; else ap.haber = -s;
            plan.apertura.add(ap);
        }
        return plan;
    }

    private static LineaPlan lineaContraria(Id cid, Map<Id, Plan_general_contable__c> cuentas, Decimal s) {
        LineaPlan l = new LineaPlan();
        l.cuentaId = cid;
        l.numero = cuentas.get(cid).Name;
        l.titulo = (cuentas.get(cid).T_tulo_cuenta__c == null) ? '' : cuentas.get(cid).T_tulo_cuenta__c;
        if (s > 0) l.haber = s; else l.debe = -s;
        return l;
    }

    private static List<Id> ordenarPorNumero(Set<Id> ids, Map<Id, Plan_general_contable__c> cuentas) {
        List<String> claves = new List<String>();
        Map<String, Id> porClave = new Map<String, Id>();
        for (Id cid : ids) {
            String num = (cuentas.containsKey(cid) && cuentas.get(cid).Name != null) ? cuentas.get(cid).Name : '';
            String clave = num + '|' + cid;
            claves.add(clave);
            porClave.put(clave, cid);
        }
        claves.sort();
        List<Id> out = new List<Id>();
        for (String k : claves) out.add(porClave.get(k));
        return out;
    }

    private static List<Bloqueo> buscarBloqueos(String empresaTitular, Integer ejercicio) {
        List<Bloqueo> out = new List<Bloqueo>();
        Date ini = Date.newInstance(ejercicio, 1, 1);
        Date fin = Date.newInstance(ejercicio, 12, 31);
        Date iniSig = Date.newInstance(ejercicio + 1, 1, 1);
        Date finSig = Date.newInstance(ejercicio + 1, 12, 31);
        for (Asiento_contable__c a : [
            SELECT Id, Name, Tipo_de_asiento__c, Fecha_asiento_contable__c
            FROM Asiento_contable__c
            WHERE Empresa_titular__c = :empresaTitular
              AND ((Tipo_de_asiento__c IN (:TIPO_REG, :TIPO_CIERRE)
                    AND Fecha_asiento_contable__c >= :ini AND Fecha_asiento_contable__c <= :fin)
                OR (Tipo_de_asiento__c = :TIPO_APERTURA
                    AND Fecha_asiento_contable__c >= :iniSig AND Fecha_asiento_contable__c <= :finSig))
            ORDER BY Fecha_asiento_contable__c
        ]) {
            Bloqueo b = new Bloqueo();
            b.tipo = a.Tipo_de_asiento__c;
            b.asientoId = a.Id;
            b.asientoName = a.Name;
            b.fecha = a.Fecha_asiento_contable__c;
            out.add(b);
        }
        return out;
    }

    private static Asiento_contable__c nuevoAsiento(String empresa, String tipo, Date fecha, String obs) {
        return new Asiento_contable__c(
            Empresa_titular__c = empresa,
            Tipo_de_asiento__c = tipo,
            Fecha_asiento_contable__c = fecha,
            Canal__c = CANAL_GENERAL,
            Observaciones__c = obs
        );
    }

    private static List<Linea_asiento_contable__c> nuevasLineas(List<LineaPlan> plan, Id asientoId, String empresa, String descripcion) {
        List<Linea_asiento_contable__c> out = new List<Linea_asiento_contable__c>();
        for (LineaPlan l : plan) {
            out.add(new Linea_asiento_contable__c(
                Asientos_contable__c = asientoId,
                Plan__c = l.cuentaId,
                Debe__c = l.debe,
                Haber__c = l.haber,
                Empresa_titular__c = empresa,
                Check__c = 'Si',
                Simulaci_n__c = 'No',
                Descripci_n__c = descripcion
            ));
        }
        return out;
    }

    private static AsientoPreview toPreview(String tipo, Date fecha, List<LineaPlan> plan) {
        AsientoPreview p = new AsientoPreview();
        p.tipo = tipo; p.fecha = fecha;
        p.totalDebe = 0; p.totalHaber = 0;
        p.lineas = new List<LineaPreview>();
        for (LineaPlan l : plan) {
            LineaPreview lp = new LineaPreview();
            lp.numero = l.numero; lp.titulo = l.titulo; lp.debe = l.debe; lp.haber = l.haber;
            p.totalDebe += l.debe; p.totalHaber += l.haber;
            p.lineas.add(lp);
        }
        return p;
    }

    private static void validarParams(String empresaTitular, Integer ejercicio) {
        if (String.isBlank(empresaTitular)) throw new AuraHandledException('Debes seleccionar la empresa titular.');
        if (ejercicio == null || ejercicio < 2000 || ejercicio > 2100) throw new AuraHandledException('Ejercicio no válido.');
    }
}