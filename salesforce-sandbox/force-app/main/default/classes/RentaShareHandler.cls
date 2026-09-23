public without sharing class RentaShareHandler {

    private static final String ACCESS_LEVEL = 'Read';
    private static final Integer MAX_PROFUNDIDAD = 20;

    public static void recalcularSharesEnInsert(List<Renta__c> nuevos) {
        Map<Id, Id> rentaAOwner = new Map<Id, Id>();
        for (Renta__c r : nuevos) {
            if (r.Renta_a_o_anterior__c != null && r.OwnerId != null) {
                rentaAOwner.put(r.Id, r.OwnerId);
            }
        }
        if (!rentaAOwner.isEmpty()) propagarShares(rentaAOwner);
    }

    public static void recalcularSharesEnUpdate(List<Renta__c> nuevos, Map<Id, Renta__c> oldMap) {
        Map<Id, Id> rentaAOwner = new Map<Id, Id>();
        Set<Id> ownersARevocar = new Set<Id>();
        Set<Id> rentaAnteriorARevocar = new Set<Id>();

        for (Renta__c r : nuevos) {
            Renta__c viejo = oldMap.get(r.Id);
            Boolean cambioOwner    = r.OwnerId != viejo.OwnerId;
            Boolean cambioAnterior = r.Renta_a_o_anterior__c != viejo.Renta_a_o_anterior__c;

            if (cambioOwner || cambioAnterior) {
                if (viejo.Renta_a_o_anterior__c != null && viejo.OwnerId != null) {
                    rentaAnteriorARevocar.add(viejo.Renta_a_o_anterior__c);
                    ownersARevocar.add(viejo.OwnerId);
                }
                if (r.Renta_a_o_anterior__c != null && r.OwnerId != null) {
                    rentaAOwner.put(r.Id, r.OwnerId);
                }
            }
        }

        if (!rentaAnteriorARevocar.isEmpty() && !ownersARevocar.isEmpty()) {
            revocarShares(rentaAnteriorARevocar, ownersARevocar);
        }
        if (!rentaAOwner.isEmpty()) {
            propagarShares(rentaAOwner);
        }
    }

    private static void propagarShares(Map<Id, Id> rentaActualAOwner) {
        Map<Id, Set<Id>> ancestrosPorRenta = obtenerAncestros(rentaActualAOwner.keySet());

        List<Renta__Share> aInsertar = new List<Renta__Share>();
        for (Id rentaId : rentaActualAOwner.keySet()) {
            Id ownerId = rentaActualAOwner.get(rentaId);
            Set<Id> ancestros = ancestrosPorRenta.get(rentaId);
            if (ancestros == null) continue;
            for (Id ancestroId : ancestros) {
                Renta__Share s = new Renta__Share();
                s.ParentId       = ancestroId;
                s.UserOrGroupId  = ownerId;
                s.AccessLevel    = ACCESS_LEVEL;
                s.RowCause       = Schema.Renta__Share.RowCause.Renta_Vinculada__c;
                aInsertar.add(s);
            }
        }

        if (!aInsertar.isEmpty()) {
            Database.insert(aInsertar, false);
        }
    }

    private static Map<Id, Set<Id>> obtenerAncestros(Set<Id> rentasIniciales) {
        Map<Id, Set<Id>> resultado = new Map<Id, Set<Id>>();
        for (Id r : rentasIniciales) resultado.put(r, new Set<Id>());

        Map<Id, Id> rentaAOrigen = new Map<Id, Id>();
        Set<Id> nivelActual = new Set<Id>();

        for (Renta__c r : [
            SELECT Id, Renta_a_o_anterior__c
            FROM Renta__c
            WHERE Id IN :rentasIniciales
        ]) {
            if (r.Renta_a_o_anterior__c != null) {
                rentaAOrigen.put(r.Renta_a_o_anterior__c, r.Id);
                nivelActual.add(r.Renta_a_o_anterior__c);
                resultado.get(r.Id).add(r.Renta_a_o_anterior__c);
            }
        }

        Integer nivel = 0;
        while (!nivelActual.isEmpty() && nivel < MAX_PROFUNDIDAD) {
            Map<Id, Id> siguienteOrigen = new Map<Id, Id>();
            Set<Id> siguienteNivel = new Set<Id>();

            for (Renta__c r : [
                SELECT Id, Renta_a_o_anterior__c
                FROM Renta__c
                WHERE Id IN :nivelActual AND Renta_a_o_anterior__c != null
            ]) {
                Id origen = rentaAOrigen.get(r.Id);
                if (origen == null) continue;
                if (resultado.get(origen).contains(r.Renta_a_o_anterior__c)) continue;
                resultado.get(origen).add(r.Renta_a_o_anterior__c);
                siguienteNivel.add(r.Renta_a_o_anterior__c);
                siguienteOrigen.put(r.Renta_a_o_anterior__c, origen);
            }

            nivelActual = siguienteNivel;
            rentaAOrigen = siguienteOrigen;
            nivel++;
        }

        return resultado;
    }

    private static void revocarShares(Set<Id> rentasAnteriores, Set<Id> owners) {
        Set<Id> ancestros = new Set<Id>(rentasAnteriores);
        Set<Id> nivelActual = new Set<Id>(rentasAnteriores);
        Integer nivel = 0;
        while (!nivelActual.isEmpty() && nivel < MAX_PROFUNDIDAD) {
            Set<Id> siguiente = new Set<Id>();
            for (Renta__c r : [
                SELECT Renta_a_o_anterior__c
                FROM Renta__c
                WHERE Id IN :nivelActual AND Renta_a_o_anterior__c != null
            ]) {
                if (!ancestros.contains(r.Renta_a_o_anterior__c)) {
                    ancestros.add(r.Renta_a_o_anterior__c);
                    siguiente.add(r.Renta_a_o_anterior__c);
                }
            }
            nivelActual = siguiente;
            nivel++;
        }

        List<Renta__Share> aBorrar = [
            SELECT Id
            FROM Renta__Share
            WHERE ParentId IN :ancestros
              AND UserOrGroupId IN :owners
              AND RowCause = :Schema.Renta__Share.RowCause.Renta_Vinculada__c
        ];
        if (!aBorrar.isEmpty()) Database.delete(aBorrar, false);
    }
}