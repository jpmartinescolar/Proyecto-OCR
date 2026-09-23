/**
 * @description Test de PortalMenuController. Los Custom Metadata Types son visibles en los
 *              tests sin SeeAllData, así que se comprueba que la jerarquía devuelta es
 *              coherente con los registros activos de Portal_Menu_Item__mdt del entorno,
 *              sin depender de qué registros concretos existan.
 */
@IsTest
private class PortalMenuControllerTest {

    @IsTest
    static void getMenuItemsDevuelveJerarquiaCoherenteConLosMetadatos() {
        List<Portal_Menu_Item__mdt> activos = [
            SELECT DeveloperName, Parent_Menu_Developer_Name__c, Es_Cabecera__c
            FROM Portal_Menu_Item__mdt
            WHERE Is_Active__c = true
        ];
        Set<String> nombresActivos = new Set<String>();
        for (Portal_Menu_Item__mdt m : activos) {
            nombresActivos.add(m.DeveloperName);
        }
        Integer primerNivelEsperado = 0;
        Integer conPadreActivoEsperado = 0;
        for (Portal_Menu_Item__mdt m : activos) {
            if (String.isBlank(m.Parent_Menu_Developer_Name__c)) {
                primerNivelEsperado++;
            } else if (nombresActivos.contains(m.Parent_Menu_Developer_Name__c)) {
                conPadreActivoEsperado++;
            }
        }

        Test.startTest();
        List<PortalMenuController.MenuItemWrapper> items = PortalMenuController.getMenuItems();
        Test.stopTest();

        System.assertNotEquals(null, items, 'La lista no debe ser null');
        System.assertEquals(primerNivelEsperado, items.size(),
            'En primer nivel van exactamente los registros activos sin padre');
        System.assertEquals(primerNivelEsperado + conPadreActivoEsperado, contar(items),
            'En total se devuelven los activos sin padre mas los activos cuyo padre esta activo');

        for (PortalMenuController.MenuItemWrapper item : items) {
            comprobarWrapper(item);
        }
    }

    private static Integer contar(List<PortalMenuController.MenuItemWrapper> items) {
        Integer total = 0;
        for (PortalMenuController.MenuItemWrapper item : items) {
            total += 1 + contar(item.children);
        }
        return total;
    }

    private static void comprobarWrapper(PortalMenuController.MenuItemWrapper item) {
        System.assert(String.isNotBlank(item.label), 'Toda opcion lleva etiqueta');
        System.assertNotEquals(null, item.children, 'children nunca es null');
        System.assertNotEquals(null, item.isSection, 'isSection siempre viene informado');
        for (PortalMenuController.MenuItemWrapper hijo : item.children) {
            comprobarWrapper(hijo);
        }
    }
}