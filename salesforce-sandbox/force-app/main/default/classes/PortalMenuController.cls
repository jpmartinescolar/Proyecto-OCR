/**
 * @description Controlador que expone la configuración del menú del área privada del portal
 *              (Digital Experience) a partir del Custom Metadata Type Portal_Menu_Item__mdt.
 *              Construye la jerarquía que consume el LWC portalNavMenu:
 *                - menú de primer nivel (directo o con submenú, Is_Parent__c),
 *                - dentro de un submenú, opciones directas y/o cabeceras de sección (Es_Cabecera__c),
 *                - dentro de una cabecera, sus opciones.
 *              La jerarquía se resuelve por Parent_Menu_Developer_Name__c a cualquier profundidad;
 *              es el LWC quien decide cuántos niveles pinta.
 * @author JCL - BEOC9 (original); Es_Cabecera__c añadido el 2026-09-05
 */
public with sharing class PortalMenuController {

    /**
     * @description Devuelve las opciones de menú de primer nivel, cada una con su lista de
     *              hijos (vacía si la opción no tiene submenú). Los hijos que sean cabecera
     *              de sección llevan a su vez sus propias opciones en children.
     */
    @AuraEnabled(cacheable=true)
    public static List<MenuItemWrapper> getMenuItems() {
        Map<String, MenuItemWrapper> wrapperByDeveloperName = new Map<String, MenuItemWrapper>();
        List<MenuItemWrapper> topLevelItems = new List<MenuItemWrapper>();

        // Nota: Parent_Menu_Developer_Name__c es un campo de texto (no un Metadata Relationship)
        // porque los Custom Metadata Types no admiten relaciones de metadatos autorreferenciadas
        // (self-lookup). La jerarquía se resuelve aquí, en Apex, a partir de ese texto.
        List<Portal_Menu_Item__mdt> allItems = [
            SELECT DeveloperName, MasterLabel, Icon_Name__c, Target_Page__c,
                   Is_Parent__c, Es_Cabecera__c, Menu_Order__c, Parent_Menu_Developer_Name__c
            FROM Portal_Menu_Item__mdt
            WHERE Is_Active__c = true
            ORDER BY Menu_Order__c ASC, MasterLabel ASC
        ];

        // Primera pasada: se crea un wrapper por cada registro activo
        for (Portal_Menu_Item__mdt item : allItems) {
            MenuItemWrapper wrapper = new MenuItemWrapper();
            wrapper.label = item.MasterLabel;
            wrapper.iconName = item.Icon_Name__c;
            wrapper.targetPage = item.Target_Page__c;
            wrapper.isParent = item.Is_Parent__c;
            wrapper.isSection = item.Es_Cabecera__c == true;
            wrapper.order = item.Menu_Order__c;
            wrapper.children = new List<MenuItemWrapper>();
            wrapperByDeveloperName.put(item.DeveloperName, wrapper);
        }

        // Segunda pasada: se anida cada opción bajo su padre (sea del nivel que sea, porque los
        // registros vienen ordenados y cada children conserva ese orden); el resto queda en primer nivel
        for (Portal_Menu_Item__mdt item : allItems) {
            MenuItemWrapper wrapper = wrapperByDeveloperName.get(item.DeveloperName);
            Boolean tieneOtroPadre = String.isNotBlank(item.Parent_Menu_Developer_Name__c);

            if (tieneOtroPadre) {
                MenuItemWrapper parentWrapper = wrapperByDeveloperName.get(item.Parent_Menu_Developer_Name__c);
                // Si el padre no existe o no está activo, el hijo se descarta silenciosamente
                if (parentWrapper != null) {
                    parentWrapper.children.add(wrapper);
                }
            } else {
                topLevelItems.add(wrapper);
            }
        }

        return topLevelItems;
    }

    /**
     * @description Representación plana de una opción de menú (y, de forma recursiva, de sus hijos)
     *              lista para ser serializada y consumida por el LWC.
     */
    public class MenuItemWrapper {
        @AuraEnabled public String label;
        @AuraEnabled public String iconName;
        @AuraEnabled public String targetPage;
        @AuraEnabled public Boolean isParent;
        /** true = cabecera de sección (Es_Cabecera__c): título sin click con sus opciones debajo */
        @AuraEnabled public Boolean isSection;
        @AuraEnabled public Decimal order;
        @AuraEnabled public List<MenuItemWrapper> children;
    }
}