public with sharing class TablaAmortizacionController {

    public class FilaAmortizacion {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  name;
        @AuraEnabled public String  ejercicio;
        @AuraEnabled public Decimal valorResidualContable;
        @AuraEnabled public Decimal maximo;
        @AuraEnabled public Decimal amortizado;
        @AuraEnabled public Decimal pendienteAmortizacion;
        @AuraEnabled public Decimal amortizacionApunte;
        @AuraEnabled public Decimal amortizacionForzada;
    }

    public class ResumenAmortizacion {
        @AuraEnabled public Decimal valorInicial;
        @AuraEnabled public List<FilaAmortizacion> filas;
    }

    @AuraEnabled(cacheable=true)
    public static ResumenAmortizacion obtenerTabla(Id inmovilizadoId) {
        ResumenAmortizacion resumen = new ResumenAmortizacion();
        resumen.filas = new List<FilaAmortizacion>();

        if (inmovilizadoId == null) {
            return resumen;
        }

        Inmovilizados__c inm = [
            SELECT Id, Valor_inicial__c
            FROM Inmovilizados__c
            WHERE Id = :inmovilizadoId
            LIMIT 1
        ];
        resumen.valorInicial = inm.Valor_inicial__c == null ? 0 : inm.Valor_inicial__c;

        List<Tabla_de_amortizaci_n__c> registros = [
            SELECT Id, Name, Ejercicio__c, Maximo__c, Amortizado__c,
                   Pendiente_amortizaci_n__c, Amortizaci_n_Apuntes__c, Amortizaci_n_forzada__c
            FROM Tabla_de_amortizaci_n__c
            WHERE Inmovilizados__c = :inmovilizadoId
        ];

        registros.sort(new TablaAmortizacionComparator());

        Decimal saldo = resumen.valorInicial;
        for (Tabla_de_amortizaci_n__c r : registros) {
            FilaAmortizacion fila = new FilaAmortizacion();
            fila.id                    = r.Id;
            fila.name                  = r.Name;
            fila.ejercicio             = r.Ejercicio__c;
            fila.maximo                = r.Maximo__c == null ? 0 : r.Maximo__c;
            fila.amortizado            = r.Amortizado__c == null ? 0 : r.Amortizado__c;
            fila.pendienteAmortizacion = r.Pendiente_amortizaci_n__c == null ? 0 : r.Pendiente_amortizaci_n__c;
            fila.amortizacionApunte    = r.Amortizaci_n_Apuntes__c == null ? 0 : r.Amortizaci_n_Apuntes__c;
            fila.amortizacionForzada   = r.Amortizaci_n_forzada__c == null ? 0 : r.Amortizaci_n_forzada__c;
            saldo = saldo - fila.maximo;
            fila.valorResidualContable = saldo;
            resumen.filas.add(fila);
        }

        return resumen;
    }

    @AuraEnabled
    public static void guardarCambios(List<Map<String, Object>> draftValues) {
        if (draftValues == null || draftValues.isEmpty()) return;
        List<Tabla_de_amortizaci_n__c> updates = new List<Tabla_de_amortizaci_n__c>();
        for (Map<String, Object> d : draftValues) {
            Id rowId = (Id) d.get('id');
            if (rowId == null) continue;
            Tabla_de_amortizaci_n__c t = new Tabla_de_amortizaci_n__c(Id = rowId);
            if (d.containsKey('maximo')) {
                t.Maximo__c = parseDec(d.get('maximo'));
            }
            if (d.containsKey('amortizacionForzada')) {
                t.Amortizaci_n_forzada__c = parseDec(d.get('amortizacionForzada'));
            }
            updates.add(t);
        }
        if (!updates.isEmpty()) {
            try {
                update updates;
            } catch (DmlException ex) {
                throw new AuraHandledException('Error al guardar: ' + ex.getDmlMessage(0));
            }
        }
    }

    private static Decimal parseDec(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v);
        if (String.isBlank(s)) return null;
        try {
            return Decimal.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }

    @AuraEnabled
    public static String generarCuadroAmortizacion(Id inmovilizadoId) {
        if (inmovilizadoId == null) {
            throw new AuraHandledException('No se ha indicado el inmovilizado.');
        }

        Integer existentes = [
            SELECT COUNT() FROM Tabla_de_amortizaci_n__c WHERE Inmovilizados__c = :inmovilizadoId
        ];
        if (existentes > 0) {
            throw new AuraHandledException(
                'No se puede crear tabla de amortización porque ya existe. Habla con tu administrador.'
            );
        }

        Inmovilizados__c inm = [
            SELECT Id, Valor_inicial__c, Coeficiente__c, Fecha_inicio_amortizaci_n__c
            FROM Inmovilizados__c
            WHERE Id = :inmovilizadoId
            LIMIT 1
        ];

        if (inm.Valor_inicial__c == null || inm.Valor_inicial__c <= 0) {
            throw new AuraHandledException('El inmovilizado no tiene un Valor inicial válido.');
        }
        if (inm.Coeficiente__c == null || inm.Coeficiente__c <= 0) {
            throw new AuraHandledException('El inmovilizado no tiene un Coeficiente válido.');
        }
        if (inm.Fecha_inicio_amortizaci_n__c == null) {
            throw new AuraHandledException('El inmovilizado no tiene Fecha de inicio de amortización.');
        }
        Date fechaInicio = inm.Fecha_inicio_amortizaci_n__c;

        Decimal valorInicial = inm.Valor_inicial__c;
        Decimal coef = inm.Coeficiente__c;

        Decimal cuotaAnual = (valorInicial * coef / 100).setScale(2, System.RoundingMode.HALF_UP);

        if (cuotaAnual <= 0) {
            throw new AuraHandledException('La cuota anual calculada es 0. Revisa Valor inicial y Coeficiente.');
        }

        List<Tabla_de_amortizaci_n__c> nuevos = new List<Tabla_de_amortizaci_n__c>();
        Decimal pendiente = valorInicial;
        Integer anio = fechaInicio.year();
        Boolean primero = true;
        Integer salvavidas = 0;

        while (pendiente > 0 && salvavidas < 200) {
            Decimal cuota;
            if (primero) {
                Date ultimoDiaAnio = Date.newInstance(anio, 12, 31);
                Integer diasProrr  = fechaInicio.daysBetween(ultimoDiaAnio) + 1;
                cuota = (cuotaAnual * diasProrr / 365).setScale(2, System.RoundingMode.HALF_UP);
                primero = false;
            } else {
                cuota = cuotaAnual;
            }

            if (cuota > pendiente) {
                cuota = pendiente;
            }

            Tabla_de_amortizaci_n__c t = new Tabla_de_amortizaci_n__c();
            t.Inmovilizados__c = inmovilizadoId;
            t.Ejercicio__c = String.valueOf(anio);
            t.Maximo__c = cuota;
            nuevos.add(t);

            pendiente -= cuota;
            anio++;
            salvavidas++;
        }

        try {
            insert nuevos;
        } catch (DmlException ex) {
            throw new AuraHandledException(
                'Error al crear los registros: ' + ex.getDmlMessage(0)
            );
        }

        return 'Se han creado ' + nuevos.size() + ' registros del cuadro de amortización.';
    }

    public class TablaAmortizacionComparator implements Comparator<Tabla_de_amortizaci_n__c> {
        public Integer compare(Tabla_de_amortizaci_n__c a, Tabla_de_amortizaci_n__c b) {
            Integer ea = parseEjercicio(a.Ejercicio__c);
            Integer eb = parseEjercicio(b.Ejercicio__c);
            if (ea == eb) return 0;
            return ea < eb ? -1 : 1;
        }
        private Integer parseEjercicio(String v) {
            if (String.isBlank(v)) return 9999;
            try { return Integer.valueOf(v); } catch (Exception e) { return 9999; }
        }
    }
}