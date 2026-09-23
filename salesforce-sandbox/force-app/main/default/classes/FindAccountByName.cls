/**
 * Acción invocable que busca Accounts por nombre (búsqueda parcial,
 * case-insensitive) y devuelve un resultado preparado para que el
 * agente decida si continuar directamente, pedir desambiguación o
 * comunicar que no hay resultados.
 */
public with sharing class FindAccountByName {

    private static final Integer MAX_RESULTADOS = 10;

    public class Request {
        @InvocableVariable(required=true label='Nombre' description='Nombre o parte del nombre de la empresa a buscar')
        public String nombre;
    }

    public class Response {
        @InvocableVariable(label='Total coincidencias' description='Número de cuentas que coinciden con la búsqueda')
        public Integer totalCoincidencias;

        @InvocableVariable(label='Account Id único' description='Id de la cuenta cuando hay exactamente una coincidencia. Vacío si hay 0 o más de 1.')
        public String accountIdUnico;

        @InvocableVariable(label='Estado' description='Mensaje legible del resultado de la búsqueda')
        public String estado;

        @InvocableVariable(label='Resultados' description='Listado de coincidencias en texto plano, útil cuando hay varias y hay que pedir al usuario que elija')
        public String resultados;
    }

    @InvocableMethod(
        label='Buscar Account por Nombre'
        description='Busca Accounts cuyo nombre contenga el texto indicado y devuelve el Id si hay una única coincidencia, o un listado si hay varias.'
        category='Escrituras Agent'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request r : requests) {
            out.add(buscar(r.nombre));
        }
        return out;
    }

    private static Response buscar(String nombreBuscado) {
        Response resp = new Response();
        resp.totalCoincidencias = 0;
        resp.accountIdUnico = '';
        resp.resultados = '';

        if (String.isBlank(nombreBuscado)) {
            resp.estado = 'No se ha indicado ningún nombre de empresa para buscar.';
            return resp;
        }

        String termino = nombreBuscado.trim();
        String patron = '%' + termino + '%';

        List<Account> matches = [
            SELECT Id, Name, BillingCity, BillingCountry
            FROM Account
            WHERE Name LIKE :patron
            WITH SECURITY_ENFORCED
            ORDER BY Name ASC
            LIMIT :MAX_RESULTADOS
        ];

        resp.totalCoincidencias = matches.size();

        if (matches.isEmpty()) {
            resp.estado = 'No se ha encontrado ninguna empresa cuyo nombre contenga "' + termino + '".';
            return resp;
        }

        if (matches.size() == 1) {
            Account a = matches[0];
            resp.accountIdUnico = a.Id;
            resp.estado = 'Encontrada 1 empresa: ' + a.Name + ' (' + a.Id + ').';
            resp.resultados = formatearMatch(a);
            return resp;
        }

        // Más de una coincidencia: comprobar si hay match exacto (case-insensitive)
        Account exacto;
        String terminoLower = termino.toLowerCase();
        for (Account a : matches) {
            if (a.Name != null && a.Name.toLowerCase() == terminoLower) {
                exacto = a;
                break;
            }
        }
        if (exacto != null) {
            resp.accountIdUnico = exacto.Id;
            resp.estado = 'Hay ' + matches.size() + ' coincidencias parciales, pero "' + exacto.Name + '" coincide exactamente. Se usa esa.';
            resp.resultados = formatearMatch(exacto);
            return resp;
        }

        // Varias coincidencias sin match exacto: devolver lista para desambiguar
        List<String> lineas = new List<String>();
        for (Integer i = 0; i < matches.size(); i++) {
            Account a = matches[i];
            lineas.add((i + 1) + '. ' + formatearMatch(a));
        }
        resp.resultados = String.join(lineas, '\n');
        resp.estado = 'Hay ' + matches.size() + ' empresas que coinciden con "' + termino + '". Se necesita desambiguar.';
        return resp;
    }

    private static String formatearMatch(Account a) {
        String ubicacion = '';
        if (String.isNotBlank(a.BillingCity) || String.isNotBlank(a.BillingCountry)) {
            ubicacion = ' [';
            if (String.isNotBlank(a.BillingCity))    ubicacion += a.BillingCity;
            if (String.isNotBlank(a.BillingCity) && String.isNotBlank(a.BillingCountry)) ubicacion += ', ';
            if (String.isNotBlank(a.BillingCountry)) ubicacion += a.BillingCountry;
            ubicacion += ']';
        }
        return a.Name + ubicacion + ' — Id: ' + a.Id;
    }
}