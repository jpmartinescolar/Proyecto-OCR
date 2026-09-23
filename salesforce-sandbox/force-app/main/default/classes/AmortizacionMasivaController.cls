public with sharing class AmortizacionMasivaController {

    public class Resumen {
        @AuraEnabled public Integer inmovilizadosAfectados;
        @AuraEnabled public Integer asientosACrear;
        @AuraEnabled public Integer apuntesACrear;
        @AuraEnabled public Decimal importeTotal;
        @AuraEnabled public List<ResumenEmpresa> porEmpresa;
    }

    public class ResumenEmpresa {
        @AuraEnabled public String empresa;
        @AuraEnabled public Integer inmovilizados;
        @AuraEnabled public Integer ok;
        @AuraEnabled public Integer parcial;
        @AuraEnabled public Integer duplicados;
        @AuraEnabled public Integer fueraPeriodo;
        @AuraEnabled public Integer sinCuadro;
        @AuraEnabled public Integer sinCuentas;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public List<ResumenInmovilizado> detalle;
    }

    public class ResumenInmovilizado {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  nombre;          // Name del registro (00000001)
        @AuraEnabled public String  titulo;          // Descripción del inmovilizado
        @AuraEnabled public Date    fechaInicio;
        @AuraEnabled public Decimal valorInicial;
        @AuraEnabled public Decimal coeficiente;
        @AuraEnabled public Integer ok;
        @AuraEnabled public Integer parcial;
        @AuraEnabled public Integer duplicados;
        @AuraEnabled public Integer fueraPeriodo;
        @AuraEnabled public Integer sinCuadro;
        @AuraEnabled public Integer sinCuentas;
        @AuraEnabled public Decimal importe;
    }

    public class ResultadoCuota {
        public Decimal cuota;
        public Integer dias;
        public String  estado;   // 'COMPLETO' | 'PARCIAL' | 'FUERA_INICIO' | 'FUERA_FIN' | 'SIN_CUADRO'
    }

    public class FilaMensual {
        @AuraEnabled public Integer mes;
        @AuraEnabled public String  mesNombre;
        @AuraEnabled public Decimal cuota;
        @AuraEnabled public Integer dias;
        @AuraEnabled public String  estado;
        @AuraEnabled public String  mensaje;
    }

    @AuraEnabled
    public static List<FilaMensual> obtenerDetalleMensual(Id inmovilizadoId, Integer anio, Integer mesDesde, Integer mesHasta) {
        List<FilaMensual> result = new List<FilaMensual>();
        if (inmovilizadoId == null) return result;
        if (mesDesde == null) mesDesde = 1;
        if (mesHasta == null) mesHasta = 12;

        List<Inmovilizados__c> inms = [
            SELECT Id, Name, Valor_inicial__c, Coeficiente__c, Fecha_inicio_amortizaci_n__c,
                   Cuenta_contable_amortizaci_n__c, Cuenta_contable_gasto_amortizacion__c
            FROM Inmovilizados__c WHERE Id = :inmovilizadoId LIMIT 1
        ];
        if (inms.isEmpty()) return result;
        Inmovilizados__c inm = inms[0];

        Decimal maximo = null;
        for (Tabla_de_amortizaci_n__c t : [
            SELECT Maximo__c FROM Tabla_de_amortizaci_n__c
            WHERE Inmovilizados__c = :inmovilizadoId AND Ejercicio__c = :String.valueOf(anio) LIMIT 1
        ]) {
            maximo = t.Maximo__c;
        }

        Date fechaIni = Date.newInstance(anio, mesDesde, 1);
        Date fechaFin = ultimoDiaMes(anio, mesHasta);
        Set<Integer> mesesConApunte = new Set<Integer>();
        for (Linea_asiento_contable__c l : [
            SELECT Asientos_contable__r.Fecha_asiento_contable__c
            FROM Linea_asiento_contable__c
            WHERE Inmovilizados__c = :inmovilizadoId
              AND Asientos_contable__r.Tipo_de_asiento__c = 'Amortización'
              AND Asientos_contable__r.Fecha_asiento_contable__c >= :fechaIni
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :fechaFin
        ]) {
            mesesConApunte.add(l.Asientos_contable__r.Fecha_asiento_contable__c.month());
        }

        for (Integer mes = mesDesde; mes <= mesHasta; mes++) {
            ResultadoCuota rc = calcularCuotaMes(inm, anio, mes, maximo);
            FilaMensual f = new FilaMensual();
            f.mes = mes;
            f.mesNombre = nombreMes(mes);
            f.cuota = rc.cuota;
            f.dias = rc.dias;
            if (rc.estado == 'SIN_CUADRO') {
                f.estado = 'SIN_CUADRO'; f.mensaje = 'Sin cuadro';
            } else if (rc.estado == 'FUERA_INICIO') {
                f.estado = 'FUERA_INICIO'; f.mensaje = 'Antes de adquisición';
            } else if (rc.estado == 'FUERA_FIN') {
                f.estado = 'FUERA_FIN'; f.mensaje = 'Fuera de período';
            } else if (mesesConApunte.contains(mes)) {
                f.estado = 'DUPLICADO'; f.mensaje = 'Ya existe';
            } else if (inm.Cuenta_contable_amortizaci_n__c == null ||
                       inm.Cuenta_contable_gasto_amortizacion__c == null) {
                f.estado = 'SIN_CUENTAS'; f.mensaje = 'Faltan cuentas';
            } else if (rc.estado == 'PARCIAL') {
                f.estado = 'OK_PARCIAL'; f.mensaje = 'Parcial · ' + rc.dias + ' día(s)';
            } else {
                f.estado = 'OK'; f.mensaje = 'OK';
            }
            result.add(f);
        }
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> obtenerEmpresasTitulares() {
        Set<String> empresas = new Set<String>();
        for (AggregateResult ar : [
            SELECT Empresa_titular__c emp
            FROM Inmovilizados__c
            WHERE Empresa_titular__c != null AND Estado__c != 'Baja'
            GROUP BY Empresa_titular__c
        ]) {
            String emp = (String) ar.get('emp');
            if (String.isNotBlank(emp)) empresas.add(emp);
        }
        List<String> lista = new List<String>(empresas);
        lista.sort();
        return lista;
    }

    @AuraEnabled
    public static Resumen obtenerPreview(List<String> empresasTitulares, Integer anio, Integer mesDesde, Integer mesHasta) {
        validar(empresasTitulares, anio, mesDesde, mesHasta);
        Resumen r = new Resumen();
        r.importeTotal = 0;
        Set<Id> inmovilizadosSet = new Set<Id>();
        Map<String, ResumenEmpresa> porEmpresa = new Map<String, ResumenEmpresa>();
        Map<String, Set<Id>> inmsPorEmpresa = new Map<String, Set<Id>>();

        List<Inmovilizados__c> inmovilizados = [
            SELECT Id, Name, T_tulo_inmovilizado__c, Valor_inicial__c, Coeficiente__c,
                   Fecha_inicio_amortizaci_n__c,
                   Empresa_titular__c, Cuenta_contable_amortizaci_n__c, Cuenta_contable_gasto_amortizacion__c
            FROM Inmovilizados__c
            WHERE Estado__c != 'Baja'
              AND Empresa_titular__c IN :empresasTitulares
              AND Valor_inicial__c != null AND Valor_inicial__c > 0
              AND Coeficiente__c   != null AND Coeficiente__c   > 0
              AND Fecha_inicio_amortizaci_n__c != null
        ];

        Set<Id> idsInm = new Set<Id>();
        for (Inmovilizados__c i : inmovilizados) idsInm.add(i.Id);

        // Cuadros de amortización del año target — Maximo__c es la fuente.
        Map<Id, Decimal> maximoAnio = new Map<Id, Decimal>();
        for (Tabla_de_amortizaci_n__c t : [
            SELECT Id, Inmovilizados__c, Ejercicio__c, Maximo__c
            FROM Tabla_de_amortizaci_n__c
            WHERE Inmovilizados__c IN :idsInm AND Ejercicio__c = :String.valueOf(anio)
        ]) {
            if (t.Maximo__c != null) maximoAnio.put(t.Inmovilizados__c, t.Maximo__c);
        }

        // Apuntes ya existentes (duplicados)
        Date fechaIniRango = Date.newInstance(anio, mesDesde, 1);
        Date fechaFinRango = ultimoDiaMes(anio, mesHasta);
        Map<String, Boolean> apuntesExistentes = new Map<String, Boolean>();
        for (Linea_asiento_contable__c l : [
            SELECT Inmovilizados__c, Asientos_contable__r.Fecha_asiento_contable__c
            FROM Linea_asiento_contable__c
            WHERE Inmovilizados__c IN :idsInm
              AND Asientos_contable__r.Tipo_de_asiento__c = 'Amortización'
              AND Asientos_contable__r.Fecha_asiento_contable__c >= :fechaIniRango
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :fechaFinRango
        ]) {
            Date f = l.Asientos_contable__r.Fecha_asiento_contable__c;
            apuntesExistentes.put(l.Inmovilizados__c + '|' + f.year() + '-' + f.month(), true);
        }

        Integer asientosACrear = 0;
        Map<String, List<ResumenInmovilizado>> detallePorEmpresa = new Map<String, List<ResumenInmovilizado>>();

        for (Inmovilizados__c i : inmovilizados) {
            Decimal maximo = maximoAnio.get(i.Id);
            String emp = i.Empresa_titular__c == null ? '(Sin empresa)' : i.Empresa_titular__c;
            ResumenEmpresa rEmp = porEmpresa.get(emp);
            if (rEmp == null) {
                rEmp = new ResumenEmpresa();
                rEmp.empresa = emp;
                rEmp.inmovilizados = 0;
                rEmp.ok = 0;
                rEmp.parcial = 0;
                rEmp.duplicados = 0;
                rEmp.fueraPeriodo = 0;
                rEmp.sinCuadro = 0;
                rEmp.sinCuentas = 0;
                rEmp.importe = 0;
                porEmpresa.put(emp, rEmp);
                inmsPorEmpresa.put(emp, new Set<Id>());
                detallePorEmpresa.put(emp, new List<ResumenInmovilizado>());
            }
            inmsPorEmpresa.get(emp).add(i.Id);

            ResumenInmovilizado rInm = new ResumenInmovilizado();
            rInm.id = i.Id;
            rInm.nombre = i.Name;
            rInm.titulo = i.T_tulo_inmovilizado__c;
            rInm.fechaInicio = i.Fecha_inicio_amortizaci_n__c;
            rInm.valorInicial = i.Valor_inicial__c;
            rInm.coeficiente = i.Coeficiente__c;
            rInm.ok = 0;
            rInm.parcial = 0;
            rInm.duplicados = 0;
            rInm.fueraPeriodo = 0;
            rInm.sinCuadro = 0;
            rInm.sinCuentas = 0;
            rInm.importe = 0;
            detallePorEmpresa.get(emp).add(rInm);

            for (Integer mes = mesDesde; mes <= mesHasta; mes++) {
                ResultadoCuota rc = calcularCuotaMes(i, anio, mes, maximo);
                String clave = i.Id + '|' + anio + '-' + mes;

                if (rc.estado == 'SIN_CUADRO') {
                    rEmp.sinCuadro++; rInm.sinCuadro++;
                } else if (rc.estado == 'FUERA_INICIO' || rc.estado == 'FUERA_FIN') {
                    rEmp.fueraPeriodo++; rInm.fueraPeriodo++;
                } else if (apuntesExistentes.containsKey(clave)) {
                    rEmp.duplicados++; rInm.duplicados++;
                } else if (i.Cuenta_contable_amortizaci_n__c == null ||
                           i.Cuenta_contable_gasto_amortizacion__c == null) {
                    rEmp.sinCuentas++; rInm.sinCuentas++;
                } else if (rc.estado == 'PARCIAL') {
                    rEmp.parcial++; rInm.parcial++;
                    rEmp.importe += rc.cuota; rInm.importe += rc.cuota;
                    r.importeTotal += rc.cuota;
                    inmovilizadosSet.add(i.Id);
                    asientosACrear++;
                } else if (rc.estado == 'COMPLETO') {
                    rEmp.ok++; rInm.ok++;
                    rEmp.importe += rc.cuota; rInm.importe += rc.cuota;
                    r.importeTotal += rc.cuota;
                    inmovilizadosSet.add(i.Id);
                    asientosACrear++;
                }
            }
        }

        for (String emp : porEmpresa.keySet()) {
            porEmpresa.get(emp).inmovilizados = inmsPorEmpresa.get(emp).size();
            porEmpresa.get(emp).detalle = detallePorEmpresa.get(emp);
        }

        r.porEmpresa = porEmpresa.values();
        r.porEmpresa.sort(new ResumenEmpresaComparator());
        r.inmovilizadosAfectados = inmovilizadosSet.size();
        r.asientosACrear = asientosACrear;
        r.apuntesACrear  = asientosACrear * 2;
        return r;
    }

    public class ResumenEmpresaComparator implements Comparator<ResumenEmpresa> {
        public Integer compare(ResumenEmpresa a, ResumenEmpresa b) {
            if (a.empresa == null && b.empresa == null) return 0;
            if (a.empresa == null) return 1;
            if (b.empresa == null) return -1;
            return a.empresa.compareTo(b.empresa);
        }
    }

    @AuraEnabled
    public static Id procesarAmortizacion(List<String> empresasTitulares, Integer anio, Integer mesDesde, Integer mesHasta) {
        validar(empresasTitulares, anio, mesDesde, mesHasta);
        AmortizacionMasivaQueueable job = new AmortizacionMasivaQueueable(
            empresasTitulares, anio, mesDesde, mesHasta, null
        );
        return System.enqueueJob(job);
    }

    @AuraEnabled
    public static Map<String, Object> obtenerEstadoJob(Id jobId) {
        Map<String, Object> resultado = new Map<String, Object>();
        if (jobId == null) return resultado;
        List<AsyncApexJob> jobs = [
            SELECT Id, Status, JobItemsProcessed, TotalJobItems, NumberOfErrors, CompletedDate, ExtendedStatus
            FROM AsyncApexJob WHERE Id = :jobId LIMIT 1
        ];
        if (jobs.isEmpty()) return resultado;
        AsyncApexJob j = jobs[0];
        resultado.put('status', j.Status);
        resultado.put('completed', j.CompletedDate != null);
        resultado.put('mensaje', j.ExtendedStatus);
        return resultado;
    }

    /* ---------------- helpers ---------------- */

    /**
     * Distribuye el Maximo__c del cuadro de ese ejercicio entre los meses, basándose en los días
     * realmente amortizables dentro del año. Devuelve cuota mensual, días aplicables y estado.
     */
    public static ResultadoCuota calcularCuotaMes(Inmovilizados__c inm, Integer anio, Integer mes, Decimal maximoAnio) {
        ResultadoCuota r = new ResultadoCuota();
        r.cuota = 0;
        r.dias = 0;

        if (maximoAnio == null || maximoAnio <= 0) {
            r.estado = 'SIN_CUADRO';
            return r;
        }

        Date fechaInicio   = inm.Fecha_inicio_amortizaci_n__c;
        Date primerDiaMes  = Date.newInstance(anio, mes, 1);
        Date ultimoDiaMes  = ultimoDiaMes(anio, mes);

        if (fechaInicio == null) {
            r.estado = 'FUERA_INICIO';
            return r;
        }

        // Mes anterior al inicio de amortización
        if (ultimoDiaMes < fechaInicio) {
            r.estado = 'FUERA_INICIO';
            return r;
        }

        // Determinar período amortizable del año
        Decimal cuotaAnualCompleta = (inm.Valor_inicial__c * inm.Coeficiente__c / 100);
        Date primerDiaAnio = Date.newInstance(anio, 1, 1);
        Date ultimoDiaAnio = Date.newInstance(anio, 12, 31);

        // Primer día amortizable del año = max(1/1/anio, fechaInicio)
        Date primerDiaAmort = fechaInicio > primerDiaAnio ? fechaInicio : primerDiaAnio;

        // Calcular días amortizables totales del año
        // Si Maximo == cuotaAnualCompleta y fechaInicio antes del año → año completo
        // Si Maximo < cuotaAnualCompleta → es año residual, último año
        Integer diasAnioCompleto = primerDiaAmort.daysBetween(ultimoDiaAnio) + 1;
        Integer diasAplicablesAnio;
        if (cuotaAnualCompleta > 0 && maximoAnio < cuotaAnualCompleta) {
            // Año residual: calculamos cuántos días equivalen al Maximo
            diasAplicablesAnio = Integer.valueOf((maximoAnio * 365 / cuotaAnualCompleta).round());
            if (diasAplicablesAnio < 1) diasAplicablesAnio = 1;
            if (diasAplicablesAnio > diasAnioCompleto) diasAplicablesAnio = diasAnioCompleto;
        } else {
            diasAplicablesAnio = diasAnioCompleto;
        }

        Date ultimoDiaAmort = primerDiaAmort.addDays(diasAplicablesAnio - 1);
        if (ultimoDiaAmort > ultimoDiaAnio) ultimoDiaAmort = ultimoDiaAnio;

        // Mes posterior al fin del período amortizable
        if (primerDiaMes > ultimoDiaAmort) {
            r.estado = 'FUERA_FIN';
            return r;
        }

        // Intersección mes ∩ período amortizable
        Date inicioMes = primerDiaMes > primerDiaAmort ? primerDiaMes : primerDiaAmort;
        Date finMes    = ultimoDiaMes < ultimoDiaAmort ? ultimoDiaMes : ultimoDiaAmort;

        if (inicioMes > finMes) {
            r.estado = 'FUERA_FIN';
            return r;
        }

        Integer diasAplicablesMes = inicioMes.daysBetween(finMes) + 1;
        Integer diasMesNaturales  = primerDiaMes.daysBetween(ultimoDiaMes) + 1;

        Decimal cuotaMes;
        if (finMes == ultimoDiaAmort) {
            // Último mes amortizable del año: absorbe el redondeo para que Σ(meses) = maximoAnio
            Decimal acumulado = 0;
            for (Integer m = primerDiaAmort.month(); m < mes; m++) {
                Date pmM  = Date.newInstance(anio, m, 1);
                Date umM  = ultimoDiaMes(anio, m);
                Date iniM = pmM > primerDiaAmort ? pmM : primerDiaAmort;
                Date finM = umM < ultimoDiaAmort ? umM : ultimoDiaAmort;
                if (iniM > finM) continue;
                Integer dM = iniM.daysBetween(finM) + 1;
                acumulado += (maximoAnio * dM / diasAplicablesAnio).setScale(2, System.RoundingMode.HALF_UP);
            }
            cuotaMes = (maximoAnio - acumulado).setScale(2, System.RoundingMode.HALF_UP);
            if (cuotaMes < 0) cuotaMes = 0;
        } else {
            cuotaMes = (maximoAnio * diasAplicablesMes / diasAplicablesAnio).setScale(2, System.RoundingMode.HALF_UP);
        }

        r.cuota = cuotaMes;
        r.dias  = diasAplicablesMes;
        r.estado = (diasAplicablesMes < diasMesNaturales) ? 'PARCIAL' : 'COMPLETO';
        return r;
    }

    public static Date ultimoDiaMes(Integer anio, Integer mes) {
        Date primero = Date.newInstance(anio, mes, 1);
        return primero.addMonths(1).addDays(-1);
    }

    public static String nombreMes(Integer mes) {
        List<String> nombres = new List<String>{
            'Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
        };
        if (mes < 1 || mes > 12) return String.valueOf(mes);
        return nombres[mes - 1];
    }

    private static void validar(List<String> empresasTitulares, Integer anio, Integer mesDesde, Integer mesHasta) {
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Selecciona al menos una empresa titular.');
        }
        if (anio == null || anio < 2000 || anio > 2100) {
            throw new AuraHandledException('Ejercicio no válido.');
        }
        if (mesDesde == null || mesHasta == null || mesDesde < 1 || mesHasta > 12 || mesDesde > mesHasta) {
            throw new AuraHandledException('Rango de meses no válido.');
        }
    }
}