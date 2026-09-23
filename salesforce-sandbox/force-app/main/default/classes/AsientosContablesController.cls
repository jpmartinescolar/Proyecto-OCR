/**
 * Controlador del componente "Asientos contables":
 *  - Listado de los últimos asientos con buscador que rastrea los APUNTES
 *    (importe en Debe/Haber/Saldo con modos Exacto/Similar/Mayor/Menor,
 *    y texto en nº de asiento, observaciones o descripción del apunte).
 *  - Alta y modificación de asientos con validación de cuadre (Debe = Haber):
 *    nunca se guarda un asiento descuadrado.
 */
public with sharing class AsientosContablesController {

    private static final Integer MAX_RESULTADOS = 50;

    // ------------------------------------------------------------------ DTOs
    public class LineaDTO {
        @AuraEnabled public Id      lineaId;
        @AuraEnabled public Id      cuentaId;
        @AuraEnabled public String  cuentaNumero;
        @AuraEnabled public String  cuentaTitulo;
        @AuraEnabled public String  comentario;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public Decimal saldo;
        @AuraEnabled public String  simulacion;
    }

    public class AsientoDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  empresa;
        @AuraEnabled public String  canal;
        @AuraEnabled public String  tipo;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal totalDebe;
        @AuraEnabled public Decimal totalHaber;
        @AuraEnabled public Decimal diferencia;
        @AuraEnabled public Boolean cuadrado;
        @AuraEnabled public List<LineaDTO> lineas;
    }

    public class ResultadoBusqueda {
        @AuraEnabled public List<AsientoDTO> asientos;
        @AuraEnabled public Boolean hayMas;
    }

    public class Opciones {
        @AuraEnabled public List<String> empresas;
        @AuraEnabled public List<String> canales;
        @AuraEnabled public List<String> tipos;
    }

    public class CuentaDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public String titulo;
    }

    // ------------------------------------------------------------------ OPCIONES
    @AuraEnabled(cacheable=true)
    public static Opciones getOpciones() {
        Opciones o = new Opciones();
        o.empresas = picklist('Asiento_contable__c', 'Empresa_titular__c');
        o.canales  = picklist('Asiento_contable__c', 'Canal__c');
        o.tipos    = picklist('Asiento_contable__c', 'Tipo_de_asiento__c');
        return o;
    }

    private static List<String> picklist(String objApi, String fieldApi) {
        List<String> out = new List<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return out;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    // ------------------------------------------------------------------ LOOKUP DE CUENTAS
    @AuraEnabled
    public static List<CuentaDTO> buscarCuentas(String termino) {
        List<CuentaDTO> out = new List<CuentaDTO>();
        if (String.isBlank(termino)) return out;
        String t = '%' + String.escapeSingleQuotes(termino.trim()) + '%';
        String tIni = String.escapeSingleQuotes(termino.trim()) + '%';
        for (Plan_general_contable__c p : [
            SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c
            WHERE Name LIKE :tIni OR T_tulo_cuenta__c LIKE :t
            ORDER BY Name ASC LIMIT 20
        ]) {
            CuentaDTO c = new CuentaDTO();
            c.id = p.Id; c.numero = p.Name;
            c.titulo = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
            out.add(c);
        }
        return out;
    }

    // ------------------------------------------------------------------ BUSCAR ASIENTOS
    @AuraEnabled
    public static ResultadoBusqueda buscarAsientos(
        String  empresaTitular,
        Date    desde,
        Date    hasta,
        String  tipo,
        String  texto,          // nº de asiento, observaciones o descripción del apunte
        String  campoImporte,   // 'Debe' | 'Haber' | 'Saldo'
        String  modoImporte,    // 'Exacto' | 'Similar' | 'Mayor' | 'Menor'
        Decimal importe,
        Integer offsetFilas     // paginación "Ver más": 0, 50, 100...
    ) {
        if (String.isBlank(empresaTitular)) throw new AuraHandledException('Debes seleccionar la empresa titular.');
        if (desde == null || hasta == null)  throw new AuraHandledException('Debes indicar las fechas Desde y Hasta.');

        // --- 1) Criterios a nivel de APUNTE: ids de asientos que tienen algún apunte que casa ---
        Set<Id> idsPorImporte = null;
        if (importe != null) {
            String campo = (campoImporte == 'Haber') ? 'Haber__c' : (campoImporte == 'Saldo') ? 'Saldo__c' : 'Debe__c';
            String cond;
            if (modoImporte == 'Similar') {
                Decimal margen = (importe.abs() * 0.05).setScale(2, System.RoundingMode.HALF_UP);
                if (margen < 1) margen = 1;
                Decimal vMin = importe - margen, vMax = importe + margen;
                cond = campo + ' >= :vMin AND ' + campo + ' <= :vMax';
                idsPorImporte = idsDeApuntes(cond, empresaTitular, desde, hasta, null, vMin, vMax);
            } else if (modoImporte == 'Mayor') {
                cond = campo + ' >= :vUnico';
                idsPorImporte = idsDeApuntes(cond, empresaTitular, desde, hasta, importe, null, null);
            } else if (modoImporte == 'Menor') {
                cond = campo + ' <= :vUnico';
                idsPorImporte = idsDeApuntes(cond, empresaTitular, desde, hasta, importe, null, null);
            } else {
                cond = campo + ' = :vUnico';
                idsPorImporte = idsDeApuntes(cond, empresaTitular, desde, hasta, importe, null, null);
            }
        }

        Set<Id> idsPorTexto = null;
        if (String.isNotBlank(texto)) {
            idsPorTexto = new Set<Id>();
            String tPlano = texto.trim().toLowerCase();
            String tLike = '%' + String.escapeSingleQuotes(texto.trim()) + '%';   // para la descripción del apunte
            // Nº de asiento (filtrable) + Observaciones (long text: se filtra en memoria)
            for (Asiento_contable__c a : [
                SELECT Id, Name, Observaciones__c FROM Asiento_contable__c
                WHERE Empresa_titular__c = :empresaTitular
                  AND Fecha_asiento_contable__c >= :desde AND Fecha_asiento_contable__c <= :hasta
                ORDER BY Fecha_asiento_contable__c DESC
                LIMIT 5000
            ]) {
                Boolean casaNombre = (a.Name != null && a.Name.toLowerCase().contains(tPlano));
                Boolean casaObs = (a.Observaciones__c != null && a.Observaciones__c.toLowerCase().contains(tPlano));
                if (casaNombre || casaObs) idsPorTexto.add(a.Id);
            }
            for (AggregateResult ar : [
                SELECT Asientos_contable__c a FROM Linea_asiento_contable__c
                WHERE Empresa_titular__c = :empresaTitular
                  AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde
                  AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta
                  AND Descripci_n__c LIKE :tLike
                  AND Asientos_contable__c != null
                GROUP BY Asientos_contable__c LIMIT 2000
            ]) { idsPorTexto.add((Id) ar.get('a')); }
        }

        // Intersección de criterios de apunte
        Set<Id> idsFiltro = null;
        if (idsPorImporte != null && idsPorTexto != null) {
            idsFiltro = new Set<Id>();
            for (Id i : idsPorImporte) if (idsPorTexto.contains(i)) idsFiltro.add(i);
        } else if (idsPorImporte != null) idsFiltro = idsPorImporte;
        else if (idsPorTexto != null)     idsFiltro = idsPorTexto;
        ResultadoBusqueda resultado = new ResultadoBusqueda();
        resultado.asientos = new List<AsientoDTO>();
        resultado.hayMas = false;
        if (idsFiltro != null && idsFiltro.isEmpty()) return resultado;

        // --- 2) Asientos (últimos primero) ---
        String soql = 'SELECT Id, Name, Fecha_asiento_contable__c, Empresa_titular__c, Canal__c, '
                    + 'Tipo_de_asiento__c, Observaciones__c, Total_Debe__c, Total_Haber__c, Diferencia__c '
                    + 'FROM Asiento_contable__c '
                    + 'WHERE Empresa_titular__c = :empresaTitular '
                    + 'AND Fecha_asiento_contable__c >= :desde AND Fecha_asiento_contable__c <= :hasta ';
        if (String.isNotBlank(tipo) && tipo != 'Todos') soql += 'AND Tipo_de_asiento__c = :tipo ';
        if (idsFiltro != null) soql += 'AND Id IN :idsFiltro ';
        Integer off = (offsetFilas == null || offsetFilas < 0) ? 0 : offsetFilas;
        if (off > 2000) off = 2000;   // límite de OFFSET en SOQL
        // Se pide una fila de más para saber si hay otra página
        soql += 'ORDER BY Fecha_asiento_contable__c DESC, Name DESC LIMIT ' + (MAX_RESULTADOS + 1) + ' OFFSET ' + off;
        List<Asiento_contable__c> asientos = Database.query(soql);
        if (asientos.size() > MAX_RESULTADOS) {
            resultado.hayMas = true;
            asientos.remove(asientos.size() - 1);
        }
        if (asientos.isEmpty()) return resultado;

        // --- 3) Apuntes de esos asientos ---
        Map<Id, List<LineaDTO>> lineasPor = new Map<Id, List<LineaDTO>>();
        for (Linea_asiento_contable__c l : [
            SELECT Id, Plan__c, Plan__r.Name, Plan__r.T_tulo_cuenta__c, Descripci_n__c,
                   Debe__c, Haber__c, Saldo__c, Simulaci_n__c, Asientos_contable__c
            FROM Linea_asiento_contable__c
            WHERE Asientos_contable__c IN :asientos
            ORDER BY Name ASC
        ]) {
            if (!lineasPor.containsKey(l.Asientos_contable__c)) lineasPor.put(l.Asientos_contable__c, new List<LineaDTO>());
            lineasPor.get(l.Asientos_contable__c).add(toLineaDTO(l));
        }

        for (Asiento_contable__c a : asientos) {
            AsientoDTO d = new AsientoDTO();
            d.id = a.Id; d.numero = a.Name;
            d.fecha = a.Fecha_asiento_contable__c;
            d.empresa = a.Empresa_titular__c;
            d.canal = a.Canal__c;
            d.tipo = a.Tipo_de_asiento__c;
            d.descripcion = a.Observaciones__c;
            d.totalDebe  = z(a.Total_Debe__c);
            d.totalHaber = z(a.Total_Haber__c);
            d.diferencia = z(a.Diferencia__c);
            d.cuadrado = (d.diferencia == 0);
            d.lineas = lineasPor.containsKey(a.Id) ? lineasPor.get(a.Id) : new List<LineaDTO>();
            resultado.asientos.add(d);
        }
        return resultado;
    }

    private static Set<Id> idsDeApuntes(String cond, String empresa, Date desde, Date hasta,
                                        Decimal vUnico, Decimal vMin, Decimal vMax) {
        Set<Id> ids = new Set<Id>();
        String soql = 'SELECT Asientos_contable__c a FROM Linea_asiento_contable__c '
                    + 'WHERE Empresa_titular__c = :empresa '
                    + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                    + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                    + 'AND Asientos_contable__c != null AND ' + cond + ' '
                    + 'GROUP BY Asientos_contable__c LIMIT 2000';
        for (AggregateResult ar : Database.query(soql)) ids.add((Id) ar.get('a'));
        return ids;
    }

    private static LineaDTO toLineaDTO(Linea_asiento_contable__c l) {
        LineaDTO d = new LineaDTO();
        d.lineaId = l.Id;
        d.cuentaId = l.Plan__c;
        d.cuentaNumero = (l.Plan__r == null) ? '' : l.Plan__r.Name;
        d.cuentaTitulo = (l.Plan__r == null || l.Plan__r.T_tulo_cuenta__c == null) ? '' : l.Plan__r.T_tulo_cuenta__c;
        d.comentario = l.Descripci_n__c;
        d.debe = z(l.Debe__c);
        d.haber = z(l.Haber__c);
        d.saldo = z(l.Saldo__c);
        d.simulacion = l.Simulaci_n__c;
        return d;
    }

    // ------------------------------------------------------------------ GUARDAR
    /** Entrada de línea desde el editor (JSON): lineaId, cuentaId, comentario, debe, haber */
    public class LineaInput {
        public Id lineaId;
        public Id cuentaId;
        public String comentario;
        public Decimal debe;
        public Decimal haber;
    }

    @AuraEnabled
    public static AsientoDTO guardarAsiento(
        Id     asientoId,
        Date   fecha,
        String empresaTitular,
        String canal,
        String tipo,
        String descripcion,
        String lineasJson,
        List<Id> lineasEliminadas
    ) {
        if (fecha == null)                        throw new AuraHandledException('Debes indicar la fecha contable.');
        if (String.isBlank(empresaTitular))       throw new AuraHandledException('Debes indicar la empresa titular.');
        if (String.isBlank(tipo))                 throw new AuraHandledException('Debes indicar el tipo de asiento.');
        List<LineaInput> lineas = (List<LineaInput>) JSON.deserialize(
            String.isBlank(lineasJson) ? '[]' : lineasJson, List<LineaInput>.class);

        // Validación de líneas y cuadre — NUNCA se guarda descuadrado
        List<LineaInput> validas = new List<LineaInput>();
        Decimal totalDebe = 0, totalHaber = 0;
        for (LineaInput l : lineas) {
            Decimal d = (l.debe == null) ? 0 : l.debe.setScale(2, System.RoundingMode.HALF_UP);
            Decimal h = (l.haber == null) ? 0 : l.haber.setScale(2, System.RoundingMode.HALF_UP);
            if (d == 0 && h == 0 && l.cuentaId == null) continue;   // línea vacía: se ignora
            if (l.cuentaId == null) throw new AuraHandledException('Hay una línea con importe pero sin cuenta contable.');
            if (d < 0 || h < 0)     throw new AuraHandledException('Los importes no pueden ser negativos: usa la columna contraria.');
            l.debe = d; l.haber = h;
            totalDebe += d; totalHaber += h;
            validas.add(l);
        }
        if (validas.isEmpty()) throw new AuraHandledException('El asiento no tiene ningún apunte.');
        if ((totalDebe - totalHaber).abs() >= 0.005) {
            throw new AuraHandledException('El asiento está descuadrado (Debe ' + totalDebe + ' / Haber ' + totalHaber + '). No se puede guardar.');
        }

        Savepoint sp = Database.setSavepoint();
        try {
            Asiento_contable__c a = (asientoId == null)
                ? new Asiento_contable__c()
                : new Asiento_contable__c(Id = asientoId);
            a.Fecha_asiento_contable__c = fecha;
            a.Empresa_titular__c = empresaTitular;
            a.Canal__c = String.isBlank(canal) ? '001 General' : canal;
            a.Tipo_de_asiento__c = tipo;
            a.Observaciones__c = descripcion;
            upsert a;

            if (lineasEliminadas != null && !lineasEliminadas.isEmpty()) {
                delete [SELECT Id FROM Linea_asiento_contable__c WHERE Id IN :lineasEliminadas AND Asientos_contable__c = :a.Id];
            }

            List<Linea_asiento_contable__c> dml = new List<Linea_asiento_contable__c>();
            for (LineaInput l : validas) {
                Linea_asiento_contable__c reg = (l.lineaId == null)
                    ? new Linea_asiento_contable__c(Asientos_contable__c = a.Id)
                    : new Linea_asiento_contable__c(Id = l.lineaId);
                reg.Plan__c = l.cuentaId;
                reg.Debe__c = l.debe;
                reg.Haber__c = l.haber;
                reg.Descripci_n__c = l.comentario;
                reg.Empresa_titular__c = empresaTitular;   // misma empresa que la cabecera
                if (l.lineaId == null) reg.Simulaci_n__c = 'No';   // las existentes conservan su simulación
                reg.Check__c = 'Si';
                dml.add(reg);
            }
            upsert dml;

            // Garantía: TODOS los apuntes del asiento con la empresa titular de la cabecera
            List<Linea_asiento_contable__c> corregirEmpresa = new List<Linea_asiento_contable__c>();
            for (Linea_asiento_contable__c l : [
                SELECT Id FROM Linea_asiento_contable__c
                WHERE Asientos_contable__c = :a.Id AND Empresa_titular__c != :empresaTitular
            ]) {
                corregirEmpresa.add(new Linea_asiento_contable__c(Id = l.Id, Empresa_titular__c = empresaTitular));
            }
            if (!corregirEmpresa.isEmpty()) update corregirEmpresa;

            Asiento_contable__c creado = [SELECT Id, Name FROM Asiento_contable__c WHERE Id = :a.Id];
            AsientoDTO out = new AsientoDTO();
            out.id = creado.Id; out.numero = creado.Name;
            return out;
        } catch (AuraHandledException e) {
            Database.rollback(sp); throw e;
        } catch (Exception ex) {
            Database.rollback(sp);
            throw new AuraHandledException('Error guardando el asiento (no se ha guardado nada): ' + ex.getMessage());
        }
    }

    private static Decimal z(Decimal v) { return v == null ? 0 : v; }
}