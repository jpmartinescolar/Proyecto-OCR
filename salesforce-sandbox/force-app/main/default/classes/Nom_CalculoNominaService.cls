/**
 * Motor de calculo de nomina (Espana).
 * Punto de entrada: calcular(contratoId, desde, hasta) -> Nom_Recibo__c (Borrador) con sus lineas.
 * Snapshot total: las lineas y la cabecera congelan importes, flags y valores usados.
 *
 * Orden de operaciones:
 *   1) Contexto  2) Devengos  3) Bases SS  4) Cuotas SS  5) IRPF  6) Otras deducciones
 *   7) Totales   8) Persistencia + snapshot
 *
 * Para calculo masivo (empresa/mes) envolver en Batch/Queueable: este metodo procesa 1 contrato.
 */
public with sharing class Nom_CalculoNominaService {

    public class CalculoException extends Exception {}

    // ---------------------------------------------------------------- API

    public static Nom_Recibo__c calcular(Id contratoId, Date desde, Date hasta) {
        if (contratoId == null || desde == null || hasta == null) {
            throw new CalculoException('Parametros obligatorios: contratoId, desde, hasta.');
        }

        Nom_ContextoCalculo ctx = construirContexto(contratoId, desde, hasta);

        List<Nom_Linea__c> lineas = new List<Nom_Linea__c>();

        // 2) Devengos
        calcularDevengos(ctx, lineas);

        // 3) Bases de cotizacion
        Bases bases = calcularBases(lineas);
        bases.cc = aplicarTopes(ctx, bases.cc);

        // 4) Cuotas SS del trabajador
        Nom_Config_Cotizacion__c cfg = ctx.config;
        Decimal cuotaCC  = redondear(bases.cc  * pct(cfg.Tipo_CC_Trabajador__c));
        Decimal cuotaDes = redondear(bases.cp  * pct(cfg.Tipo_Desempleo_Trabajador__c));
        Decimal cuotaFP  = redondear(bases.cp  * pct(cfg.Tipo_FP_Trabajador__c));
        Decimal cuotaHHEE = redondear(
              bases.hheeNormales   * pct(cfg.Tipo_HHEE_Normales_Trab__c)
            + bases.hheeFuerza     * pct(cfg.Tipo_HHEE_FuerzaMayor_Trab__c));

        afnadirDeduccion(lineas, 'SS_CC',   'Aportacion trabajador - Contingencias comunes', cuotaCC);
        afnadirDeduccion(lineas, 'SS_DES',  'Aportacion trabajador - Desempleo',            cuotaDes);
        afnadirDeduccion(lineas, 'SS_FP',   'Aportacion trabajador - Formacion Profesional', cuotaFP);
        afnadirDeduccion(lineas, 'SS_HHEE', 'Aportacion trabajador - Horas extra',          cuotaHHEE);

        // 5) IRPF
        Decimal tipoIRPF = ctx.contrato.Tipo_IRPF__c != null ? ctx.contrato.Tipo_IRPF__c : 0;
        Decimal retencionIRPF = redondear(bases.irpf * pct(tipoIRPF));
        afnadirDeduccion(lineas, 'IRPF', 'Retencion IRPF', retencionIRPF);

        // 6) Otras deducciones: punto de extension (anticipos, embargos...). v1 vacio.

        // 7) Totales
        Decimal totalDevengado = 0;
        Decimal totalDeducciones = 0;
        for (Nom_Linea__c l : lineas) {
            if (l.Tipo__c == 'Devengo') { totalDevengado += l.Importe__c; }
            else { totalDeducciones += l.Importe__c; }
        }
        totalDevengado = redondear(totalDevengado);
        totalDeducciones = redondear(totalDeducciones);

        // 8) Persistencia + snapshot
        Nom_Recibo__c recibo = construirRecibo(ctx, bases, tipoIRPF,
            cuotaCC, cuotaDes, cuotaFP, cuotaHHEE,
            totalDevengado, totalDeducciones);

        persistir(ctx, recibo, lineas);
        return recibo;
    }

    // ------------------------------------------------------- 1) Contexto

    private static Nom_ContextoCalculo construirContexto(Id contratoId, Date desde, Date hasta) {
        Nom_ContextoCalculo ctx = new Nom_ContextoCalculo();

        List<Nom_Contrato__c> cts = [
            SELECT Id, Empleado__c, Tipo_IRPF__c, Fecha_Inicio__c, Fecha_Fin__c,
                   Convenio__c, Porcentaje_Jornada__c, Grupo_Cotizacion__c,
                   Empleado__r.Empresa__c
            FROM Nom_Contrato__c
            WHERE Id = :contratoId
            LIMIT 1
        ];
        if (cts.isEmpty()) { throw new CalculoException('Contrato no encontrado: ' + contratoId); }
        ctx.contrato = cts[0];

        ctx.empleado = [
            SELECT Id, Empresa__c, Situacion_Familiar_IRPF__c, Num_Hijos__c
            FROM Nom_Empleado__c
            WHERE Id = :ctx.contrato.Empleado__c
            LIMIT 1
        ];

        ctx.periodoDesde = desde;
        ctx.periodoHasta = hasta;
        ctx.ejercicio = hasta.year();
        ctx.mes = hasta.month();
        ctx.diasCotizados = desde.daysBetween(hasta) + 1;

        List<Nom_Config_Cotizacion__c> cfgs = [
            SELECT Id, Ejercicio__c, Tipo_CC_Trabajador__c, Tipo_Desempleo_Trabajador__c,
                   Tipo_FP_Trabajador__c, Tipo_HHEE_Normales_Trab__c, Tipo_HHEE_FuerzaMayor_Trab__c,
                   Base_Maxima__c, Base_Minima__c
            FROM Nom_Config_Cotizacion__c
            WHERE Ejercicio__c = :ctx.ejercicio
            LIMIT 1
        ];
        if (cfgs.isEmpty()) {
            throw new CalculoException('No hay configuracion de cotizacion para el ejercicio ' + ctx.ejercicio);
        }
        ctx.config = cfgs[0];

        return ctx;
    }

    // ------------------------------------------------------- 2) Devengos

    private static void calcularDevengos(Nom_ContextoCalculo ctx, List<Nom_Linea__c> lineas) {
        List<Nom_Condiciones__c> conds = [
            SELECT Id, Importe__c, Cantidad__c,
                   Concepto__c, Concepto__r.Name, Concepto__r.Codigo__c, Concepto__r.Tipo__c,
                   Concepto__r.Activo__c, Concepto__r.Orden__c,
                   Concepto__r.Base_CC__c, Concepto__r.Base_CP_AT__c, Concepto__r.Base_HHEE__c,
                   Concepto__r.Tributa_IRPF__c, Concepto__r.Tiene_Tramo_Exento__c,
                   Concepto__r.Limite_Exento__c, Concepto__r.Forma_Calculo__c,
                   Concepto__r.Importe_Fijo__c, Concepto__r.Precio_Unidad__c,
                   Concepto__r.Porcentaje__c, Concepto__r.Clase_Apex__c,
                   Concepto__r.Concepto_Base__r.Codigo__c
            FROM Nom_Condiciones__c
            WHERE Contrato__c = :ctx.contrato.Id
              AND Activo__c = true
              AND (Vigencia_Desde__c = null OR Vigencia_Desde__c <= :ctx.periodoHasta)
              AND (Vigencia_Hasta__c = null OR Vigencia_Hasta__c >= :ctx.periodoDesde)
            ORDER BY Concepto__r.Orden__c NULLS LAST
        ];

        for (Nom_Condiciones__c c : conds) {
            Nom_Concepto__c cpt = c.Concepto__r;
            if (cpt == null || cpt.Activo__c != true || cpt.Tipo__c != 'Devengo') { continue; }

            Decimal bruto = redondear(resolverImporte(ctx, cpt, c));

            Decimal exento = 0;
            Decimal sujeto = bruto;
            if (cpt.Tiene_Tramo_Exento__c == true && cpt.Limite_Exento__c != null) {
                exento = Math.min(bruto, cpt.Limite_Exento__c);
                sujeto = bruto - exento;
            }

            lineas.add(new Nom_Linea__c(
                Concepto__c       = cpt.Id,
                Codigo_Concepto__c = cpt.Codigo__c,
                Descripcion__c    = cpt.Name,
                Tipo__c           = 'Devengo',
                Cantidad__c       = c.Cantidad__c,
                Importe__c        = bruto,
                Importe_Exento__c = exento,
                Importe_Sujeto__c = sujeto,
                Cotiza_CC__c      = cpt.Base_CC__c == true,
                Cotiza_CP__c      = cpt.Base_CP_AT__c == true,
                Base_HHEE__c      = cpt.Base_HHEE__c,
                Tributa_IRPF__c   = cpt.Tributa_IRPF__c == true,
                Orden__c          = cpt.Orden__c,
                Signo__c          = 1
            ));
            ctx.importesDevengoPorCodigo.put(cpt.Codigo__c, bruto);
        }
    }

    private static Decimal resolverImporte(Nom_ContextoCalculo ctx, Nom_Concepto__c cpt, Nom_Condiciones__c cond) {
        String forma = cpt.Forma_Calculo__c;
        if (forma == 'ImporteFijo') {
            if (cond.Importe__c != null) { return cond.Importe__c; }
            return cpt.Importe_Fijo__c != null ? cpt.Importe_Fijo__c : 0;
        } else if (forma == 'PrecioCantidad') {
            Decimal precio = cond.Importe__c != null ? cond.Importe__c
                           : (cpt.Precio_Unidad__c != null ? cpt.Precio_Unidad__c : 0);
            Decimal cant = cond.Cantidad__c != null ? cond.Cantidad__c : 0;
            return precio * cant;
        } else if (forma == 'Porcentaje') {
            Decimal base = 0;
            if (cpt.Concepto_Base__r != null && cpt.Concepto_Base__r.Codigo__c != null) {
                base = ctx.importeDe(cpt.Concepto_Base__r.Codigo__c);
            }
            return base * pct(cpt.Porcentaje__c);
        } else if (forma == 'TablaConvenio') {
            return (ctx.categoria != null && ctx.categoria.Salario_Base_Mensual__c != null)
                 ? ctx.categoria.Salario_Base_Mensual__c : 0;
        } else if (forma == 'Apex') {
            if (String.isBlank(cpt.Clase_Apex__c)) { return 0; }
            Type t = Type.forName(cpt.Clase_Apex__c);
            if (t == null) { throw new CalculoException('Clase Apex no encontrada: ' + cpt.Clase_Apex__c); }
            Nom_ICalculoConcepto calc = (Nom_ICalculoConcepto) t.newInstance();
            return calc.calcular(ctx, cpt);
        }
        return 0;
    }

    // ------------------------------------------------------- 3) Bases

    private class Bases {
        Decimal cc = 0;
        Decimal cp = 0;
        Decimal hheeNormales = 0;
        Decimal hheeFuerza = 0;
        Decimal irpf = 0;
        Decimal hheeTotal { get { return hheeNormales + hheeFuerza; } }
    }

    private static Bases calcularBases(List<Nom_Linea__c> lineas) {
        Bases b = new Bases();
        for (Nom_Linea__c l : lineas) {
            if (l.Tipo__c != 'Devengo') { continue; }
            Decimal sujeto = l.Importe_Sujeto__c != null ? l.Importe_Sujeto__c : l.Importe__c;
            if (l.Cotiza_CC__c == true) { b.cc += sujeto; }
            if (l.Cotiza_CP__c == true) { b.cp += sujeto; }
            if (l.Tributa_IRPF__c == true) { b.irpf += sujeto; }
            if (l.Base_HHEE__c == 'Normales') { b.hheeNormales += l.Importe__c; }
            else if (l.Base_HHEE__c == 'FuerzaMayor') { b.hheeFuerza += l.Importe__c; }
        }
        // Las horas extra no entran en CC pero si en contingencias profesionales.
        b.cp += b.hheeTotal;
        b.cc = redondear(b.cc);
        b.cp = redondear(b.cp);
        b.irpf = redondear(b.irpf);
        return b;
    }

    private static Decimal aplicarTopes(Nom_ContextoCalculo ctx, Decimal baseCC) {
        Nom_Config_Cotizacion__c cfg = ctx.config;
        if (cfg.Base_Maxima__c != null && baseCC > cfg.Base_Maxima__c) { return cfg.Base_Maxima__c; }
        if (cfg.Base_Minima__c != null && baseCC > 0 && baseCC < cfg.Base_Minima__c) { return cfg.Base_Minima__c; }
        return baseCC;
    }

    // ------------------------------------------------------- 8) Recibo / persistencia

    private static Nom_Recibo__c construirRecibo(
            Nom_ContextoCalculo ctx, Bases bases, Decimal tipoIRPF,
            Decimal cuotaCC, Decimal cuotaDes, Decimal cuotaFP, Decimal cuotaHHEE,
            Decimal totalDevengado, Decimal totalDeducciones) {

        return new Nom_Recibo__c(
            Contrato__c       = ctx.contrato.Id,
            Empleado__c       = ctx.contrato.Empleado__c,
            Empresa__c        = ctx.contrato.Empleado__r.Empresa__c,
            Convenio__c       = ctx.contrato.Convenio__c,
            Periodo_Desde__c  = ctx.periodoDesde,
            Periodo_Hasta__c  = ctx.periodoHasta,
            Ejercicio__c      = ctx.ejercicio,
            Mes__c            = ctx.mes,
            Tipo_Liquidacion__c = 'Mensual',
            Dias_Cotizados__c = ctx.diasCotizados,
            Total_Devengado__c = totalDevengado,
            Total_Deducciones__c = totalDeducciones,
            Liquido__c        = redondear(totalDevengado - totalDeducciones),
            Base_CC__c        = bases.cc,
            Base_CP_AT__c     = bases.cp,
            Base_HHEE__c      = bases.hheeTotal,
            Base_IRPF__c      = bases.irpf,
            Tipo_IRPF__c      = tipoIRPF,
            Cuota_Trab_CC__c  = cuotaCC,
            Cuota_Trab_Desempleo__c = cuotaDes,
            Cuota_Trab_FP__c  = cuotaFP,
            Cuota_Trab_HHEE__c = cuotaHHEE,
            Estado__c         = 'Borrador',
            Fecha_Calculo__c  = System.now(),
            Snapshot_JSON__c  = construirSnapshot(ctx, tipoIRPF)
        );
    }

    private static String construirSnapshot(Nom_ContextoCalculo ctx, Decimal tipoIRPF) {
        Map<String, Object> snap = new Map<String, Object>{
            'ejercicio' => ctx.ejercicio,
            'configCotizacionId' => ctx.config.Id,
            'tipoIRPF' => tipoIRPF,
            'convenioId' => ctx.contrato.Convenio__c,
            'diasCotizados' => ctx.diasCotizados,
            'devengos' => ctx.importesDevengoPorCodigo
        };
        return JSON.serialize(snap);
    }

    private static void persistir(Nom_ContextoCalculo ctx, Nom_Recibo__c recibo, List<Nom_Linea__c> lineas) {
        // Idempotencia: elimina el borrador previo del mismo contrato/periodo (con sus lineas).
        List<Nom_Recibo__c> previos = [
            SELECT Id FROM Nom_Recibo__c
            WHERE Contrato__c = :ctx.contrato.Id
              AND Periodo_Desde__c = :ctx.periodoDesde
              AND Periodo_Hasta__c = :ctx.periodoHasta
              AND Estado__c = 'Borrador'
        ];
        if (!previos.isEmpty()) {
            delete [SELECT Id FROM Nom_Linea__c WHERE Recibo__c IN :previos];
            delete previos;
        }

        insert recibo;
        for (Nom_Linea__c l : lineas) {
            l.Recibo__c = recibo.Id;
        }
        if (!lineas.isEmpty()) {
            insert lineas;
        }
    }

    // ------------------------------------------------------- helpers

    private static void afnadirDeduccion(List<Nom_Linea__c> lineas, String codigo, String descripcion, Decimal importe) {
        if (importe == null || importe == 0) { return; }
        lineas.add(new Nom_Linea__c(
            Codigo_Concepto__c = codigo,
            Descripcion__c     = descripcion,
            Tipo__c            = 'Deduccion',
            Importe__c         = importe,
            Signo__c           = -1
        ));
    }

    private static Decimal pct(Decimal porcentaje) {
        return porcentaje == null ? 0 : porcentaje / 100;
    }

    private static Decimal redondear(Decimal v) {
        return v == null ? 0 : v.setScale(2, System.RoundingMode.HALF_UP);
    }
}