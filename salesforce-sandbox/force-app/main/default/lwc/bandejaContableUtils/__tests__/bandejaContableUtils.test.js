import { estadoProceso, estadoProcesoArchivo, recuentoDeListado, recuentoDeArchivos, estadoDeFila } from 'c/bandejaContableUtils';

describe('estado del procesamiento que ve el usuario', () => {
    it('un archivo: la subida manda hasta que está registrado; después, el procesamiento', () => {
        expect(estadoProcesoArchivo('Subiendo')).toBe('cargando');
        expect(estadoProcesoArchivo('Subido')).toBe('cargando');
        expect(estadoProcesoArchivo('Error')).toBe('error');
        expect(estadoProcesoArchivo('Sincronizado', null)).toBe('procesando');
        expect(estadoProcesoArchivo('Sincronizado', { estado: 'EN_COLA' })).toBe('procesando');
        expect(estadoProcesoArchivo('Sincronizado', { estado: 'PROCESADO_CON_INCIDENCIAS' })).toBe('procesado');
        expect(estadoProcesoArchivo('Sincronizado', { estado: 'NO_SOPORTADO' })).toBe('error');
    });

    it('una bandeja: manda el archivo menos avanzado', () => {
        expect(estadoProceso({}).texto).toBe('Sin archivos');
        expect(estadoProceso({ cargando: 1, procesado: 2 }).texto).toBe('Cargando');
        expect(estadoProceso({ procesando: 1, procesado: 2 })).toMatchObject({ texto: 'Procesando', detalle: '2 de 3 archivos terminados' });
        expect(estadoProceso({ error: 2 }).texto).toBe('Error');
        expect(estadoProceso({ procesado: 2, error: 1, enRevision: 3 })).toMatchObject({ texto: 'Procesado', detalle: '1 archivo con error · 3 por revisar' });
    });

    it('el listado y la ficha calculan lo mismo', () => {
        const fila = { id: 'b1', archivos: 3, archivosSincronizados: 2, archivosError: 1 };
        const google = { archivos: { PROCESADO: 1, PROCESANDO: 1 }, enRevision: 0 };
        const archivos = [{ id: 'a1', estado: 'Sincronizado' }, { id: 'a2', estado: 'Sincronizado' }, { id: 'a3', estado: 'Error' }];
        const porArchivo = { a1: { estado: 'PROCESADO' }, a2: { estado: 'PROCESANDO' } };
        expect(recuentoDeListado(fila, google)).toEqual(recuentoDeArchivos(archivos, porArchivo));
        expect(estadoProceso(recuentoDeListado(fila, google)).texto).toBe('Procesando');
    });

    it('en el listado, mientras se consulta o si falla la consulta, no se inventa el estado', () => {
        const fila = { id: 'b1', archivos: 1, archivosSincronizados: 1, archivosError: 0 };
        expect(estadoDeFila(fila, {}, 'cargando').texto).toBe('Consultando…');
        expect(estadoDeFila(fila, {}, 'error').texto).toBe('Sin conexión');
        // Si aún se está subiendo, no hace falta preguntar
        expect(estadoDeFila({ ...fila, archivosSincronizados: 0 }, {}, 'cargando').texto).toBe('Cargando');
    });
});
