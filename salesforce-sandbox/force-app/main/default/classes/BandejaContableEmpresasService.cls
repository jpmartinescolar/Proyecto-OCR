/**
 * Empresas con las que un usuario puede trabajar en la Bandeja Contable.
 *  - Usuario del portal: sus relaciones contacto-cuenta activas (AccountContactRelation).
 *  - Usuario interno: cuentas de las que es asesor responsable fiscal o miembro del equipo.
 *  - Con el permiso Bandeja_Contable_Cualquier_Empresa: cualquier cuenta que pueda ver (modo libre).
 * La empresa que llega del navegador se vuelve a validar siempre aquí, nunca se da por buena.
 */
public with sharing class BandejaContableEmpresasService {

    public static final String PERMISO_LIBRE = 'Bandeja_Contable_Cualquier_Empresa';
    private static final Integer MAX_EMPRESAS = 2000;

    public class BandejaContableException extends Exception {}

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

    /** Devuelve la empresa si el usuario puede usarla; si no, lanza BandejaContableException */
    public static Account validarEmpresa(Id empresaId) {
        if (empresaId == null || empresaId.getSObjectType() != Account.SObjectType) {
            throw new BandejaContableException('La empresa no es válida.');
        }
        if (!esModoLibre() && !getIdsAsignados().contains(empresaId)) {
            throw new BandejaContableException('No tienes permiso para trabajar con esta empresa.');
        }
        // USER_MODE: aunque esté asignada, tiene que poder verla con su sharing
        List<Account> acc = [SELECT Id, Name, CIF__c FROM Account WHERE Id = :empresaId WITH USER_MODE LIMIT 1];
        if (acc.isEmpty()) {
            throw new BandejaContableException('No tienes permiso para trabajar con esta empresa.');
        }
        return acc[0];
    }

    // ===== Empresas y grupos empresariales para las skills ("Empresas afectadas") =====

    private static final Integer MAX_BUSQUEDA = 50;
    private static final Integer MAX_GRUPOS = 30;

    public class EmpresaGrupoDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String nombre;
        @AuraEnabled public String cif;
        @AuraEnabled public Id grupoId;
        @AuraEnabled public String grupo;
    }

    public class GrupoDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String nombre;
        @AuraEnabled public List<EmpresaGrupoDTO> miembros = new List<EmpresaGrupoDTO>();
    }

    public class EmpresasYGruposDTO {
        @AuraEnabled public List<EmpresaGrupoDTO> empresas = new List<EmpresaGrupoDTO>();
        @AuraEnabled public List<GrupoDTO> grupos = new List<GrupoDTO>();
    }

    /**
     * Empresas y grupos empresariales (Account.Grupo_Empresarial__c) que el usuario puede elegir como
     * "empresas afectadas" de una skill. Sin modo libre, solo sus empresas asignadas y los grupos de
     * esas empresas; en modo libre, cualquier empresa visible. `texto` filtra por nombre o CIF.
     */
    public static EmpresasYGruposDTO buscarEmpresasYGrupos(String texto) {
        EmpresasYGruposDTO out = new EmpresasYGruposDTO();
        Boolean libre = esModoLibre();
        Set<Id> ids = libre ? new Set<Id>() : getIdsAsignados();
        if (!libre && ids.isEmpty()) return out;
        String patron = String.isBlank(texto) ? null : '%' + texto.trim() + '%'; // va como variable enlazada: sin inyección
        Map<String, Object> binds = new Map<String, Object>{ 'ids' => ids, 'patron' => patron, 'limite' => MAX_BUSQUEDA };
        String alcance = libre ? '' : ' AND Id IN :ids';

        for (Account a : (List<Account>) Database.queryWithBinds(
            'SELECT Id, Name, CIF__c, Grupo_Empresarial__c, Grupo_Empresarial__r.Name FROM Account WHERE Id != null' + alcance
                + (patron == null ? '' : ' AND (Name LIKE :patron OR CIF__c LIKE :patron)') + ' ORDER BY Name LIMIT :limite',
            binds, AccessLevel.USER_MODE)) {
            out.empresas.add(toEmpresaGrupo(a));
        }

        // Grupos: los de las empresas a su alcance cuyo nombre coincide con la búsqueda
        binds.put('limite', MAX_GRUPOS);
        Set<Id> grupoIds = new Set<Id>();
        for (AggregateResult r : (List<AggregateResult>) Database.queryWithBinds(
            'SELECT Grupo_Empresarial__c g FROM Account WHERE Grupo_Empresarial__c != null' + alcance
                + (patron == null ? '' : ' AND Grupo_Empresarial__r.Name LIKE :patron') + ' GROUP BY Grupo_Empresarial__c LIMIT :limite',
            binds, AccessLevel.USER_MODE)) {
            grupoIds.add((Id) r.get('g'));
        }
        if (grupoIds.isEmpty()) return out;
        binds.put('grupoIds', grupoIds);
        binds.put('limite', MAX_EMPRESAS);
        Map<Id, GrupoDTO> grupos = new Map<Id, GrupoDTO>();
        for (Account a : (List<Account>) Database.queryWithBinds(
            'SELECT Id, Name, CIF__c, Grupo_Empresarial__c, Grupo_Empresarial__r.Name FROM Account WHERE Grupo_Empresarial__c IN :grupoIds'
                + alcance + ' ORDER BY Grupo_Empresarial__r.Name, Name LIMIT :limite',
            binds, AccessLevel.USER_MODE)) {
            GrupoDTO g = grupos.get(a.Grupo_Empresarial__c);
            if (g == null) {
                g = new GrupoDTO();
                g.id = a.Grupo_Empresarial__c;
                g.nombre = a.Grupo_Empresarial__r.Name;
                grupos.put(g.id, g);
            }
            g.miembros.add(toEmpresaGrupo(a));
        }
        out.grupos = grupos.values();
        return out;
    }

    private static EmpresaGrupoDTO toEmpresaGrupo(Account a) {
        EmpresaGrupoDTO e = new EmpresaGrupoDTO();
        e.id = a.Id;
        e.nombre = a.Name;
        e.cif = a.CIF__c;
        e.grupoId = a.Grupo_Empresarial__c;
        e.grupo = a.Grupo_Empresarial__c == null ? null : a.Grupo_Empresarial__r.Name;
        return e;
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
