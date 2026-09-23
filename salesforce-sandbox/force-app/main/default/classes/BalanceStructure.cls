/**
 * Estructura del Balance de Situación (PGC Normal / PYMES / Abreviado).
 * Generado automáticamente a partir de los modelos oficiales (RM200-2015).
 * NO EDITAR A MANO: regenerar con bal_build.py si cambian los documentos.
 *  - Cada línea es banda (cabecera), total (suma global), agregado (epígrafe con
 *    hijos) u hoja (cuentas). Las cuentas llevan prefijo, signo y modo:
 *    deudor=true -> Debe-Haber ; deudor=false -> Haber-Debe.
 */
public with sharing class BalanceStructure {

    public class BalChild {
        public String key; public Integer signo;
        public BalChild(String k, Integer s) { key = k; signo = s; }
    }
    public class BalAccount {
        public String prefijo; public Integer signo; public Boolean deudor;
        public BalAccount(String p, Integer s, Boolean d) { prefijo = p; signo = s; deudor = d; }
    }
    public class BalLine {
        public String key; public String label; public String band; public Integer nivel;
        public Boolean esBanda; public Boolean esTotal; public Boolean esLeaf;
        public List<BalChild> hijos; public List<BalAccount> cuentas;
    }

    private static BalLine base(String k, String l, String b, Integer n) {
        BalLine x = new BalLine();
        x.key = k; x.label = l; x.band = b; x.nivel = n;
        x.esBanda = false; x.esTotal = false; x.esLeaf = false;
        x.hijos = new List<BalChild>(); x.cuentas = new List<BalAccount>();
        return x;
    }
    private static BalLine banda(String k, String l, String b) {
        BalLine x = base(k, l, b, 0); x.esBanda = true; return x;
    }
    private static BalLine total(String k, String l, String b, Integer n, List<BalChild> h) {
        BalLine x = base(k, l, b, n); x.esTotal = true; x.hijos = h; return x;
    }
    private static BalLine agg(String k, String l, String b, Integer n, List<BalChild> h) {
        BalLine x = base(k, l, b, n); x.hijos = h; return x;
    }
    private static BalLine leaf(String k, String l, String b, Integer n, List<BalAccount> c) {
        BalLine x = base(k, l, b, n); x.esLeaf = true; x.cuentas = c; return x;
    }
    private static BalChild child(String k, Integer s) { return new BalChild(k, s); }
    private static BalAccount acc(String p, Integer s, Boolean d) { return new BalAccount(p, s, d); }

    public static List<BalLine> estructura(String plan) {
        if (plan == 'PGC Normal') return normal();
        if (plan == 'PGC Abreviado') return abreviado();
        return pymes();
    }

    private static List<BalLine> pymes() {
        List<BalLine> s = new List<BalLine>();
        s.add(banda('SALTO1', 'ACTIVO', 'ACTIVO'));
        s.add(agg('ANC', 'A) ACTIVO NO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('ANC10', 1), child('ANC20', 1), child('ANC30', 1), child('ANC40', 1), child('ANC50', 1), child('ANC60', 1), child('ANC70', 1) }));
        s.add(agg('ANC10', 'I. Inmovilizado Intangible', 'ACTIVO', 2, new List<BalChild>{ child('ANC101', 1), child('ANC102', 1) }));
        s.add(leaf('ANC101', 'a) Fondo de comercio', 'ACTIVO', 3, new List<BalAccount>{ acc('204', 1, true) }));
        s.add(leaf('ANC102', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('20', 1, true), acc('204', 1, false), acc('280', 1, true), acc('290', 1, true) }));
        s.add(leaf('ANC20', 'II. Inmovilizado Material', 'ACTIVO', 2, new List<BalAccount>{ acc('21', 1, true), acc('23', 1, true), acc('281', 1, true), acc('291', 1, true) }));
        s.add(leaf('ANC30', 'III. Inversiones Inmobiliarias', 'ACTIVO', 2, new List<BalAccount>{ acc('22', 1, true), acc('282', 1, true), acc('292', 1, true) }));
        s.add(agg('ANC40', 'IV. Invers. empresas grupo y asociadas a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC401', 1), child('ANC402', 1) }));
        s.add(leaf('ANC401', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2403', 1, true), acc('2404', 1, true), acc('2413', 1, true), acc('2414', 1, true), acc('2933', 1, true), acc('2934', 1, true), acc('2943', 1, true), acc('2944', 1, true) }));
        s.add(leaf('ANC402', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('2423', 1, true), acc('2424', 1, true), acc('2493', 1, true), acc('2494', 1, true), acc('2953', 1, true), acc('2954', 1, true) }));
        s.add(agg('ANC50', 'V.Inversiones financieras a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC501', 1), child('ANC502', 1) }));
        s.add(leaf('ANC501', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2405', 1, true), acc('2415', 1, true), acc('2495', 1, true), acc('250', 1, true), acc('251', 1, true), acc('255', 1, true), acc('2935', 1, true), acc('2945', 1, true), acc('2955', 1, true) }));
        s.add(leaf('ANC502', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('2425', 1, true), acc('252', 1, true), acc('253', 1, true), acc('254', 1, true), acc('257', 1, true), acc('258', 1, true), acc('259', 1, true), acc('26', 1, true), acc('296', 1, true), acc('297', 1, true), acc('298', 1, true) }));
        s.add(leaf('ANC60', 'VI. Activos por impuesto diferido', 'ACTIVO', 2, new List<BalAccount>{ acc('474', 1, true) }));
        s.add(leaf('ANC70', 'VII. Deudores comerciales no corrientes', 'ACTIVO', 2, new List<BalAccount>{  }));
        s.add(agg('AC', 'B) ACTIVO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('AC10', 1), child('AC20', 1), child('AC30', 1), child('AC40', 1), child('AC50', 1), child('AC60', 1) }));
        s.add(leaf('AC10', 'I. Existencias', 'ACTIVO', 2, new List<BalAccount>{ acc('30', 1, true), acc('31', 1, true), acc('32', 1, true), acc('33', 1, true), acc('34', 1, true), acc('35', 1, true), acc('36', 1, true), acc('39', 1, true), acc('407', 1, true) }));
        s.add(agg('AC20', 'II. Deudores comerciales y otras ctas. cobrar', 'ACTIVO', 2, new List<BalChild>{ child('AC21', 1), child('AC22', 1), child('AC23', 1) }));
        s.add(leaf('AC21', '1. Clientes ventas y Prestación Servicios', 'ACTIVO', 3, new List<BalAccount>{ acc('430', 1, true), acc('431', 1, true), acc('432', 1, true), acc('433', 1, true), acc('434', 1, true), acc('435', 1, true), acc('436', 1, true), acc('437', 1, true), acc('490', 1, true), acc('493', 1, true) }));
        s.add(leaf('AC22', '2. Accionistas (socios) por desembolsos exig.', 'ACTIVO', 3, new List<BalAccount>{ acc('5580', 1, true) }));
        s.add(leaf('AC23', '3. Otros deudores', 'ACTIVO', 3, new List<BalAccount>{ acc('44', 1, true), acc('460', 1, true), acc('470', 1, true), acc('471', 1, true), acc('472', 1, true), acc('473', 1, true), acc('544', 1, true), acc('550', 1, true), acc('5531', 1, true), acc('5533', 1, true), acc('554', 1, true) }));
        s.add(agg('AC30', 'III. Invers. empresas grupo y asociadas a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC401', 1), child('AC402', 1) }));
        s.add(leaf('AC401', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5303', 1, true), acc('5304', 1, true), acc('5313', 1, true), acc('5314', 1, true), acc('5333', 1, true), acc('5334', 1, true), acc('5353', 1, true), acc('5354', 1, true), acc('5393', 1, true), acc('5394', 1, true), acc('5933', 1, true), acc('5934', 1, true), acc('5943', 1, true), acc('5944', 1, true) }));
        s.add(leaf('AC402', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('5323', 1, true), acc('5324', 1, true), acc('5343', 1, true), acc('5344', 1, true), acc('5523', 1, true), acc('5524', 1, true), acc('5953', 1, true), acc('5954', 1, true) }));
        s.add(agg('AC40', 'IV. Inversiones financieras a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC501', 1), child('AC502', 1) }));
        s.add(leaf('AC501', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5305', 1, true), acc('5315', 1, true), acc('5335', 1, true), acc('5355', 1, true), acc('5395', 1, true), acc('540', 1, true), acc('541', 1, true), acc('545', 1, true), acc('549', 1, true), acc('5590', 1, true), acc('5593', 1, true), acc('5935', 1, true), acc('597', 1, true) }));
        s.add(leaf('AC502', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('5325', 1, true), acc('5345', 1, true), acc('542', 1, true), acc('543', 1, true), acc('546', 1, true), acc('547', 1, true), acc('548', 1, true), acc('551', 1, true), acc('5525', 1, true), acc('565', 1, true), acc('566', 1, true), acc('5945', 1, true), acc('5955', 1, true), acc('596', 1, true), acc('598', 1, true) }));
        s.add(leaf('AC50', 'V. Periodificaciones a C/P', 'ACTIVO', 2, new List<BalAccount>{ acc('480', 1, true), acc('567', 1, true) }));
        s.add(leaf('AC60', 'VI. Efectivo y otros activos líquidos equiv.', 'ACTIVO', 2, new List<BalAccount>{ acc('57', 1, true) }));
        s.add(total('ACTIVO', 'TOTAL ACTIVO (A + B)', 'ACTIVO', 1, new List<BalChild>{ child('AC', 1), child('ANC', 1) }));
        s.add(banda('SALTO2', 'PATRIMONIO NETO Y PASIVO', 'PASIVO'));
        s.add(agg('PN', 'A) PATRIMONIO NETO', 'PASIVO', 1, new List<BalChild>{ child('PNA1', 1), child('PNA20', 1), child('PNA30', 1), child('PNA40', 1) }));
        s.add(agg('PNA1', 'A-1) Fondos propios', 'PASIVO', 2, new List<BalChild>{ child('PNA11', 1), child('PNA12', 1), child('PNA132', 1), child('PNA14', 1), child('PNA15', 1), child('PNA16', 1), child('PNA17', 1), child('PNA18', 1) }));
        s.add(agg('PNA11', 'I. Capital', 'PASIVO', 3, new List<BalChild>{ child('PNA111', 1), child('PNA112', 1) }));
        s.add(leaf('PNA111', '1. Capital escriturado', 'PASIVO', 4, new List<BalAccount>{ acc('100', 1, false), acc('101', 1, false), acc('102', 1, false) }));
        s.add(leaf('PNA112', '2.(Capital no exigido)', 'PASIVO', 4, new List<BalAccount>{ acc('1030', 1, false), acc('1040', 1, false) }));
        s.add(leaf('PNA12', 'II. Prima de Emisión', 'PASIVO', 3, new List<BalAccount>{ acc('110', 1, false) }));
        s.add(agg('PNA132', 'III. Reservas', 'PASIVO', 3, new List<BalChild>{ child('PNA131', 1), child('PNA134', 1) }));
        s.add(agg('PNA131', '1. Total otras reservas', 'PASIVO', 4, new List<BalChild>{ child('PNA13', 1), child('PNA133', 1) }));
        s.add(leaf('PNA13', 'a) Reservas', 'PASIVO', 5, new List<BalAccount>{ acc('112', 1, false), acc('113', 1, false), acc('114', 1, false), acc('115', 1, false), acc('119', 1, false) }));
        s.add(leaf('PNA133', 'b) Reserva de nivelación', 'PASIVO', 5, new List<BalAccount>{  }));
        s.add(leaf('PNA134', '2. Reserva de capitalización', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA14', 'IV. (Acciones y Particip. patrimonio propias)', 'PASIVO', 3, new List<BalAccount>{ acc('108', 1, false), acc('109', 1, false) }));
        s.add(leaf('PNA15', 'V. Resultados Ejercicios Anteriores', 'PASIVO', 3, new List<BalAccount>{ acc('120', 1, false), acc('121', 1, false) }));
        s.add(leaf('PNA16', 'VI. Otras aportaciones de socios', 'PASIVO', 3, new List<BalAccount>{ acc('118', 1, false) }));
        s.add(agg('PNA17', 'VII. Resultado del ejercicio', 'PASIVO', 3, new List<BalChild>{ child('PNA171', 1), child('PNA172', 1) }));
        s.add(leaf('PNA171', 'Cuenta Pérdidas y Ganancias (129)', 'PASIVO', 4, new List<BalAccount>{ acc('129', 1, false) }));
        s.add(leaf('PNA172', 'Ingresos/Gastos pendiente cierre', 'PASIVO', 4, new List<BalAccount>{ acc('6', 1, false), acc('7', 1, false) }));
        s.add(leaf('PNA18', 'VIII. (Dividendo a Cuenta)', 'PASIVO', 3, new List<BalAccount>{ acc('557', 1, false) }));
        s.add(leaf('PNA20', 'A-2) Ajustes en patrimonio neto', 'PASIVO', 2, new List<BalAccount>{ acc('137', 1, false) }));
        s.add(leaf('PNA30', 'A-3) Subvenciones, donacion. y legados recib.', 'PASIVO', 2, new List<BalAccount>{ acc('130', 1, false), acc('131', 1, false), acc('132', 1, false) }));
        s.add(leaf('PNA40', 'A-4) Patrimonio Neto pendiente ajustar NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1391', 1, false), acc('1392', 1, false) }));
        s.add(agg('PNC', 'B) PASIVO NO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PNC1', 1), child('PNC2', 1), child('PNC3', 1), child('PNC4', 1), child('PNC5', 1), child('PNC6', 1), child('PNC7', 1), child('PNC8', 1) }));
        s.add(leaf('PNC1', 'I. Provisiones a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('14', 1, false) }));
        s.add(agg('PNC2', 'II. Deudas a L/P', 'PASIVO', 2, new List<BalChild>{ child('PNC21', 1), child('PNC22', 1), child('PNC23', 1) }));
        s.add(leaf('PNC21', '1. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('1605', 1, false), acc('170', 1, false) }));
        s.add(leaf('PNC22', '2. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('1625', 1, false), acc('174', 1, false) }));
        s.add(leaf('PNC23', '3. Otras deudas a L/P', 'PASIVO', 3, new List<BalAccount>{ acc('1615', 1, false), acc('1635', 1, false), acc('171', 1, false), acc('172', 1, false), acc('173', 1, false), acc('175', 1, false), acc('176', 1, false), acc('177', 1, false), acc('178', 1, false), acc('179', 1, false), acc('180', 1, false), acc('185', 1, false), acc('189', 1, false) }));
        s.add(leaf('PNC3', 'III Deudas empresas grupo y asociadas a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('1603', 1, false), acc('1604', 1, false), acc('1613', 1, false), acc('1614', 1, false), acc('1623', 1, false), acc('1624', 1, false), acc('1633', 1, false), acc('1634', 1, false) }));
        s.add(leaf('PNC4', 'IV. Pasivos por impuesto diferido', 'PASIVO', 2, new List<BalAccount>{ acc('479', 1, false) }));
        s.add(leaf('PNC5', 'V. Periodificaciones L/P', 'PASIVO', 2, new List<BalAccount>{ acc('181', 1, false) }));
        s.add(leaf('PNC6', 'VI. Acreedores comerciales no corrientes', 'PASIVO', 2, new List<BalAccount>{  }));
        s.add(leaf('PNC7', 'VII. Deuda caract. especiales a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('15', 1, false), acc('5585', 1, false) }));
        s.add(leaf('PNC8', 'VIII. Pasivo no Corriente pdte. ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1393', 1, false), acc('1394', 1, false), acc('1395', 1, false) }));
        s.add(agg('PC', 'C) PASIVO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PC1', 1), child('PC2', 1), child('PC3', 1), child('PC4', 1), child('PC5', 1), child('PC6', 1), child('PC7', 1) }));
        s.add(leaf('PC1', 'I. Provisiones a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('499', 1, false), acc('529', 1, false) }));
        s.add(agg('PC2', 'II. Deudas a C/P', 'PASIVO', 2, new List<BalChild>{ child('PC21', 1), child('PC22', 1), child('PC23', 1) }));
        s.add(leaf('PC21', '1. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('5105', 1, false), acc('520', 1, false), acc('527', 1, false) }));
        s.add(leaf('PC22', '2. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('5125', 1, false), acc('524', 1, false) }));
        s.add(leaf('PC23', '3. Otras deudas a C/P', 'PASIVO', 3, new List<BalAccount>{ acc('1034', 1, false), acc('1044', 1, false), acc('190', 1, false), acc('192', 1, false), acc('194', 1, false), acc('500', 1, false), acc('505', 1, false), acc('506', 1, false), acc('509', 1, false), acc('5115', 1, false), acc('5135', 1, false), acc('5145', 1, false), acc('521', 1, false), acc('522', 1, false), acc('523', 1, false), acc('525', 1, false), acc('526', 1, false), acc('528', 1, false), acc('550', 1, false), acc('551', 1, false), acc('5525', 1, false), acc('554', 1, false), acc('555', 1, false), acc('5565', 1, false), acc('5566', 1, false), acc('5595', 1, false), acc('560', 1, false), acc('561', 1, false) }));
        s.add(leaf('PC3', 'III. Deudas empresas grupo y asociadas a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('5103', 1, false), acc('5104', 1, false), acc('5113', 1, false), acc('5114', 1, false), acc('5123', 1, false), acc('5124', 1, false), acc('5133', 1, false), acc('5134', 1, false), acc('5143', 1, false), acc('5144', 1, false), acc('5523', 1, false), acc('5524', 1, false), acc('5563', 1, false), acc('5564', 1, false) }));
        s.add(agg('PC4', 'IV. Acreedores ciales. y otras ctas. a pagar', 'PASIVO', 2, new List<BalChild>{ child('PC41', 1), child('PC42', 1) }));
        s.add(leaf('PC41', '1. Proveedores', 'PASIVO', 3, new List<BalAccount>{ acc('400', 1, false), acc('401', 1, false), acc('403', 1, false), acc('404', 1, false), acc('405', 1, false), acc('406', 1, false) }));
        s.add(leaf('PC42', '2. Otros acreedores', 'PASIVO', 3, new List<BalAccount>{ acc('41', 1, false), acc('438', 1, false), acc('465', 1, false), acc('475', 1, false), acc('476', 1, false), acc('477', 1, false) }));
        s.add(leaf('PC5', 'V. Periodificaciones a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('485', 1, false), acc('568', 1, false) }));
        s.add(leaf('PC6', 'VI. Deuda caract. especiales a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('195', 1, false), acc('197', 1, false), acc('199', 1, false), acc('502', 1, false), acc('507', 1, false) }));
        s.add(leaf('PC7', 'VII. Pasivo Corriente pendiente ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('270', 1, false), acc('271', 1, false), acc('272', 1, false), acc('275', 1, false), acc('276', 1, false), acc('277', 1, false), acc('279', 1, false), acc('289', 1, false) }));
        s.add(total('PASIVO', 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', 'PASIVO', 1, new List<BalChild>{ child('PC', 1), child('PN', 1), child('PNC', 1) }));
        return s;
    }

    private static List<BalLine> normal() {
        List<BalLine> s = new List<BalLine>();
        s.add(banda('SALTO1', 'ACTIVO', 'ACTIVO'));
        s.add(agg('ANC', 'A) ACTIVO NO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('ANC10', 1), child('ANC20', 1), child('ANC30', 1), child('ANC40', 1), child('ANC50', 1), child('ANC60', 1), child('ANC70', 1) }));
        s.add(agg('ANC10', 'I. Inmovilizado Intangible', 'ACTIVO', 2, new List<BalChild>{ child('ANC11', 1), child('ANC12', 1), child('ANC13', 1), child('ANC14', 1), child('ANC15', 1), child('ANC16', 1), child('ANC17', 1), child('ANC19', 1) }));
        s.add(leaf('ANC11', '1. Desarrollo', 'ACTIVO', 3, new List<BalAccount>{ acc('201', 1, true), acc('2801', 1, true), acc('2901', 1, true) }));
        s.add(leaf('ANC12', '2. Concesiones', 'ACTIVO', 3, new List<BalAccount>{ acc('202', 1, true), acc('2802', 1, true), acc('2902', 1, true) }));
        s.add(leaf('ANC13', '3. Patentes, licencias, marcas y similares', 'ACTIVO', 3, new List<BalAccount>{ acc('203', 1, true), acc('2803', 1, true), acc('2903', 1, true) }));
        s.add(leaf('ANC14', '4. Fondo de comercio', 'ACTIVO', 3, new List<BalAccount>{ acc('204', 1, true), acc('2804', 1, true) }));
        s.add(leaf('ANC15', '5. Aplicaciones informáticas', 'ACTIVO', 3, new List<BalAccount>{ acc('206', 1, true), acc('2806', 1, true), acc('2906', 1, true) }));
        s.add(leaf('ANC16', '6. Investigación', 'ACTIVO', 3, new List<BalAccount>{ acc('200', 1, true), acc('2800', 1, true), acc('2900', 1, true) }));
        s.add(leaf('ANC17', '7. Propiedad intelectual', 'ACTIVO', 3, new List<BalAccount>{ acc('2089', 1, true), acc('2808', 1, true), acc('2908', 1, true) }));
        s.add(leaf('ANC19', '8. Otro inmovilizado intangible', 'ACTIVO', 3, new List<BalAccount>{ acc('205', 1, true), acc('209', 1, true), acc('2805', 1, true), acc('2905', 1, true) }));
        s.add(agg('ANC20', 'II. Inmovilizado Material', 'ACTIVO', 2, new List<BalChild>{ child('ANC21', 1), child('ANC22', 1), child('ANC23', 1) }));
        s.add(leaf('ANC21', '1. Terrenos y construcciones', 'ACTIVO', 3, new List<BalAccount>{ acc('210', 1, true), acc('211', 1, true), acc('2811', 1, true), acc('2910', 1, true), acc('2911', 1, true) }));
        s.add(leaf('ANC22', '2. Instal. técnicas y otro inmov. material', 'ACTIVO', 3, new List<BalAccount>{ acc('212', 1, true), acc('213', 1, true), acc('214', 1, true), acc('215', 1, true), acc('216', 1, true), acc('217', 1, true), acc('218', 1, true), acc('219', 1, true), acc('2812', 1, true), acc('2813', 1, true), acc('2814', 1, true), acc('2815', 1, true), acc('2816', 1, true), acc('2817', 1, true), acc('2818', 1, true), acc('2819', 1, true), acc('2912', 1, true), acc('2913', 1, true), acc('2914', 1, true), acc('2915', 1, true), acc('2916', 1, true), acc('2917', 1, true), acc('2918', 1, true), acc('2919', 1, true) }));
        s.add(leaf('ANC23', '3. Inmovilizado en curso y anticipos', 'ACTIVO', 3, new List<BalAccount>{ acc('23', 1, true) }));
        s.add(agg('ANC30', 'III. Inversiones inmobiliarias', 'ACTIVO', 2, new List<BalChild>{ child('ANC31', 1), child('ANC32', 1) }));
        s.add(leaf('ANC31', '1. Terrenos', 'ACTIVO', 3, new List<BalAccount>{ acc('220', 1, true), acc('2920', 1, true) }));
        s.add(leaf('ANC32', '2. Construcciones', 'ACTIVO', 3, new List<BalAccount>{ acc('221', 1, true), acc('282', 1, true), acc('2921', 1, true) }));
        s.add(agg('ANC40', 'IV. Invers. empresas grupo y asociadas a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC41', 1), child('ANC42', 1), child('ANC43', 1), child('ANC44', 1), child('ANC45', 1), child('ANC46', 1) }));
        s.add(leaf('ANC41', '1. Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2403', 1, true), acc('2404', 1, true), acc('2493', 1, true), acc('2494', 1, true), acc('2933', 1, true), acc('2934', 1, true) }));
        s.add(leaf('ANC42', '2. Créditos a empresas', 'ACTIVO', 3, new List<BalAccount>{ acc('2423', 1, true), acc('2424', 1, true), acc('2953', 1, true), acc('2954', 1, true) }));
        s.add(leaf('ANC43', '3. Valores representativos de deuda', 'ACTIVO', 3, new List<BalAccount>{ acc('2413', 1, true), acc('2414', 1, true), acc('2943', 1, true), acc('2944', 1, true) }));
        s.add(leaf('ANC44', '4. Derivados', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(leaf('ANC45', '5. Otros activos financieros', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(leaf('ANC46', '6. Otras inversiones', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(agg('ANC50', 'V. Inversiones financieras a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC51', 1), child('ANC52', 1), child('ANC53', 1), child('ANC54', 1), child('ANC55', 1), child('ANC56', 1) }));
        s.add(leaf('ANC51', '1. Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2405', 1, true), acc('2495', 1, true), acc('250', 1, true), acc('259', 1, true), acc('2935', 1, true), acc('2936', 1, true) }));
        s.add(leaf('ANC52', '2. Créditos a terceros', 'ACTIVO', 3, new List<BalAccount>{ acc('2425', 1, true), acc('252', 1, true), acc('253', 1, true), acc('254', 1, true), acc('2955', 1, true), acc('298', 1, true) }));
        s.add(leaf('ANC53', '3. Valores representativos de deuda', 'ACTIVO', 3, new List<BalAccount>{ acc('2415', 1, true), acc('251', 1, true), acc('2945', 1, true), acc('297', 1, true) }));
        s.add(leaf('ANC54', '4. Derivados', 'ACTIVO', 3, new List<BalAccount>{ acc('255', 1, true) }));
        s.add(leaf('ANC55', '5. Otros activos financieros', 'ACTIVO', 3, new List<BalAccount>{ acc('258', 1, true), acc('26', 1, true) }));
        s.add(leaf('ANC56', '6. Otras inversiones', 'ACTIVO', 3, new List<BalAccount>{ acc('257', 1, true) }));
        s.add(leaf('ANC60', 'VI. Activos por impuesto diferido', 'ACTIVO', 2, new List<BalAccount>{ acc('474', 1, true) }));
        s.add(leaf('ANC70', 'VII. Deudores comerciales no corrientes', 'ACTIVO', 2, new List<BalAccount>{  }));
        s.add(agg('AC', 'B) ACTIVO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('AC10', 1), child('AC20', 1), child('AC30', 1), child('AC40', 1), child('AC50', 1), child('AC60', 1), child('AC70', 1) }));
        s.add(leaf('AC10', 'I. Activos no corrientes manten. para la vta.', 'ACTIVO', 2, new List<BalAccount>{ acc('580', 1, true), acc('581', 1, true), acc('582', 1, true), acc('583', 1, true), acc('584', 1, true), acc('599', 1, true) }));
        s.add(agg('AC20', 'II. Existencias', 'ACTIVO', 2, new List<BalChild>{ child('AC21', 1), child('AC22', 1), child('AC23', 1), child('AC24', 1), child('AC25', 1), child('AC26', 1), child('AC27', 1) }));
        s.add(leaf('AC21', '1. Comerciales', 'ACTIVO', 3, new List<BalAccount>{ acc('30', 1, true), acc('390', 1, true) }));
        s.add(leaf('AC22', '2. Materias primas y otros aprovisionamientos', 'ACTIVO', 3, new List<BalAccount>{ acc('31', 1, true), acc('32', 1, true), acc('391', 1, true), acc('392', 1, true) }));
        s.add(leaf('AC23', '3. Productos en curso', 'ACTIVO', 3, new List<BalAccount>{ acc('33', 1, true), acc('34', 1, true), acc('393', 1, true), acc('394', 1, true) }));
        s.add(leaf('AC24', '4. Productos terminados', 'ACTIVO', 3, new List<BalAccount>{ acc('35', 1, true), acc('395', 1, true) }));
        s.add(leaf('AC25', '5. Subproductos, residuos y mat. recuperados', 'ACTIVO', 3, new List<BalAccount>{ acc('36', 1, true), acc('396', 1, true) }));
        s.add(leaf('AC26', '6. Anticipos a proveedores', 'ACTIVO', 3, new List<BalAccount>{ acc('407', 1, true) }));
        s.add(leaf('AC27', 'Derechos de emisión gases efecto invernadero', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(agg('AC30', 'III. Deudores ciales. y otras ctas. a cobrar', 'ACTIVO', 2, new List<BalChild>{ child('AC31', 1), child('AC32', 1), child('AC33', 1), child('AC34', 1), child('AC35', 1), child('AC36', 1), child('AC37', 1) }));
        s.add(leaf('AC31', '1. Clientes ventas y prestaciones servicios', 'ACTIVO', 3, new List<BalAccount>{ acc('430', 1, true), acc('431', 1, true), acc('432', 1, true), acc('435', 1, true), acc('436', 1, true), acc('437', 1, true), acc('490', 1, true), acc('4935', 1, true) }));
        s.add(leaf('AC32', '2. Clientes, empresas del grupo y asociadas', 'ACTIVO', 3, new List<BalAccount>{ acc('433', 1, true), acc('434', 1, true), acc('4933', 1, true), acc('4934', 1, true) }));
        s.add(leaf('AC33', '3. Deudores varios', 'ACTIVO', 3, new List<BalAccount>{ acc('44', 1, true), acc('550', 1, true), acc('5531', 1, true), acc('5533', 1, true), acc('554', 1, true) }));
        s.add(leaf('AC34', '4. Personal', 'ACTIVO', 3, new List<BalAccount>{ acc('460', 1, true), acc('544', 1, true) }));
        s.add(leaf('AC35', '5. Activos por impuesto corriente', 'ACTIVO', 3, new List<BalAccount>{ acc('4709', 1, true) }));
        s.add(leaf('AC36', '6. Otros créditos con las Admin. Públicas', 'ACTIVO', 3, new List<BalAccount>{ acc('4700', 1, true), acc('4707', 1, true), acc('4708', 1, true), acc('471', 1, true), acc('472', 1, true), acc('473', 1, true) }));
        s.add(leaf('AC37', '7. Accionistas (socios) por desembolsos exig', 'ACTIVO', 3, new List<BalAccount>{ acc('5580', 1, true) }));
        s.add(agg('AC40', 'IV. Invers. empresas grupo y asociadas a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC41', 1), child('AC42', 1), child('AC43', 1), child('AC44', 1), child('AC45', 1), child('AC46', 1) }));
        s.add(leaf('AC41', '1. Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5303', 1, true), acc('5304', 1, true), acc('5393', 1, true), acc('5394', 1, true), acc('5933', 1, true), acc('5934', 1, true) }));
        s.add(leaf('AC42', '2. Créditos a empresas', 'ACTIVO', 3, new List<BalAccount>{ acc('5323', 1, true), acc('5324', 1, true), acc('5343', 1, true), acc('5344', 1, true), acc('5953', 1, true), acc('5954', 1, true) }));
        s.add(leaf('AC43', '3. Valores representativos de deuda', 'ACTIVO', 3, new List<BalAccount>{ acc('5313', 1, true), acc('5314', 1, true), acc('5333', 1, true), acc('5334', 1, true), acc('5943', 1, true), acc('5944', 1, true) }));
        s.add(leaf('AC44', '4. Derivados', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(leaf('AC45', '5. Otros activos financieros', 'ACTIVO', 3, new List<BalAccount>{ acc('5353', 1, true), acc('5354', 1, true), acc('5523', 1, true), acc('5524', 1, true) }));
        s.add(leaf('AC46', '6. Otras inversiones', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(agg('AC50', 'V. Inversiones financieras a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC51', 1), child('AC52', 1), child('AC53', 1), child('AC54', 1), child('AC55', 1), child('AC56', 1) }));
        s.add(leaf('AC51', '1. Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5305', 1, true), acc('5395', 1, true), acc('540', 1, true), acc('549', 1, true), acc('5935', 1, true), acc('5936', 1, true) }));
        s.add(leaf('AC52', '2. Créditos a empresas', 'ACTIVO', 3, new List<BalAccount>{ acc('5325', 1, true), acc('5345', 1, true), acc('542', 1, true), acc('543', 1, true), acc('547', 1, true), acc('5955', 1, true), acc('598', 1, true) }));
        s.add(leaf('AC53', '3. Valores representativos de deuda', 'ACTIVO', 3, new List<BalAccount>{ acc('5315', 1, true), acc('5335', 1, true), acc('541', 1, true), acc('546', 1, true), acc('5945', 1, true), acc('597', 1, true) }));
        s.add(leaf('AC54', '4. Derivados', 'ACTIVO', 3, new List<BalAccount>{ acc('5590', 1, true), acc('5593', 1, true) }));
        s.add(leaf('AC55', '5. Otros activos financieros', 'ACTIVO', 3, new List<BalAccount>{ acc('5355', 1, true), acc('545', 1, true), acc('548', 1, true), acc('551', 1, true), acc('5525', 1, true), acc('565', 1, true), acc('566', 1, true) }));
        s.add(leaf('AC56', '6. Otras inversiones', 'ACTIVO', 3, new List<BalAccount>{  }));
        s.add(leaf('AC60', 'VI. Periodificaciones a C/P', 'ACTIVO', 2, new List<BalAccount>{ acc('480', 1, true), acc('567', 1, true) }));
        s.add(agg('AC70', 'VII. Efectivo y otros activos líquidos equiv.', 'ACTIVO', 2, new List<BalChild>{ child('AC71', 1), child('AC72', 1) }));
        s.add(leaf('AC71', '1. Tesorería', 'ACTIVO', 3, new List<BalAccount>{ acc('570', 1, true), acc('571', 1, true), acc('572', 1, true), acc('573', 1, true), acc('574', 1, true), acc('575', 1, true) }));
        s.add(leaf('AC72', '2. Otros activos líquidos equivalentes', 'ACTIVO', 3, new List<BalAccount>{ acc('576', 1, true) }));
        s.add(total('ACTIVO', 'TOTAL ACTIVO (A + B)', 'ACTIVO', 1, new List<BalChild>{ child('AC', 1), child('ANC', 1) }));
        s.add(banda('SALTO2', 'PATRIMONIO NETO Y PASIVO', 'PASIVO'));
        s.add(agg('PN', 'A) PATRIMONIO NETO', 'PASIVO', 1, new List<BalChild>{ child('PNA1', 1), child('PNA20', 1), child('PNA30', 1), child('PNA40', 1) }));
        s.add(agg('PNA1', 'A-1) Fondos propios', 'PASIVO', 2, new List<BalChild>{ child('PNA11', 1), child('PNA12', 1), child('PNA13', 1), child('PNA14', 1), child('PNA15', 1), child('PNA16', 1), child('PNA17', 1), child('PNA18', 1), child('PNA19', 1) }));
        s.add(agg('PNA11', 'I. Capital', 'PASIVO', 3, new List<BalChild>{ child('PNA111', 1), child('PNA112', 1) }));
        s.add(leaf('PNA111', '1. Capital escriturado', 'PASIVO', 4, new List<BalAccount>{ acc('100', 1, false), acc('101', 1, false), acc('102', 1, false) }));
        s.add(leaf('PNA112', '2. (Capital no exigido)', 'PASIVO', 4, new List<BalAccount>{ acc('1030', 1, false), acc('1040', 1, false) }));
        s.add(leaf('PNA12', 'II. Prima de Emisión', 'PASIVO', 3, new List<BalAccount>{ acc('110', 1, false) }));
        s.add(agg('PNA13', 'III. Reservas', 'PASIVO', 3, new List<BalChild>{ child('PNA131', 1), child('PNA135', 1), child('PNA134', 1), child('PNA132', 1), child('PNA133', 1), child('PNA136', 1), child('PNA137', 1) }));
        s.add(leaf('PNA131', '1. Legal y estatutarias', 'PASIVO', 4, new List<BalAccount>{ acc('112', 1, false), acc('1141', 1, false) }));
        s.add(leaf('PNA135', '2. Reservas a efectos de Cuentas Anuales', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA134', 'a) Otras reservas a efectos de Sociedades', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA132', '3. Reserva de revalorización (Ley 16/2012)', 'PASIVO', 4, new List<BalAccount>{ acc('1145', 1, false) }));
        s.add(leaf('PNA133', 'a2) Reservas pendientes de cierre', 'PASIVO', 4, new List<BalAccount>{ acc('850', 1, false), acc('851', 1, false), acc('950', 1, false), acc('951', 1, false) }));
        s.add(leaf('PNA136', 'b) Reserva de nivelación', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA137', '4. Reserva de capitalización', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA14', 'IV.(Acciones/particip. patrimonio propias)', 'PASIVO', 3, new List<BalAccount>{ acc('108', 1, false), acc('109', 1, false) }));
        s.add(agg('PNA15', 'V. Resultados Ejercicios Anteriores', 'PASIVO', 3, new List<BalChild>{ child('PNA151', 1), child('PNA152', 1) }));
        s.add(leaf('PNA151', '1. Remanente', 'PASIVO', 4, new List<BalAccount>{ acc('120', 1, false) }));
        s.add(leaf('PNA152', '2. (Resultados negativos de ejerc.anteriores)', 'PASIVO', 4, new List<BalAccount>{ acc('121', 1, false) }));
        s.add(leaf('PNA16', 'VI. Otras aportaciones de socios', 'PASIVO', 3, new List<BalAccount>{ acc('118', 1, false) }));
        s.add(agg('PNA17', 'VII. Resultado del ejercicio', 'PASIVO', 3, new List<BalChild>{ child('PNA171', 1), child('PNA172', 1) }));
        s.add(leaf('PNA171', 'Cuenta Pérdidas y Ganancias (129)', 'PASIVO', 4, new List<BalAccount>{ acc('129', 1, false) }));
        s.add(leaf('PNA172', 'Ingresos/Gastos pendiente cierre', 'PASIVO', 4, new List<BalAccount>{ acc('6', 1, false), acc('7', 1, false) }));
        s.add(leaf('PNA18', 'VIII. (Dividendo a Cuenta)', 'PASIVO', 3, new List<BalAccount>{ acc('557', 1, false) }));
        s.add(leaf('PNA19', 'IX. Otros instrumentos de patrimonio neto', 'PASIVO', 3, new List<BalAccount>{ acc('111', 1, false) }));
        s.add(agg('PNA20', 'A-2) Ajustes por cambio de valor', 'PASIVO', 2, new List<BalChild>{ child('PNA21', 1), child('PNA22', 1), child('PNA23', 1), child('PNA24', 1), child('PNA25', 1), child('PNA26', 1) }));
        s.add(leaf('PNA21', 'I. Activos finan. valor razon.c.cambios en PN', 'PASIVO', 3, new List<BalAccount>{ acc('133', 1, false) }));
        s.add(leaf('PNA22', 'II. Operaciones de cobertura', 'PASIVO', 3, new List<BalAccount>{ acc('134', 1, false) }));
        s.add(leaf('PNA23', 'III. Activos no ctes. y pasivos vinculados', 'PASIVO', 3, new List<BalAccount>{ acc('136', 1, false) }));
        s.add(leaf('PNA24', 'IV. Diferencia de conversión', 'PASIVO', 3, new List<BalAccount>{ acc('135', 1, false) }));
        s.add(leaf('PNA25', 'V. Otros', 'PASIVO', 3, new List<BalAccount>{ acc('137', 1, false) }));
        s.add(leaf('PNA26', 'VI. Ajustes cambio valor pendiente de cierre', 'PASIVO', 3, new List<BalAccount>{ acc('800', 1, false), acc('801', 1, false), acc('802', 1, false), acc('803', 1, false), acc('810', 1, false), acc('811', 1, false), acc('812', 1, false), acc('813', 1, false), acc('820', 1, false), acc('821', 1, false), acc('830', 1, false), acc('833', 1, false), acc('834', 1, false), acc('835', 1, false), acc('836', 1, false), acc('837', 1, false), acc('838', 1, false), acc('860', 1, false), acc('862', 1, false), acc('890', 1, false), acc('891', 1, false), acc('892', 1, false), acc('900', 1, false), acc('901', 1, false), acc('902', 1, false), acc('903', 1, false), acc('910', 1, false), acc('911', 1, false), acc('912', 1, false), acc('913', 1, false), acc('920', 1, false), acc('921', 1, false), acc('960', 1, false), acc('962', 1, false), acc('990', 1, false), acc('991', 1, false), acc('992', 1, false), acc('993', 1, false), acc('994', 1, false) }));
        s.add(agg('PNA30', 'A-3) Subvenc., donaciones y legados recibidos', 'PASIVO', 2, new List<BalChild>{ child('PNA31', 1), child('PNA32', 1) }));
        s.add(leaf('PNA31', '1. Subvenc., donaciones y legados recibidos', 'PASIVO', 3, new List<BalAccount>{ acc('130', 1, false), acc('131', 1, false), acc('132', 1, false) }));
        s.add(leaf('PNA32', '2. Subv., donac. y legados pendiente cierre', 'PASIVO', 3, new List<BalAccount>{ acc('840', 1, false), acc('841', 1, false), acc('842', 1, false), acc('940', 1, false), acc('941', 1, false), acc('942', 1, false) }));
        s.add(leaf('PNA40', 'A-4) Patrimonio Neto pendiente ajustar NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1391', 1, false), acc('1392', 1, false) }));
        s.add(agg('PNC', 'B) PASIVO NO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PNC1', 1), child('PNC2', 1), child('PNC3', 1), child('PNC4', 1), child('PNC5', 1), child('PNC6', 1), child('PNC7', 1), child('PNC8', 1) }));
        s.add(agg('PNC1', 'I. Provisiones a L/P', 'PASIVO', 2, new List<BalChild>{ child('PNC11', 1), child('PNC12', 1), child('PNC13', 1), child('PNC14', 1) }));
        s.add(leaf('PNC11', '1. Oblig. por prestaciones L/P al personal', 'PASIVO', 3, new List<BalAccount>{ acc('140', 1, false) }));
        s.add(leaf('PNC12', '2. Actuaciones medioambientales', 'PASIVO', 3, new List<BalAccount>{ acc('145', 1, false) }));
        s.add(leaf('PNC13', '3. Provisiones por reestructuración', 'PASIVO', 3, new List<BalAccount>{ acc('146', 1, false) }));
        s.add(leaf('PNC14', '4. Otras provisiones', 'PASIVO', 3, new List<BalAccount>{ acc('141', 1, false), acc('142', 1, false), acc('143', 1, false), acc('147', 1, false), acc('149', 1, false) }));
        s.add(agg('PNC2', 'II. Deudas a L/P', 'PASIVO', 2, new List<BalChild>{ child('PNC21', 1), child('PNC22', 1), child('PNC23', 1), child('PNC24', 1), child('PNC25', 1) }));
        s.add(leaf('PNC21', '1. Obligaciones y otros valores negociables', 'PASIVO', 3, new List<BalAccount>{ acc('177', 1, false), acc('178', 1, false), acc('179', 1, false) }));
        s.add(leaf('PNC22', '2. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('1605', 1, false), acc('170', 1, false) }));
        s.add(leaf('PNC23', '3. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('1625', 1, false), acc('174', 1, false) }));
        s.add(leaf('PNC24', '4. Derivados', 'PASIVO', 3, new List<BalAccount>{ acc('176', 1, false) }));
        s.add(leaf('PNC25', '5. Otros pasivos financieros', 'PASIVO', 3, new List<BalAccount>{ acc('1615', 1, false), acc('1635', 1, false), acc('171', 1, false), acc('172', 1, false), acc('173', 1, false), acc('175', 1, false), acc('180', 1, false), acc('185', 1, false), acc('189', 1, false) }));
        s.add(leaf('PNC3', 'III. Deudas empresas grupo y asociadas a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('1603', 1, false), acc('1604', 1, false), acc('1613', 1, false), acc('1614', 1, false), acc('1623', 1, false), acc('1624', 1, false), acc('1633', 1, false), acc('1634', 1, false) }));
        s.add(leaf('PNC4', 'IV. Pasivos por impuesto diferido', 'PASIVO', 2, new List<BalAccount>{ acc('479', 1, false) }));
        s.add(leaf('PNC5', 'V. Periodificaciones a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('181', 1, false) }));
        s.add(leaf('PNC6', 'VI. Acreedores comerciales no corrientes', 'PASIVO', 2, new List<BalAccount>{  }));
        s.add(leaf('PNC7', 'VII. Deuda caract. especiales a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('15', 1, false), acc('5585', 1, false) }));
        s.add(leaf('PNC8', 'VIII. Pasivo no Corriente pdte. ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1393', 1, false), acc('1394', 1, false), acc('1395', 1, false) }));
        s.add(agg('PC', 'C) PASIVO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PC1', 1), child('PC2', 1), child('PC3', 1), child('PC4', 1), child('PC5', 1), child('PC6', 1), child('PC7', 1), child('PC8', 1), child('PC21', 1), child('PC22', 1) }));
        s.add(leaf('PC1', 'I. Pasivos vinc. activos no ctes. mant. venta', 'PASIVO', 2, new List<BalAccount>{ acc('585', 1, false), acc('586', 1, false), acc('587', 1, false), acc('588', 1, false), acc('589', 1, false) }));
        s.add(leaf('PC2', 'II. Provisiones a C/P', 'PASIVO', 2, new List<BalAccount>{  }));
        s.add(leaf('PC21', '1. Provisiones derechos gases invernadero', 'PASIVO', 2, new List<BalAccount>{ acc('5299', 1, false) }));
        s.add(leaf('PC22', '2. Otras provisiones', 'PASIVO', 2, new List<BalAccount>{ acc('499', 1, false), acc('529', 1, false), acc('5299', 1, true) }));
        s.add(agg('PC3', 'III. Deudas a C/P', 'PASIVO', 2, new List<BalChild>{ child('PC31', 1), child('PC32', 1), child('PC33', 1), child('PC34', 1), child('PC35', 1) }));
        s.add(leaf('PC31', '1. Obligaciones y otros valores negociables', 'PASIVO', 3, new List<BalAccount>{ acc('500', 1, false), acc('501', 1, false), acc('505', 1, false), acc('506', 1, false) }));
        s.add(leaf('PC32', '2. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('5105', 1, false), acc('520', 1, false), acc('527', 1, false) }));
        s.add(leaf('PC33', '3. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('5125', 1, false), acc('524', 1, false) }));
        s.add(leaf('PC34', '4. Derivados', 'PASIVO', 3, new List<BalAccount>{ acc('5595', 1, false), acc('5598', 1, false) }));
        s.add(leaf('PC35', '5. Otros pasivos financieros', 'PASIVO', 3, new List<BalAccount>{ acc('1034', 1, false), acc('1044', 1, false), acc('190', 1, false), acc('192', 1, false), acc('194', 1, false), acc('509', 1, false), acc('5115', 1, false), acc('5135', 1, false), acc('5145', 1, false), acc('521', 1, false), acc('522', 1, false), acc('523', 1, false), acc('525', 1, false), acc('526', 1, false), acc('528', 1, false), acc('550', 1, false), acc('551', 1, false), acc('5525', 1, false), acc('5530', 1, false), acc('5532', 1, false), acc('554', 1, false), acc('555', 1, false), acc('5565', 1, false), acc('5566', 1, false), acc('560', 1, false), acc('561', 1, false), acc('569', 1, false) }));
        s.add(leaf('PC4', 'IV. Deudas empresas grupo y asociadas a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('5103', 1, false), acc('5104', 1, false), acc('5113', 1, false), acc('5114', 1, false), acc('5123', 1, false), acc('5124', 1, false), acc('5133', 1, false), acc('5134', 1, false), acc('5143', 1, false), acc('5144', 1, false), acc('5523', 1, false), acc('5524', 1, false), acc('5563', 1, false), acc('5564', 1, false) }));
        s.add(agg('PC5', 'V. Acreedores ciales. y otras ctas. a pagar', 'PASIVO', 2, new List<BalChild>{ child('PC51', 1), child('PC52', 1), child('PC53', 1), child('PC54', 1), child('PC55', 1), child('PC56', 1), child('PC57', 1) }));
        s.add(leaf('PC51', '1. Proveedores', 'PASIVO', 3, new List<BalAccount>{ acc('400', 1, false), acc('401', 1, false), acc('405', 1, false), acc('406', 1, false) }));
        s.add(leaf('PC52', '2. Proveedores,empresas del grupo y asociadas', 'PASIVO', 3, new List<BalAccount>{ acc('403', 1, false), acc('404', 1, false) }));
        s.add(leaf('PC53', '3. Acreedores varios', 'PASIVO', 3, new List<BalAccount>{ acc('41', 1, false) }));
        s.add(leaf('PC54', '4. Personal (remuneraciones pdtes.de pago)', 'PASIVO', 3, new List<BalAccount>{ acc('465', 1, false), acc('466', 1, false) }));
        s.add(leaf('PC55', '5. Pasivos por impuesto corriente', 'PASIVO', 3, new List<BalAccount>{ acc('4752', 1, false) }));
        s.add(leaf('PC56', '6. Otras deudas con las Admin.Públicas', 'PASIVO', 3, new List<BalAccount>{ acc('4750', 1, false), acc('4751', 1, false), acc('4757', 1, false), acc('4758', 1, false), acc('476', 1, false), acc('477', 1, false) }));
        s.add(leaf('PC57', '7. Anticipos de clientes', 'PASIVO', 3, new List<BalAccount>{ acc('438', 1, false) }));
        s.add(leaf('PC6', 'VI. Periodificaciones a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('485', 1, false), acc('568', 1, false) }));
        s.add(leaf('PC7', 'VII. Deuda caract. especiales a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('195', 1, false), acc('197', 1, false), acc('199', 1, false), acc('502', 1, false), acc('507', 1, false) }));
        s.add(leaf('PC8', 'VIII. Pasivo Corriente pendiente ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('270', 1, false), acc('271', 1, false), acc('272', 1, false), acc('275', 1, false), acc('276', 1, false), acc('277', 1, false), acc('279', 1, false), acc('289', 1, false) }));
        s.add(total('PASIVO', 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', 'PASIVO', 1, new List<BalChild>{ child('PC', 1), child('PN', 1), child('PNC', 1) }));
        return s;
    }

    private static List<BalLine> abreviado() {
        List<BalLine> s = new List<BalLine>();
        s.add(banda('SALTO1', 'ACTIVO', 'ACTIVO'));
        s.add(agg('ANC', 'A) ACTIVO NO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('ANC10', 1), child('ANC20', 1), child('ANC30', 1), child('ANC40', 1), child('ANC50', 1), child('ANC60', 1), child('ANC70', 1) }));
        s.add(agg('ANC10', 'I. Inmovilizado Intangible', 'ACTIVO', 2, new List<BalChild>{ child('ANC101', 1), child('ANC102', 1) }));
        s.add(leaf('ANC101', 'a) Fondo de comercio', 'ACTIVO', 3, new List<BalAccount>{ acc('204', 1, true) }));
        s.add(leaf('ANC102', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('20', 1, true), acc('204', 1, false), acc('280', 1, true), acc('290', 1, true) }));
        s.add(leaf('ANC20', 'II. Inmovilizado Material', 'ACTIVO', 2, new List<BalAccount>{ acc('21', 1, true), acc('23', 1, true), acc('281', 1, true), acc('291', 1, true) }));
        s.add(leaf('ANC30', 'III. Inversiones Inmobiliarias', 'ACTIVO', 2, new List<BalAccount>{ acc('22', 1, true), acc('282', 1, true), acc('292', 1, true) }));
        s.add(agg('ANC40', 'IV. Invers. empresas grupo y asociadas a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC401', 1), child('ANC402', 1) }));
        s.add(leaf('ANC401', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2403', 1, true), acc('2404', 1, true), acc('2413', 1, true), acc('2414', 1, true), acc('2933', 1, true), acc('2934', 1, true), acc('2943', 1, true), acc('2944', 1, true) }));
        s.add(leaf('ANC402', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('2423', 1, true), acc('2424', 1, true), acc('2493', 1, true), acc('2494', 1, true), acc('2953', 1, true), acc('2954', 1, true) }));
        s.add(agg('ANC50', 'V.Inversiones financieras a L/P', 'ACTIVO', 2, new List<BalChild>{ child('ANC501', 1), child('ANC502', 1) }));
        s.add(leaf('ANC501', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('2405', 1, true), acc('2415', 1, true), acc('2495', 1, true), acc('250', 1, true), acc('251', 1, true), acc('255', 1, true), acc('2935', 1, true), acc('2936', 1, true), acc('2945', 1, true), acc('2955', 1, true) }));
        s.add(leaf('ANC502', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('2425', 1, true), acc('252', 1, true), acc('253', 1, true), acc('254', 1, true), acc('257', 1, true), acc('258', 1, true), acc('259', 1, true), acc('26', 1, true), acc('296', 1, true), acc('297', 1, true), acc('298', 1, true) }));
        s.add(leaf('ANC60', 'VI. Activos por impuesto diferido', 'ACTIVO', 2, new List<BalAccount>{ acc('474', 1, true) }));
        s.add(leaf('ANC70', 'VII. Deudores comerciales no corrientes', 'ACTIVO', 2, new List<BalAccount>{  }));
        s.add(agg('AC', 'B) ACTIVO CORRIENTE', 'ACTIVO', 1, new List<BalChild>{ child('AC10', 1), child('AC20', 1), child('AC30', 1), child('AC40', 1), child('AC50', 1), child('AC60', 1), child('AC70', 1) }));
        s.add(leaf('AC10', 'I. Activos no corrientes mantenidos para vta', 'ACTIVO', 2, new List<BalAccount>{ acc('580', 1, true), acc('581', 1, true), acc('582', 1, true), acc('583', 1, true), acc('584', 1, true), acc('599', 1, true) }));
        s.add(leaf('AC20', 'II. Existencias', 'ACTIVO', 2, new List<BalAccount>{ acc('30', 1, true), acc('31', 1, true), acc('32', 1, true), acc('33', 1, true), acc('34', 1, true), acc('35', 1, true), acc('36', 1, true), acc('39', 1, true), acc('407', 1, true) }));
        s.add(agg('AC30', 'III. Deudores ciales y otras ctas.cobrar', 'ACTIVO', 2, new List<BalChild>{ child('AC31', 1), child('AC32', 1), child('AC33', 1) }));
        s.add(leaf('AC31', '1. Clientes ventas y Prestaciones Servicios', 'ACTIVO', 3, new List<BalAccount>{ acc('430', 1, true), acc('431', 1, true), acc('432', 1, true), acc('433', 1, true), acc('434', 1, true), acc('435', 1, true), acc('436', 1, true), acc('437', 1, true), acc('490', 1, true), acc('493', 1, true) }));
        s.add(leaf('AC32', '2. Accionistas (socios) por desembolsos exig.', 'ACTIVO', 3, new List<BalAccount>{ acc('5580', 1, true) }));
        s.add(leaf('AC33', '3. Otros deudores', 'ACTIVO', 3, new List<BalAccount>{ acc('44', 1, true), acc('460', 1, true), acc('470', 1, true), acc('471', 1, true), acc('472', 1, true), acc('473', 1, true), acc('544', 1, true), acc('550', 1, true), acc('5531', 1, true), acc('5533', 1, true), acc('554', 1, true) }));
        s.add(agg('AC40', 'IV. Invers. empresas grupo y asociadas a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC401', 1), child('AC402', 1) }));
        s.add(leaf('AC401', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5303', 1, true), acc('5304', 1, true), acc('5313', 1, true), acc('5314', 1, true), acc('5333', 1, true), acc('5334', 1, true), acc('5353', 1, true), acc('5354', 1, true), acc('5393', 1, true), acc('5394', 1, true), acc('5933', 1, true), acc('5934', 1, true), acc('5943', 1, true), acc('5944', 1, true) }));
        s.add(leaf('AC402', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('5323', 1, true), acc('5324', 1, true), acc('5343', 1, true), acc('5344', 1, true), acc('5523', 1, true), acc('5524', 1, true), acc('5953', 1, true), acc('5954', 1, true) }));
        s.add(agg('AC50', 'V. Inversiones financieras a C/P', 'ACTIVO', 2, new List<BalChild>{ child('AC501', 1), child('AC502', 1) }));
        s.add(leaf('AC501', 'a) Instrumentos de patrimonio', 'ACTIVO', 3, new List<BalAccount>{ acc('5305', 1, true), acc('5315', 1, true), acc('5335', 1, true), acc('5355', 1, true), acc('5395', 1, true), acc('540', 1, true), acc('541', 1, true), acc('545', 1, true), acc('549', 1, true), acc('5590', 1, true), acc('5593', 1, true), acc('5935', 1, true), acc('5936', 1, true), acc('5945', 1, true), acc('597', 1, true) }));
        s.add(leaf('AC502', 'b) Resto', 'ACTIVO', 3, new List<BalAccount>{ acc('5325', 1, true), acc('5345', 1, true), acc('542', 1, true), acc('543', 1, true), acc('546', 1, true), acc('547', 1, true), acc('548', 1, true), acc('551', 1, true), acc('5525', 1, true), acc('565', 1, true), acc('566', 1, true), acc('5955', 1, true), acc('598', 1, true) }));
        s.add(leaf('AC60', 'VI. Periodificaciones a C/P', 'ACTIVO', 2, new List<BalAccount>{ acc('480', 1, true), acc('567', 1, true) }));
        s.add(leaf('AC70', 'VII. Efectivo y otros activos líquidos equiv.', 'ACTIVO', 2, new List<BalAccount>{ acc('57', 1, true) }));
        s.add(total('ACTIVO', 'TOTAL ACTIVO (A + B)', 'ACTIVO', 1, new List<BalChild>{ child('AC', 1), child('ANC', 1) }));
        s.add(banda('SALTO2', 'PATRIMONIO NETO Y PASIVO', 'PASIVO'));
        s.add(agg('PN', 'A) PATRIMONIO NETO', 'PASIVO', 1, new List<BalChild>{ child('PNA1', 1), child('PNA20', 1), child('PNA30', 1), child('PNA40', 1) }));
        s.add(agg('PNA1', 'A-1) Fondos propios', 'PASIVO', 2, new List<BalChild>{ child('PNA11', 1), child('PNA12', 1), child('PNA13', 1), child('PNA14', 1), child('PNA15', 1), child('PNA16', 1), child('PNA17', 1), child('PNA18', 1), child('PNA19', 1) }));
        s.add(agg('PNA11', 'I. Capital', 'PASIVO', 3, new List<BalChild>{ child('PNA111', 1), child('PNA112', 1) }));
        s.add(leaf('PNA111', '1. Capital escriturado', 'PASIVO', 4, new List<BalAccount>{ acc('100', 1, false), acc('101', 1, false), acc('102', 1, false) }));
        s.add(leaf('PNA112', '2.(Capital no exigido)', 'PASIVO', 4, new List<BalAccount>{ acc('1030', 1, false), acc('1040', 1, false) }));
        s.add(leaf('PNA12', 'II. Prima de Emisión', 'PASIVO', 3, new List<BalAccount>{ acc('110', 1, false) }));
        s.add(agg('PNA13', 'III. Reservas', 'PASIVO', 3, new List<BalChild>{ child('PNA133', 1), child('PNA136', 1) }));
        s.add(agg('PNA133', '1. Reservas a efectos de Cuentas Anuales', 'PASIVO', 4, new List<BalChild>{ child('PNA134', 1), child('PNA135', 1) }));
        s.add(agg('PNA134', 'a) Otras reservas a efectos de Sociedades', 'PASIVO', 5, new List<BalChild>{ child('PNA131', 1), child('PNA132', 1) }));
        s.add(leaf('PNA131', 'a1) Reservas', 'PASIVO', 6, new List<BalAccount>{ acc('112', 1, false), acc('113', 1, false), acc('114', 1, false), acc('115', 1, false), acc('119', 1, false) }));
        s.add(leaf('PNA132', 'a2) Reservas pendientes de cierre', 'PASIVO', 6, new List<BalAccount>{ acc('850', 1, false), acc('851', 1, false), acc('950', 1, false), acc('951', 1, false) }));
        s.add(leaf('PNA135', 'b) Reserva de nivelación', 'PASIVO', 5, new List<BalAccount>{  }));
        s.add(leaf('PNA136', '2. Reserva de capitalización', 'PASIVO', 4, new List<BalAccount>{  }));
        s.add(leaf('PNA14', 'IV. (Acciones y particip. patrimonio propias)', 'PASIVO', 3, new List<BalAccount>{ acc('108', 1, false), acc('109', 1, false) }));
        s.add(leaf('PNA15', 'V. Resultados Ejercicios Anteriores', 'PASIVO', 3, new List<BalAccount>{ acc('120', 1, false), acc('121', 1, false) }));
        s.add(leaf('PNA16', 'VI. Otras aportaciones de socios', 'PASIVO', 3, new List<BalAccount>{ acc('118', 1, false) }));
        s.add(agg('PNA17', 'VII. Resultado del ejercicio', 'PASIVO', 3, new List<BalChild>{ child('PNA171', 1), child('PNA172', 1) }));
        s.add(leaf('PNA171', 'Cuenta Perd. y Ganancias (129)', 'PASIVO', 4, new List<BalAccount>{ acc('129', 1, false) }));
        s.add(leaf('PNA172', 'Ingresos/Gastos pendiente cierre', 'PASIVO', 4, new List<BalAccount>{ acc('6', 1, false), acc('7', 1, false) }));
        s.add(leaf('PNA18', 'VIII. (Dividendo a Cuenta)', 'PASIVO', 3, new List<BalAccount>{ acc('557', 1, false) }));
        s.add(leaf('PNA19', 'IX. Otros instrumentos de patrimonio neto', 'PASIVO', 3, new List<BalAccount>{ acc('111', 1, false) }));
        s.add(agg('PNA20', 'A-2) Ajustes por cambio de valor', 'PASIVO', 2, new List<BalChild>{ child('PNA201', 1), child('PNA202', 1) }));
        s.add(leaf('PNA201', '1. Ajustes por cambio valor', 'PASIVO', 3, new List<BalAccount>{ acc('133', 1, false), acc('134', 1, false), acc('135', 1, false), acc('136', 1, false), acc('137', 1, false) }));
        s.add(leaf('PNA202', '2. Ajustes por cambio valor pendiente cierre', 'PASIVO', 3, new List<BalAccount>{ acc('800', 1, false), acc('801', 1, false), acc('802', 1, false), acc('803', 1, false), acc('810', 1, false), acc('811', 1, false), acc('812', 1, false), acc('813', 1, false), acc('820', 1, false), acc('821', 1, false), acc('830', 1, false), acc('833', 1, false), acc('834', 1, false), acc('835', 1, false), acc('836', 1, false), acc('837', 1, false), acc('838', 1, false), acc('860', 1, false), acc('862', 1, false), acc('890', 1, false), acc('891', 1, false), acc('892', 1, false), acc('900', 1, false), acc('901', 1, false), acc('902', 1, false), acc('903', 1, false), acc('910', 1, false), acc('911', 1, false), acc('912', 1, false), acc('913', 1, false), acc('920', 1, false), acc('921', 1, false), acc('960', 1, false), acc('962', 1, false), acc('990', 1, false), acc('991', 1, false), acc('992', 1, false), acc('993', 1, false), acc('994', 1, false) }));
        s.add(agg('PNA30', 'A-3) Subvenciones, donacion. y legados recib.', 'PASIVO', 2, new List<BalChild>{ child('PNA301', 1), child('PNA302', 1) }));
        s.add(leaf('PNA301', '1. Subvenciones, donacion. y legados recib.', 'PASIVO', 3, new List<BalAccount>{ acc('130', 1, false), acc('131', 1, false), acc('132', 1, false) }));
        s.add(leaf('PNA302', '2. Subv., donac. y legados pendiente cierre', 'PASIVO', 3, new List<BalAccount>{ acc('840', 1, false), acc('841', 1, false), acc('842', 1, false), acc('940', 1, false), acc('941', 1, false), acc('942', 1, false) }));
        s.add(leaf('PNA40', 'A-4) Patrimonio Neto pendiente ajustar NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1391', 1, false), acc('1392', 1, false) }));
        s.add(agg('PNC', 'B) PASIVO NO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PNC1', 1), child('PNC2', 1), child('PNC3', 1), child('PNC4', 1), child('PNC5', 1), child('PNC6', 1), child('PNC7', 1), child('PNC8', 1) }));
        s.add(leaf('PNC1', 'I. Provisiones a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('14', 1, false) }));
        s.add(agg('PNC2', 'II. Deudas a L/P', 'PASIVO', 2, new List<BalChild>{ child('PNC21', 1), child('PNC22', 1), child('PNC23', 1) }));
        s.add(leaf('PNC21', '1. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('1605', 1, false), acc('170', 1, false) }));
        s.add(leaf('PNC22', '2. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('1625', 1, false), acc('174', 1, false) }));
        s.add(leaf('PNC23', '3. Otras deudas a L/P', 'PASIVO', 3, new List<BalAccount>{ acc('1615', 1, false), acc('1635', 1, false), acc('171', 1, false), acc('172', 1, false), acc('173', 1, false), acc('175', 1, false), acc('176', 1, false), acc('177', 1, false), acc('178', 1, false), acc('179', 1, false), acc('180', 1, false), acc('185', 1, false), acc('189', 1, false) }));
        s.add(leaf('PNC3', 'III. Deudas empresas grupo y asociadas a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('1603', 1, false), acc('1604', 1, false), acc('1613', 1, false), acc('1614', 1, false), acc('1623', 1, false), acc('1624', 1, false), acc('1633', 1, false), acc('1634', 1, false) }));
        s.add(leaf('PNC4', 'IV. Pasivos por impuesto diferido', 'PASIVO', 2, new List<BalAccount>{ acc('479', 1, false) }));
        s.add(leaf('PNC5', 'V. Periodificaciones a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('181', 1, false) }));
        s.add(leaf('PNC6', 'VI. Acreedores comerciales no corrientes', 'PASIVO', 2, new List<BalAccount>{  }));
        s.add(leaf('PNC7', 'VII. Deuda caract. especiales a L/P', 'PASIVO', 2, new List<BalAccount>{ acc('15', 1, false), acc('5585', 1, false) }));
        s.add(leaf('PNC8', 'VIII. Pasivo no Corriente pdte. ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('1393', 1, false), acc('1394', 1, false), acc('1395', 1, false) }));
        s.add(agg('PC', 'C) PASIVO CORRIENTE', 'PASIVO', 1, new List<BalChild>{ child('PC1', 1), child('PC2', 1), child('PC3', 1), child('PC4', 1), child('PC5', 1), child('PC6', 1), child('PC7', 1), child('PC8', 1) }));
        s.add(leaf('PC1', 'I. Pasivos vinc. activos no ctes. mant. venta', 'PASIVO', 2, new List<BalAccount>{ acc('585', 1, false), acc('586', 1, false), acc('587', 1, false), acc('588', 1, false), acc('589', 1, false) }));
        s.add(leaf('PC2', 'II. Provisiones a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('499', 1, false), acc('529', 1, false) }));
        s.add(agg('PC3', 'III. Deudas a C/P', 'PASIVO', 2, new List<BalChild>{ child('PC31', 1), child('PC32', 1), child('PC33', 1) }));
        s.add(leaf('PC31', '1. Deudas con entidades de crédito', 'PASIVO', 3, new List<BalAccount>{ acc('5105', 1, false), acc('520', 1, false), acc('527', 1, false) }));
        s.add(leaf('PC32', '2. Acreedores por arrendamiento financiero', 'PASIVO', 3, new List<BalAccount>{ acc('5125', 1, false), acc('524', 1, false) }));
        s.add(leaf('PC33', '3. Otras deudas a C/P', 'PASIVO', 3, new List<BalAccount>{ acc('1034', 1, false), acc('1044', 1, false), acc('190', 1, false), acc('192', 1, false), acc('194', 1, false), acc('500', 1, false), acc('501', 1, false), acc('505', 1, false), acc('506', 1, false), acc('509', 1, false), acc('5115', 1, false), acc('5135', 1, false), acc('5145', 1, false), acc('521', 1, false), acc('522', 1, false), acc('523', 1, false), acc('525', 1, false), acc('526', 1, false), acc('528', 1, false), acc('550', 1, false), acc('551', 1, false), acc('5525', 1, false), acc('5530', 1, false), acc('5532', 1, false), acc('554', 1, false), acc('555', 1, false), acc('5565', 1, false), acc('5566', 1, false), acc('5595', 1, false), acc('5598', 1, false), acc('560', 1, false), acc('561', 1, false), acc('569', 1, false) }));
        s.add(leaf('PC4', 'IV. Deudas con emp. grupo y asociadas a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('5103', 1, false), acc('5104', 1, false), acc('5113', 1, false), acc('5114', 1, false), acc('5123', 1, false), acc('5124', 1, false), acc('5133', 1, false), acc('5134', 1, false), acc('5143', 1, false), acc('5144', 1, false), acc('5523', 1, false), acc('5524', 1, false), acc('5563', 1, false), acc('5564', 1, false) }));
        s.add(agg('PC5', 'V. Acreedores ciales. y otras ctas. a pagar', 'PASIVO', 2, new List<BalChild>{ child('PC51', 1), child('PC52', 1) }));
        s.add(leaf('PC51', '1. Proveedores', 'PASIVO', 3, new List<BalAccount>{ acc('400', 1, false), acc('401', 1, false), acc('403', 1, false), acc('404', 1, false), acc('405', 1, false), acc('406', 1, false) }));
        s.add(leaf('PC52', '2. Otros acreedores', 'PASIVO', 3, new List<BalAccount>{ acc('41', 1, false), acc('438', 1, false), acc('465', 1, false), acc('466', 1, false), acc('475', 1, false), acc('476', 1, false), acc('477', 1, false) }));
        s.add(leaf('PC6', 'VI. Periodificaciones a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('485', 1, false), acc('568', 1, false) }));
        s.add(leaf('PC7', 'VII. Deuda caract. especiales a C/P', 'PASIVO', 2, new List<BalAccount>{ acc('195', 1, false), acc('197', 1, false), acc('199', 1, false), acc('502', 1, false), acc('507', 1, false) }));
        s.add(leaf('PC8', 'VIII. Pasivo Corriente pendiente ajustes NPGC', 'PASIVO', 2, new List<BalAccount>{ acc('270', 1, false), acc('271', 1, false), acc('272', 1, false), acc('275', 1, false), acc('276', 1, false), acc('277', 1, false), acc('279', 1, false), acc('289', 1, false) }));
        s.add(total('PASIVO', 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', 'PASIVO', 1, new List<BalChild>{ child('PC', 1), child('PN', 1), child('PNC', 1) }));
        return s;
    }

}