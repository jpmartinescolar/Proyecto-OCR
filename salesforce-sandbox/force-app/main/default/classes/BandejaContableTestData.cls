/**
 * Datos de prueba de la Bandeja Contable. Los tests se ejecutan como un asesor creado aquí, con el
 * permiso Bandeja_Contable_Asesor y sin el de todas las empresas: así no dependen de los permisos
 * que tenga en la org quien lanza los tests.
 */
@IsTest
public class BandejaContableTestData {

    // El username es global en Salesforce: se hace único por org. El email debe ser de un dominio permitido en la org.
    public static final String USERNAME_ASESOR = 'asesor.bandeja.' + UserInfo.getOrganizationId() + '@test.invalid';
    private static final String EMAIL_ASESOR = 'no-reply@innovaciondespachos.com';

    /** Crea el asesor (llamar desde @TestSetup, antes de insertar datos de negocio) */
    public static User crearAsesor() {
        User u;
        // Usuario y asignación de permisos en su propio contexto para evitar el error de "mixed DML"
        System.runAs(new User(Id = UserInfo.getUserId())) {
            u = new User(
                Username = USERNAME_ASESOR,
                LastName = 'Asesor Bandeja',
                Email = EMAIL_ASESOR,
                Alias = 'asesbc',
                ProfileId = UserInfo.getProfileId(),
                TimeZoneSidKey = 'Europe/Madrid',
                LocaleSidKey = 'es_ES',
                EmailEncodingKey = 'UTF-8',
                LanguageLocaleKey = 'es'
            );
            insert u;
            asignarPermiso(u.Id, 'Bandeja_Contable_Asesor');
        }
        return u;
    }

    public static User asesor() {
        return [SELECT Id FROM User WHERE Username = :USERNAME_ASESOR LIMIT 1];
    }

    public static void asignarPermiso(Id userId, String permissionSet) {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new PermissionSetAssignment(
                AssigneeId = userId,
                PermissionSetId = [SELECT Id FROM PermissionSet WHERE Name = :permissionSet].Id
            );
        }
    }

    public static Account crearEmpresa(String nombre, String cif, Id asesorId) {
        Account a = new Account(Name = nombre, Procedencia_del_cliente__c = 'Test', CIF__c = cif,
                                Asesor_responsable_fiscal_actual__c = asesorId);
        insert a;
        return a;
    }
}
