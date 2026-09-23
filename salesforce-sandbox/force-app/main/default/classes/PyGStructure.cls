public with sharing class PyGStructure {

    // -----------------------------------------------------------------
    //  Definición de una sección de la PyG
    // -----------------------------------------------------------------
    public class PyGSection {
        public String key;              // identificador único
        public String label;            // texto a mostrar
        public List<String> prefijos;   // prefijos del Plan.Name que pertenecen a esta sección
        public List<String> excluidos;  // prefijos que se restan del match
        public Integer signo;           // -1 gasto, +1 ingreso (sólo informativo)
        public Boolean esCN;            // sección de cifra de negocios
        public String bucket;           // 'EXPL' | 'FIN' | 'IMP' | null
        public Boolean esSubtotal;      // si true, no se buscan cuentas — se calcula

        public PyGSection(String k, String l, Integer s, String b, Boolean cn, List<String> pref, List<String> excl) {
            this.key = k;
            this.label = l;
            this.signo = s;
            this.bucket = b;
            this.esCN = cn;
            this.prefijos = pref;
            this.excluidos = excl == null ? new List<String>() : excl;
            this.esSubtotal = false;
        }

        public PyGSection(String k, String l, Boolean subtotal) {
            this.key = k;
            this.label = l;
            this.esSubtotal = true;
        }
    }

    // -----------------------------------------------------------------
    //  Match: dada una cuenta, devuelve la key de su sección, o null
    //  Las secciones se evalúan en orden — la primera que matchea gana.
    // -----------------------------------------------------------------
    public static String matchSeccion(String codigoCuenta, List<PyGSection> secciones) {
        if (String.isBlank(codigoCuenta)) return null;
        for (PyGSection s : secciones) {
            if (s.esSubtotal) continue;
            // exclusiones primero
            Boolean excluido = false;
            if (s.excluidos != null) {
                for (String ex : s.excluidos) {
                    if (codigoCuenta.startsWith(ex)) { excluido = true; break; }
                }
            }
            if (excluido) continue;
            if (s.prefijos == null) continue;
            for (String p : s.prefijos) {
                if (codigoCuenta.startsWith(p)) return s.key;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------
    //  ESTRUCTURA  PyG  según el plan elegido
    // -----------------------------------------------------------------
    public static List<PyGSection> estructura(String plan) {
        if (plan == 'PGC Normal') return estructuraNormal();
        if (plan == 'PGC Abreviado') return estructuraAbreviado();
        return estructuraPymes();
    }

    // ================================================================
    //   PGC PYMES   (RD 1515/2007 — Anexo IV)
    // ================================================================
    private static List<PyGSection> estructuraPymes() {
        List<PyGSection> s = new List<PyGSection>();

        // 1. Importe neto de la cifra de negocios
        s.add(new PyGSection(
            'CN', 'Importe neto de la cifra de negocios', 1, 'EXPL', true,
            new List<String>{ '700', '701', '702', '703', '704', '705', '706', '708', '709' },
            null
        ));

        // 2. Variación de existencias de productos terminados y en curso
        s.add(new PyGSection(
            'VAR_EXIST', 'Variación de existencias de productos terminados y en curso de fabricación', 1, 'EXPL', false,
            new List<String>{ '710', '711', '712', '713' },
            null
        ));

        // 3. Trabajos realizados por la empresa para su activo
        s.add(new PyGSection(
            'TRAB_ACTIVO', 'Trabajos realizados por la empresa para su activo', 1, 'EXPL', false,
            new List<String>{ '730', '731', '732', '733' },
            null
        ));

        // 4. Aprovisionamientos
        s.add(new PyGSection(
            'APROV', 'Aprovisionamientos', -1, 'EXPL', false,
            new List<String>{ '600', '601', '602', '6060', '6061', '6062', '6070', '6071', '6072', '6080', '6081', '6082', '6090', '6091', '6092', '610', '611', '612' },
            null
        ));

        // 5. Otros ingresos de explotación
        s.add(new PyGSection(
            'OTROS_ING', 'Otros ingresos de explotación', 1, 'EXPL', false,
            new List<String>{ '740', '747', '752', '753', '754', '755', '759' },
            null
        ));

        // 6. Gastos de personal
        s.add(new PyGSection(
            'PERSONAL', 'Gastos de personal', -1, 'EXPL', false,
            new List<String>{ '640', '641', '642', '643', '644', '645', '649', '7950', '7957' },
            null
        ));

        // 7. Otros gastos de explotación
        s.add(new PyGSection(
            'OTROS_GTO', 'Otros gastos de explotación', -1, 'EXPL', false,
            new List<String>{ '620', '621', '622', '623', '624', '625', '626', '627', '628', '629', '631', '634', '636', '639', '650', '651', '659', '694', '695', '794', '795' },
            null
        ));

        // 8. Amortización del inmovilizado
        s.add(new PyGSection(
            'AMORT', 'Amortización del inmovilizado', -1, 'EXPL', false,
            new List<String>{ '680', '681', '682' },
            null
        ));

        // 9. Imputación de subvenciones de inmovilizado no financiero y otras
        s.add(new PyGSection(
            'SUBV', 'Imputación de subvenciones de inmovilizado no financiero y otras', 1, 'EXPL', false,
            new List<String>{ '746' },
            null
        ));

        // 10. Excesos de provisiones
        s.add(new PyGSection(
            'EXCESOS', 'Excesos de provisiones', 1, 'EXPL', false,
            new List<String>{ '7951', '7952', '7955', '7956' },
            null
        ));

        // 11. Deterioro y resultado por enajenaciones del inmovilizado
        s.add(new PyGSection(
            'DET_INM', 'Deterioro y resultado por enajenaciones del inmovilizado', 0, 'EXPL', false,
            new List<String>{ '670', '671', '672', '690', '691', '692', '770', '771', '772', '790', '791', '792' },
            null
        ));

        // 12. Otros resultados
        s.add(new PyGSection(
            'OTROS_RES', 'Otros resultados', 0, 'EXPL', false,
            new List<String>{ '678', '778' },
            null
        ));

        // A.1) RESULTADO DE EXPLOTACIÓN
        s.add(new PyGSection('A1', 'A.1) RESULTADO DE EXPLOTACIÓN', true));

        // 13. Ingresos financieros
        s.add(new PyGSection(
            'ING_FIN', 'Ingresos financieros', 1, 'FIN', false,
            new List<String>{ '760', '761', '762', '764', '765', '767', '769' },
            null
        ));

        // 14. Gastos financieros
        s.add(new PyGSection(
            'GTO_FIN', 'Gastos financieros', -1, 'FIN', false,
            new List<String>{ '660', '661', '662', '664', '665', '669' },
            null
        ));

        // 15. Variación de valor razonable en instrumentos financieros
        s.add(new PyGSection(
            'VAR_VR', 'Variación de valor razonable en instrumentos financieros', 0, 'FIN', false,
            new List<String>{ '7630', '6630' },
            null
        ));

        // 16. Diferencias de cambio
        s.add(new PyGSection(
            'CAMBIO', 'Diferencias de cambio', 0, 'FIN', false,
            new List<String>{ '768', '668' },
            null
        ));

        // 17. Deterioro y resultado por enajenaciones de instrumentos financieros
        s.add(new PyGSection(
            'DET_FIN', 'Deterioro y resultado por enajenaciones de instrumentos financieros', 0, 'FIN', false,
            new List<String>{ '666', '667', '673', '675', '696', '697', '698', '699', '766', '773', '775', '796', '797', '798', '799' },
            null
        ));

        // A.2) RESULTADO FINANCIERO
        s.add(new PyGSection('A2', 'A.2) RESULTADO FINANCIERO', true));

        // A.3) RESULTADO ANTES DE IMPUESTOS
        s.add(new PyGSection('A3', 'A.3) RESULTADO ANTES DE IMPUESTOS', true));

        // 18. Impuesto sobre beneficios
        s.add(new PyGSection(
            'IMP_BEN', 'Impuesto sobre beneficios', -1, 'IMP', false,
            new List<String>{ '6300', '6301', '633', '638' },
            null
        ));

        // A.4) RESULTADO DEL EJERCICIO
        s.add(new PyGSection('A4', 'A.4) RESULTADO DEL EJERCICIO', true));

        return s;
    }

    // ================================================================
    //   PGC ABREVIADO   (estructura prácticamente idéntica a PYMES)
    // ================================================================
    private static List<PyGSection> estructuraAbreviado() {
        // Mismo esquema que PYMES; se mantiene como plan diferenciado por si el cliente
        // decide en el futuro afinar prefijos de cuentas específicas para Abreviado.
        return estructuraPymes();
    }

    // ================================================================
    //   PGC NORMAL   (RD 1514/2007 — añade más desglose)
    // ================================================================
    private static List<PyGSection> estructuraNormal() {
        // Mantenemos la misma jerarquía de epígrafes que en PYMES porque los
        // documentos compartidos por el cliente para PGC Normal usan los mismos
        // títulos a nivel superior. La diferencia con PYMES en el modelo Normal
        // estricto está en los subdesgloses (a, b, c) dentro de cada epígrafe, que
        // hoy no figuran en el objeto Plan_general_contable__c.
        return estructuraPymes();
    }
}