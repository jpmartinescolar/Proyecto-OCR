public with sharing class AmortizacionMasivaQueueable implements Queueable {

    private static final Integer CHUNK_INMOVILIZADOS = 100;

    private List<String> empresas;
    private Integer anio;
    private Integer mesDesde;
    private Integer mesHasta;
    private Set<Id> idsPendientes;

    public AmortizacionMasivaQueueable(List<String> empresas, Integer anio, Integer mesDesde, Integer mesHasta, Set<Id> idsPendientes) {
        this.empresas      = empresas;
        this.anio          = anio;
        this.mesDesde      = mesDesde;
        this.mesHasta      = mesHasta;
        this.idsPendientes = idsPendientes;
    }

    public void execute(QueueableContext ctx) {
        Set<Id> idsRestantes;
        if (idsPendientes != null) {
            idsRestantes = idsPendientes;
        } else {
            idsRestantes = new Set<Id>();
            for (Inmovilizados__c i : [
                SELECT Id
                FROM Inmovilizados__c
                WHERE Estado__c != 'Baja'
                  AND Empresa_titular__c IN :empresas
                  AND Valor_inicial__c != null AND Valor_inicial__c > 0
                  AND Coeficiente__c   != null AND Coeficiente__c   > 0
                  AND Fecha_inicio_amortizaci_n__c != null
                  AND Cuenta_contable_amortizaci_n__c != null
                  AND Cuenta_contable_gasto_amortizacion__c != null
            ]) {
                idsRestantes.add(i.Id);
            }
        }

        if (idsRestantes.isEmpty()) return;

        Set<Id> chunk = new Set<Id>();
        Iterator<Id> it = idsRestantes.iterator();
        while (it.hasNext() && chunk.size() < CHUNK_INMOVILIZADOS) {
            chunk.add(it.next());
        }
        Set<Id> resto = new Set<Id>();
        for (Id idx : idsRestantes) {
            if (!chunk.contains(idx)) resto.add(idx);
        }

        List<Inmovilizados__c> inms = [
            SELECT Id, Name, Valor_inicial__c, Coeficiente__c,
                   Fecha_inicio_amortizaci_n__c,
                   Empresa_titular__c, Cuenta_contable_amortizaci_n__c, Cuenta_contable_gasto_amortizacion__c
            FROM Inmovilizados__c
            WHERE Id IN :chunk
        ];

        // Maximo del cuadro de amortización del año target por inmovilizado
        Map<Id, Decimal> maximoAnio = new Map<Id, Decimal>();
        Map<Id, Id> tablaPorInm = new Map<Id, Id>();
        for (Tabla_de_amortizaci_n__c t : [
            SELECT Id, Inmovilizados__c, Maximo__c
            FROM Tabla_de_amortizaci_n__c
            WHERE Inmovilizados__c IN :chunk AND Ejercicio__c = :String.valueOf(anio)
        ]) {
            if (t.Maximo__c != null) maximoAnio.put(t.Inmovilizados__c, t.Maximo__c);
            tablaPorInm.put(t.Inmovilizados__c, t.Id);
        }

        // Apuntes existentes (duplicados a evitar)
        Date fechaIniRango = Date.newInstance(anio, mesDesde, 1);
        Date fechaFinRango = AmortizacionMasivaController.ultimoDiaMes(anio, mesHasta);
        Map<String, Boolean> duplicados = new Map<String, Boolean>();
        for (Linea_asiento_contable__c l : [
            SELECT Inmovilizados__c, Asientos_contable__r.Fecha_asiento_contable__c
            FROM Linea_asiento_contable__c
            WHERE Inmovilizados__c IN :chunk
              AND Asientos_contable__r.Tipo_de_asiento__c = 'Amortización'
              AND Asientos_contable__r.Fecha_asiento_contable__c >= :fechaIniRango
              AND Asientos_contable__r.Fecha_asiento_contable__c <= :fechaFinRango
        ]) {
            Date f = l.Asientos_contable__r.Fecha_asiento_contable__c;
            duplicados.put(l.Inmovilizados__c + '|' + f.year() + '-' + f.month(), true);
        }

        List<Asiento_contable__c> asientos = new List<Asiento_contable__c>();
        List<Inmovilizados__c>    inmsParaAsiento = new List<Inmovilizados__c>();
        List<Integer>             mesesParaAsiento = new List<Integer>();
        List<Decimal>             cuotasParaAsiento = new List<Decimal>();
        List<Id>                  tablasParaAsiento = new List<Id>();
        List<Integer>             diasParaAsiento = new List<Integer>();

        for (Inmovilizados__c inm : inms) {
            Decimal maxAnio = maximoAnio.get(inm.Id);
            if (maxAnio == null) continue; // sin cuadro para este año

            for (Integer mes = mesDesde; mes <= mesHasta; mes++) {
                AmortizacionMasivaController.ResultadoCuota rc =
                    AmortizacionMasivaController.calcularCuotaMes(inm, anio, mes, maxAnio);
                if (rc.estado == 'FUERA_INICIO' || rc.estado == 'FUERA_FIN' || rc.estado == 'SIN_CUADRO') continue;
                if (rc.cuota == null || rc.cuota <= 0) continue;

                String clave = inm.Id + '|' + anio + '-' + mes;
                if (duplicados.containsKey(clave)) continue;

                Asiento_contable__c a = new Asiento_contable__c();
                a.Canal__c = '001 General';
                a.Fecha_asiento_contable__c = AmortizacionMasivaController.ultimoDiaMes(anio, mes);
                a.Tipo_de_asiento__c = 'Amortización';
                a.Empresa_titular__c = inm.Empresa_titular__c;
                asientos.add(a);

                inmsParaAsiento.add(inm);
                mesesParaAsiento.add(mes);
                cuotasParaAsiento.add(rc.cuota);
                tablasParaAsiento.add(tablaPorInm.get(inm.Id));
                diasParaAsiento.add(rc.dias);
            }
        }

        if (asientos.isEmpty()) {
            if (!resto.isEmpty()) {
                System.enqueueJob(new AmortizacionMasivaQueueable(empresas, anio, mesDesde, mesHasta, resto));
            }
            return;
        }

        insert asientos;

        List<Linea_asiento_contable__c> apuntes = new List<Linea_asiento_contable__c>();
        for (Integer k = 0; k < asientos.size(); k++) {
            Asiento_contable__c a = asientos[k];
            Inmovilizados__c inm  = inmsParaAsiento[k];
            Integer mes  = mesesParaAsiento[k];
            Decimal cuota = cuotasParaAsiento[k];
            Id tablaId   = tablasParaAsiento[k];
            Integer dias = diasParaAsiento[k];

            String descripcion = 'Amortización ' + AmortizacionMasivaController.nombreMes(mes) + ' ' + anio
                + ' (' + dias + ' día' + (dias == 1 ? '' : 's') + ')';

            // Debe: cuenta gasto (68) — lleva los lookups Inmovilizado y Tabla de amortización
            Linea_asiento_contable__c debe = new Linea_asiento_contable__c();
            debe.Asientos_contable__c = a.Id;
            debe.Plan__c              = inm.Cuenta_contable_gasto_amortizacion__c;
            debe.Debe__c              = cuota;
            debe.Haber__c             = 0;
            debe.Descripci_n__c       = descripcion;
            debe.Inmovilizados__c     = inm.Id;
            debe.Empresa_titular__c   = inm.Empresa_titular__c;
            if (tablaId != null) debe.Tabla_de_amortizaci_n__c = tablaId;
            apuntes.add(debe);

            // Haber: cuenta amortización acumulada (28) — SIN lookups Inmovilizado ni Tabla
            Linea_asiento_contable__c haber = new Linea_asiento_contable__c();
            haber.Asientos_contable__c = a.Id;
            haber.Plan__c              = inm.Cuenta_contable_amortizaci_n__c;
            haber.Debe__c              = 0;
            haber.Haber__c             = cuota;
            haber.Descripci_n__c       = descripcion;
            haber.Empresa_titular__c   = inm.Empresa_titular__c;
            apuntes.add(haber);
        }

        insert apuntes;

        // Encadenar el siguiente chunk si queda
        if (!resto.isEmpty()) {
            System.enqueueJob(new AmortizacionMasivaQueueable(empresas, anio, mesDesde, mesHasta, resto));
        }
    }
}