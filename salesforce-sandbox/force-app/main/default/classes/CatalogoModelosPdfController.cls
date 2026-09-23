/**
 * Controlador de las páginas renderAs="pdf" del Área contable y fiscal (CatalogoModelosPdf y
 * ReglasIncidenciasPdf): pinta como PDF el HTML que el componente areaContableFiscal ha guardado
 * antes en el Documento personal del usuario (AreaContableFiscalController.guardarHtmlPdf). El
 * parámetro d es el Id de ese Documento; solo se sirve si es del propio usuario y lo creó el área
 * (nombre único con prefijo ACF_).
 */
public with sharing class CatalogoModelosPdfController {
    public String cuerpo { get; private set; }
    public String error { get; private set; }

    public CatalogoModelosPdfController() {
        cuerpo = '';
        error = null;
        String d = ApexPages.currentPage().getParameters().get('d');
        try {
            if (String.isBlank(d)) throw new CatalogoException('Falta el documento del catálogo (parámetro d)');
            Id docId = Id.valueOf(d);
            List<Document> docs = [
                SELECT Body FROM Document
                WHERE Id = :docId AND AuthorId = :UserInfo.getUserId()
                  AND DeveloperName LIKE 'ACF_%'
                LIMIT 1
            ];
            if (docs.isEmpty()) throw new CatalogoException('No se encontró el catálogo guardado o no pertenece al usuario');
            cuerpo = docs[0].Body == null ? '' : docs[0].Body.toString();
            if (String.isBlank(cuerpo)) throw new CatalogoException('El catálogo guardado está vacío');
        } catch (Exception e) {
            error = e.getMessage();
        }
    }

    public class CatalogoException extends Exception {}
}