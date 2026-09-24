/**
 * Empresas con las que un usuario puede trabajar en Subir facturas (pruebas A y B).
 *  - Usuario del portal: sus relaciones contacto-cuenta activas (AccountContactRelation).
 *  - Usuario interno: cuentas de las que es asesor responsable fiscal o miembro del equipo.
 *  - Con el permiso Bandeja_Contable_Cualquier_Empresa: cualquier cuenta que pueda ver (modo libre).
 * La empresa que llega del navegador se vuelve a validar siempre aquí, nunca se da por buena.
 */
public with sharing class BandejaEmpresasService {

    public static final String PERMISO_LIBRE = 'Bandeja_Contable_Cualquier_Empresa';
    private static final Integer MAX_EMPRESAS = 2000;

    public class BandejaException extends Exception {}

    public class EmpresaDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String nombre;
        @AuraEnabled public String cif;
    }

    /** Modo libre: el usuario puede elegir cualquier empresa visible (buscador en vez de lista) */
    public static Boolean esModoLibre() {
        return FeatureManagement.checkPermission(PERMISO_LIBRE);
    }

    public static Boolean esUsuarioPortal() {
        return UserInfo.getUserType() != 'Standard';
    }

    /** Lista de empresas asignadas; en modo libre va vacía porque se usa el buscador */
    public static List<EmpresaDTO> getEmpresasPermitidas() {
        List<EmpresaDTO> out = new List<EmpresaDTO>();
        if (esModoLibre()) return out;
        Set<Id> ids = getIdsAsignados();
        if (ids.isEmpty()) return out;
        for (Account a : [
            SELECT Id, Name, CIF__c FROM Account
            WHERE Id IN :ids
            WITH USER_MODE
            ORDER BY Name
            LIMIT :MAX_EMPRESAS
        ]) {
            out.add(toDto(a));
        }
        return out;
    }

    /** Devuelve la empresa si el usuario puede usarla; si no, lanza BandejaException */
    public static Account validarEmpresa(Id empresaId) {
        if (empresaId == null || empresaId.getSObjectType() != Account.SObjectType) {
            throw new BandejaException('La empresa no es válida.');
        }
        if (!esModoLibre() && !getIdsAsignados().contains(empresaId)) {
            throw new BandejaException('No tienes permiso para subir documentación de esta empresa.');
        }
        // USER_MODE: aunque esté asignada, tiene que poder verla con su sharing
        List<Account> acc = [SELECT Id, Name, CIF__c FROM Account WHERE Id = :empresaId WITH USER_MODE LIMIT 1];
        if (acc.isEmpty()) {
            throw new BandejaException('No tienes permiso para subir documentación de esta empresa.');
        }
        return acc[0];
    }

    private static Set<Id> getIdsAsignados() {
        Set<Id> ids = new Set<Id>();
        Id userId = UserInfo.getUserId();
        if (esUsuarioPortal()) {
            Id contactId = [SELECT ContactId FROM User WHERE Id = :userId].ContactId;
            if (contactId == null) return ids;
            for (AccountContactRelation r : [
                SELECT AccountId FROM AccountContactRelation
                WHERE ContactId = :contactId AND IsActive = true
                LIMIT :MAX_EMPRESAS
            ]) {
                ids.add(r.AccountId);
            }
        } else {
            for (Account a : [
                SELECT Id FROM Account
                WHERE Asesor_responsable_fiscal_actual__c = :userId
                LIMIT :MAX_EMPRESAS
            ]) {
                ids.add(a.Id);
            }
            for (AccountTeamMember m : [
                SELECT AccountId FROM AccountTeamMember
                WHERE UserId = :userId
                LIMIT :MAX_EMPRESAS
            ]) {
                ids.add(m.AccountId);
            }
        }
        return ids;
    }

    private static EmpresaDTO toDto(Account a) {
        EmpresaDTO dto = new EmpresaDTO();
        dto.id = a.Id;
        dto.nombre = a.Name;
        dto.cif = a.CIF__c;
        return dto;
    }
}
