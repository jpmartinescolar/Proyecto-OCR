/**
 * Endpoint REST del Portal React (UI Bundle externo) que devuelve SOLO agregados
 * sobre la cartera de clientes: totales y recuentos por provincia, tipo y tamaño.
 *
 * Endpoint: GET /services/apexrest/portalreact/estadisticas
 *
 * Privacidad por diseño:
 *  - Nunca devuelve identificadores, nombres ni ningún dato de una cuenta concreta.
 *  - Se ejecuta "without sharing" a propósito: el cliente del portal no ve las cuentas
 *    (ni debe verlas), pero sí puede ver cuántas hay y cómo se reparten.
 *  - El usuario invitado del sitio recibe 401: hay que haber iniciado sesión.
 *
 * Universo de "clientes": cuentas con Cuenta contable de cliente informada
 * (Cuenta_contable_cliente__c), que es lo que en la práctica se factura.
 * Cambiar CONDICION_CLIENTE si el despacho decide otro criterio.
 */
@RestResource(urlMapping='/portalreact/estadisticas')
global without sharing class PortalReactEstadisticas {

    private static final String CONDICION_CLIENTE = 'Cuenta_contable_cliente__c != null';
    private static final Integer MAX_PROVINCIAS = 10;
    private static final List<String> ORDEN_TAMANO = new List<String>{
        'Sin asalariados', '1 a 2 asalariados', '3 a 5 asalariados', '6 a 9 asalariados',
        '10 a 19 asalariados', '20 a 50 asalariados', '+ 50 asalariados', 'Sin asignar'
    };

    @HttpGet
    global static void doGet() {
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json; charset=UTF-8');
        res.addHeader('Cache-Control', 'no-store');

        if (UserInfo.getUserType() == 'Guest') {
            res.statusCode = 401;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
                'error' => 'Debes iniciar sesión para ver las estadísticas.'
            }));
            return;
        }

        try {
            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(calcular()));
        } catch (Exception ex) {
            res.statusCode = 500;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
                'error' => 'No se han podido calcular las estadísticas.'
            }));
        }
    }

    /** Calcula todos los agregados. Público para poder probarlo sin contexto REST. */
    public static Map<String, Object> calcular() {
        Integer clientes = Database.countQuery('SELECT COUNT() FROM Account WHERE ' + CONDICION_CLIENTE);
        Integer contratosAlta = [SELECT COUNT() FROM Account WHERE Contrato_activo__c = 'Alta'];
        Integer empresasBaseDatos = [SELECT COUNT() FROM Account];

        return new Map<String, Object>{
            'generadoEn' => System.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
            'universo' => 'Cuentas con cuenta contable de cliente informada',
            'kpis' => new Map<String, Object>{
                'clientes' => clientes,
                'contratosAlta' => contratosAlta,
                'empresasBaseDatos' => empresasBaseDatos
            },
            'porProvincia' => agruparProvincias(),
            'porTipo' => agrupar('Type', 'Sin tipo'),
            'porTamano' => ordenarTamano(agrupar('N_de_Empleados__c', 'Sin asignar'))
        };
    }

    /**
     * Recuento por un campo del universo de clientes, ordenado de mayor a menor.
     * Si el valor nulo y un valor real comparten etiqueta (p. ej. "Sin asignar"), se suman.
     */
    private static List<Fila> agrupar(String campo, String etiquetaNulo) {
        String soql = 'SELECT ' + campo + ' v, COUNT(Id) n FROM Account WHERE ' + CONDICION_CLIENTE
            + ' GROUP BY ' + campo + ' ORDER BY COUNT(Id) DESC';
        List<String> orden = new List<String>();
        Map<String, Integer> acumulado = new Map<String, Integer>();
        for (AggregateResult ar : Database.query(soql)) {
            Object v = ar.get('v');
            String etiqueta = v == null ? etiquetaNulo : String.valueOf(v);
            if (!acumulado.containsKey(etiqueta)) {
                orden.add(etiqueta);
                acumulado.put(etiqueta, 0);
            }
            acumulado.put(etiqueta, acumulado.get(etiqueta) + (Integer) ar.get('n'));
        }
        List<Fila> filas = new List<Fila>();
        for (String etiqueta : orden) filas.add(new Fila(etiqueta, acumulado.get(etiqueta)));
        return filas;
    }

    /** Provincias: las MAX_PROVINCIAS mayores, el resto agrupado en "Otras". */
    private static List<Fila> agruparProvincias() {
        List<Fila> todas = agrupar('BillingState', 'Sin provincia');
        List<Fila> salida = new List<Fila>();
        Integer otras = 0;
        Integer sinProvincia = 0;
        for (Fila f : todas) {
            if (f.etiqueta == 'Sin provincia') {
                sinProvincia += f.n;
            } else if (salida.size() < MAX_PROVINCIAS) {
                salida.add(f);
            } else {
                otras += f.n;
            }
        }
        if (otras > 0) salida.add(new Fila('Otras provincias', otras));
        if (sinProvincia > 0) salida.add(new Fila('Sin provincia', sinProvincia));
        return salida;
    }

    /** Tamaños en el orden natural de la lista de selección, no por recuento. */
    private static List<Fila> ordenarTamano(List<Fila> filas) {
        Map<String, Fila> porEtiqueta = new Map<String, Fila>();
        for (Fila f : filas) porEtiqueta.put(f.etiqueta, f);
        List<Fila> salida = new List<Fila>();
        for (String etiqueta : ORDEN_TAMANO) {
            if (porEtiqueta.containsKey(etiqueta)) salida.add(porEtiqueta.remove(etiqueta));
        }
        salida.addAll(porEtiqueta.values());
        return salida;
    }

    public class Fila {
        public String etiqueta;
        public Integer n;
        public Fila(String etiqueta, Integer n) {
            this.etiqueta = etiqueta;
            this.n = n;
        }
    }
}