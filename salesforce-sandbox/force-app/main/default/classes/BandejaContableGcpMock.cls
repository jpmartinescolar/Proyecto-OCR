/**
 * Mock de la API de Google de la Bandeja Contable para los tests: respuesta configurable por ruta
 * (/upload-session, /confirm, /records) o CalloutException para simular un corte de red.
 */
@IsTest
public class BandejaContableGcpMock implements HttpCalloutMock {

    private final Map<String, HttpResponse> respuestas = new Map<String, HttpResponse>();
    public Boolean lanzar = false;
    public List<HttpRequest> peticiones = new List<HttpRequest>();

    public BandejaContableGcpMock responder(String ruta, Integer status, String body) {
        HttpResponse res = new HttpResponse();
        res.setStatusCode(status);
        res.setBody(body);
        respuestas.put(ruta, res);
        return this;
    }

    public HttpResponse respond(HttpRequest req) {
        peticiones.add(req);
        if (lanzar) throw new CalloutException('Read timed out');
        String endpoint = req.getEndpoint();
        for (String ruta : respuestas.keySet()) {
            if (endpoint.endsWith(ruta)) return respuestas.get(ruta);
        }
        HttpResponse res = new HttpResponse();
        res.setStatusCode(404);
        res.setBody('{"error":"Ruta no simulada: ' + endpoint + '"}');
        return res;
    }

    /** Configuración de pruebas y token ya obtenido, para no depender de un certificado real */
    public static void configurar() {
        BandejaContableGcpService.configOverride = new Bandeja_Contable_Config__mdt(
            Tamano_maximo_MB__c = 10,
            Named_Credential__c = 'Bandeja_Contable_GCP',
            Cloud_Run_URL__c = 'https://bandeja-contable-api-test.run.app',
            SA_Client_Email__c = 'caller@test.iam.gserviceaccount.com',
            Certificate_Name__c = 'Certificado_Inexistente'
        );
        BandejaContableGcpService.cachedIdToken = 'token-de-prueba';
        BandejaContableGcpService.cachedIdTokenExp = System.currentTimeMillis() / 1000 + 3600;
    }
}
