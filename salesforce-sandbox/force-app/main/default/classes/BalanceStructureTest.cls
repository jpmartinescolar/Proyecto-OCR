/**
 * Tests de BalanceStructure: recorren los tres planes oficiales sin DML,
 * de modo que la cobertura no depende de datos ni automatizaciones del org
 * donde se despliegue.
 */
@isTest
private class BalanceStructureTest {

    private static void verificar(String plan) {
        List<BalanceStructure.BalLine> lineas = BalanceStructure.estructura(plan);
        System.assert(lineas.size() > 0, plan + ' debe tener lineas');

        Boolean hayBanda = false, hayTotal = false, hayLeaf = false;
        Set<String> keys = new Set<String>();
        for (BalanceStructure.BalLine l : lineas) {
            System.assert(String.isNotBlank(l.key), plan + ': toda linea lleva key');
            System.assert(!keys.contains(l.key), plan + ': key duplicada ' + l.key);
            keys.add(l.key);
            if (l.esBanda) hayBanda = true;
            if (l.esTotal) hayTotal = true;
            if (l.esLeaf) {
                hayLeaf = true;
                // Algunas hojas del modelo oficial no llevan cuentas mapeadas:
                // basta con que la lista exista
                System.assert(l.cuentas != null, plan + ': la hoja ' + l.key + ' debe llevar lista de cuentas');
                for (BalanceStructure.BalAccount c : l.cuentas) {
                    System.assert(String.isNotBlank(c.prefijo), plan + ': cuenta sin prefijo en ' + l.key);
                    System.assert(c.signo == 1 || c.signo == -1, plan + ': signo invalido en ' + l.key);
                }
            }
        }
        // Los hijos de agregados y totales apuntan a lineas existentes
        for (BalanceStructure.BalLine l : lineas) {
            for (BalanceStructure.BalChild h : l.hijos) {
                System.assert(keys.contains(h.key), plan + ': el hijo ' + h.key + ' no existe como linea');
            }
        }
        System.assert(hayBanda && hayTotal && hayLeaf, plan + ' debe tener bandas, totales y hojas');
    }

    @isTest
    static void testPymes() { verificar('PGC PYMES'); }

    @isTest
    static void testNormal() { verificar('PGC Normal'); }

    @isTest
    static void testAbreviado() { verificar('PGC Abreviado'); }

    @isTest
    static void testPlanDesconocidoDevuelvePymes() {
        System.assertEquals(BalanceStructure.estructura('PGC PYMES').size(),
            BalanceStructure.estructura(null).size(), 'El plan por defecto es PYMES');
    }
}