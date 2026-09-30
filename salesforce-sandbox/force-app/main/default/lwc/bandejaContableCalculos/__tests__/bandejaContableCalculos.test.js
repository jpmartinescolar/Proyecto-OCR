import {
    coincideDireccion, contrapartidaPorDefecto, sumasIva, propuestaAsiento, riesgosFiscales, comprobaciones, analisisIs, productos,
    conIncidencia, aRevisar, incidenciasContables
} from 'c/bandejaContableCalculos';

const endesa = {
    kind: 'FACTURA', emisor: 'Endesa', nif: 'A81948077', dir: 'Madrid', sumin: 'C/ Alcalá 245, 3º B, 28028 Madrid', numero: 'F1', fecha: '05/03/2026', total: '221,08', irpf: '0,00'
};
const ivasEndesa = [{ base: '175,16', pct: '21', cuota: '36,78' }, { base: '9,14', pct: '0', cuota: '0,00' }];

describe('utilidades', () => {
    it('compara direcciones por calle y número, sin tildes ni "C/"', () => {
        expect(coincideDireccion('C/ Alcalá 245, 3º B', ['Calle Alcala 245, 28028 Madrid'])).toBe(true);
        expect(coincideDireccion('C/ Alcalá 245', ['Calle de la Industria 14, Torrejón'])).toBe(false);
        expect(coincideDireccion('Calle Mayor 1', [])).toBe(false);
    });

    it('contrapartida: ventas en emitidas y cuenta a 7 dígitos en recibidas', () => {
        expect(contrapartidaPorDefecto('Emitida', '628 Suministros')).toBe('7000000 Ventas de mercaderías');
        expect(contrapartidaPorDefecto('Recibida', '628 Suministros')).toBe('6280000 Suministros');
    });

    it('el IVA no deducible se separa del deducible', () => {
        const s = sumasIva([{ base: '100', pct: '21', cuota: '21', ded: '50' }]);
        expect(s.cuota).toBeCloseTo(21);
        expect(s.noDed).toBeCloseTo(10.5);
        expect(s.ded).toBeCloseTo(10.5);
    });
});

describe('asiento', () => {
    it('cuadra y lleva el IVA no deducible al gasto', () => {
        const filas = propuestaAsiento({
            ivas: [{ base: '100', pct: '21', cuota: '21', ded: '50' }], contraDef: '6280000 Suministros', cuenta: '628',
            numero: 'F1', emisor: 'P', ctaProv: '4000001 P', irpf: '0', total: '121'
        });
        const d = filas.reduce((a, r) => a + r.d, 0);
        const h = filas.reduce((a, r) => a + r.h, 0);
        expect(d).toBeCloseTo(h);
        expect(filas[0].d).toBeCloseTo(110.5);
        expect(filas[filas.length - 1].cuenta).toBe('4000001');
    });
});

describe('riesgos y comprobaciones', () => {
    const cliente = {
        domicilio: 'Calle de la Industria 14', localidad: '28850 Torrejón',
        locales: [{ direccion: 'Calle del Hierro 7, 28850 Torrejón' }],
        actividades: [{ epigrafe: '691.2', descripcion: 'Reparación de vehículos automóviles' }],
        vinculados: [{ nombre: 'Socio', nif: 'A81948077', relacion: 'Socio' }]
    };
    const dirs = ['Calle de la Industria 14, 28850 Torrejón', 'Calle del Hierro 7, 28850 Torrejón'];

    it('suministro en inmueble no afecto con su riesgo económico', () => {
        const items = riesgosFiscales({ x: endesa, ivas: ivasEndesa, textoLineas: 'Término de energía', sumas: sumasIva(ivasEndesa), irpf: 0, direccionesAfectas: dirs });
        const w = items.find((i) => i.tag === 'No deducible');
        expect(w).toBeTruthy();
        expect(w.riesgo.total).toBeGreaterThan(0);
    });

    it('si el suministro está en un local afecto no hay riesgo', () => {
        const x = { ...endesa, sumin: 'C/ del Hierro 7, Torrejón' };
        const items = riesgosFiscales({ x, ivas: ivasEndesa, textoLineas: '', sumas: sumasIva(ivasEndesa), irpf: 0, direccionesAfectas: dirs });
        expect(items.find((i) => i.tag === 'No deducible')).toBeUndefined();
    });

    it('usa los vinculados reales y marca como ejemplo lo que no existe', () => {
        const it = comprobaciones({ x: endesa, ivas: ivasEndesa, tipo: 'Recibida', textoLineas: 'Término de energía', cliente, direccionesAfectas: dirs });
        const vinc = it.find((c) => c.titulo === 'Operación vinculada');
        expect(vinc.estado).toBe('warn');
        expect(vinc.ejemplo).toBe(false);
        expect(it.find((c) => c.titulo === 'Censo AEAT o VIES').ejemplo).toBe(true);
        expect(it.find((c) => c.titulo === 'Inmueble del suministro').estado).toBe('ko');
        expect(it.find((c) => c.titulo === 'Facturas anteriores').status).toBe('Proveedor nuevo');
    });

    it('sin actividades en Salesforce avisa en lugar de dar por buena la afectación', () => {
        const it = comprobaciones({ x: { ...endesa, sumin: null }, ivas: ivasEndesa, tipo: 'Recibida', textoLineas: 'Juego llaves', cliente: {}, direccionesAfectas: [] });
        expect(it.find((c) => c.titulo === 'Conceptos y actividades').status).toBe('Sin actividades');
    });

    it('histórico: desviación grande genera incidencia operativa y barras', () => {
        const h = { media: 100, meses: [['Ene', 100], ['Feb', 100]] };
        const it = comprobaciones({ x: { ...endesa, total: '200' }, ivas: ivasEndesa, tipo: 'Recibida', textoLineas: '', cliente, direccionesAfectas: dirs, historico: h, mes: 'Mar' });
        const hist = it.find((c) => c.titulo === 'Facturas anteriores');
        expect(hist.barras).toHaveLength(3);
        expect(hist.estado).toBe('warn');
        const normal = comprobaciones({ x: { ...endesa, total: '105' }, ivas: ivasEndesa, tipo: 'Recibida', textoLineas: '', cliente, direccionesAfectas: dirs, historico: h, mes: 'Mar' });
        expect(normal.find((c) => c.titulo === 'Facturas anteriores').estado).toBe('ok');
    });

    it('ticket sin NIF: el IVA deducido es incidencia; con la skill del cliente queda pre-validado', () => {
        const ticket = { ...endesa, kind: 'FACTURA SIMPL.', sumin: null };
        const base = { x: ticket, tipo: 'Ticket', textoLineas: 'Café', cliente, direccionesAfectas: dirs };
        const deducido = comprobaciones({ ...base, ivas: [{ base: '10,00', pct: '21', cuota: '2,10' }] }).find((c) => c.titulo === 'Factura simplificada');
        expect(deducido.estado).toBe('ko');
        expect(conIncidencia(deducido)).toBe(true);
        const conSkill = comprobaciones({ ...base, ivas: [{ base: '10,00', pct: '21', cuota: '2,10', ded: '0', sk2: 'SK-007' }], skills: ['SK-007'] })
            .find((c) => c.titulo === 'Factura simplificada');
        expect(conSkill.skill).toBe('SK-007');
        expect(conIncidencia(conSkill)).toBe(false);
        expect(aRevisar(conSkill)).toBe(true);
        // La skill inactiva no pre-valida
        const inactiva = comprobaciones({ ...base, ivas: [{ base: '10,00', pct: '21', cuota: '2,10', ded: '0', sk2: 'SK-007' }], skills: [] })
            .find((c) => c.titulo === 'Factura simplificada');
        expect(inactiva.skill).toBeUndefined();
    });

    it('incidencias contables: descuadres, cuotas mal calculadas y deducciones sin motivo', () => {
        const bien = [{ base: '100,00', pct: '21', cuota: '21,00' }];
        expect(incidenciasContables({ ivas: bien, cuadra: true, asientoCuadra: true })).toBe(0);
        const mal = [{ base: '100,00', pct: '21', cuota: '20,00' }, { base: '10,00', pct: '21', cuota: '2,10', ded: '50' }];
        expect(incidenciasContables({ ivas: mal, cuadra: false, asientoCuadra: true })).toBe(3);
    });
});

describe('IS y productos', () => {
    it('gasto en inmueble no afecto: no deducible como diferencia permanente', () => {
        const is = analisisIs({ x: endesa, ivas: ivasEndesa, textoLineas: '', direccionesAfectas: [] });
        expect(is.noDeducibles).toHaveLength(1);
        expect(is.noDeducibles[0].cat).toBe('Diferencia permanente · ajuste fiscal +');
        expect(is.total).toBe(1);
        expect(is.ajustes).toBeUndefined();
    });

    it('separa cantidad y precio unitario', () => {
        const p = productos([{ c: 'Gasóleo A · 38,2 L', i: '60,00 €' }], [{ base: '49,59', pct: '21' }]);
        expect(p.filas[0].desc).toBe('Gasóleo A');
        expect(p.filas[0].cantidad).toBe('38,2 L');
        expect(p.total).toBe('60,00');
    });
});
