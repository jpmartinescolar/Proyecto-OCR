// Subida resumible directa del navegador a Google Cloud Storage.
// El archivo no pasa por Salesforce: se envía por trozos a la session URI que crea Cloud Run.
// Protocolo GCS: PUT con Content-Range; 308 = faltan bytes (cabecera Range dice hasta dónde
// llegó), 200/201 = terminado. Si se corta la red se pregunta el offset y se sigue desde ahí.
// Requisitos en Google: CORS del bucket con los orígenes de Salesforce y responseHeader "Range",
// y la sesión creada con la cabecera Origin del navegador.

// Múltiplo de 256 KiB, como exige GCS para todos los trozos menos el último
export const TROZO_BYTES = 8 * 1024 * 1024;
const MAX_REINTENTOS_TROZO = 5;

export class SubidaCancelada extends Error {
    constructor() {
        super('Subida cancelada por el usuario.');
        this.name = 'SubidaCancelada';
    }
}

function esperar(ms) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SubidaResumible {
    /**
     * @param {File} file
     * @param {string} uploadUrl  session URI de GCS
     * @param {function(number, number)} onProgreso  (bytesSubidos, total)
     */
    constructor(file, uploadUrl, onProgreso) {
        this.file = file;
        this.url = uploadUrl;
        this.onProgreso = onProgreso || (() => {});
        this.xhr = null;
        this.cancelada = false;
    }

    cancelar() {
        this.cancelada = true;
        if (this.xhr) this.xhr.abort();
    }

    async iniciar() {
        const total = this.file.size;
        let offset = 0;
        let fallos = 0;
        while (offset < total) {
            if (this.cancelada) throw new SubidaCancelada();
            const fin = Math.min(offset + TROZO_BYTES, total);
            try {
                const res = await this.enviar(this.file.slice(offset, fin), `bytes ${offset}-${fin - 1}/${total}`, offset);
                if (res.status === 200 || res.status === 201) {
                    this.onProgreso(total, total);
                    return;
                }
                if (res.status === 308) {
                    offset = this.offsetDesdeRange(res.range);
                    fallos = 0;
                    this.onProgreso(offset, total);
                    continue;
                }
                if (!this.esReintentable(res.status)) {
                    const e = new Error('Cloud Storage ha rechazado la subida (HTTP ' + res.status + ').');
                    e.definitivo = true;
                    throw e;
                }
            } catch (e) {
                if (this.cancelada) throw new SubidaCancelada();
                if (e.definitivo) throw e;
            }
            // Fallo temporal (red, 429, 5xx): espera con backoff, pregunta por dónde va y sigue
            fallos++;
            if (fallos > MAX_REINTENTOS_TROZO) {
                throw new Error('Se ha perdido la conexión con Cloud Storage tras ' + MAX_REINTENTOS_TROZO + ' reintentos.');
            }
            await esperar(Math.min(1000 * 2 ** (fallos - 1), 16000));
            const estado = await this.consultarOffset(total);
            if (estado.terminado) {
                this.onProgreso(total, total);
                return;
            }
            if (estado.offset !== null) offset = estado.offset;
            this.onProgreso(offset, total);
        }
    }

    /** Pregunta a GCS cuántos bytes tiene ya (PUT vacío con "bytes * /total") */
    async consultarOffset(total) {
        try {
            const res = await this.enviar(null, `bytes */${total}`, 0);
            if (res.status === 200 || res.status === 201) return { terminado: true };
            if (res.status === 308) return { terminado: false, offset: this.offsetDesdeRange(res.range) };
        } catch (e) {
            if (this.cancelada) throw new SubidaCancelada();
        }
        // No se sabe: se reintenta el mismo trozo desde el último offset conocido
        return { terminado: false, offset: null };
    }

    // "bytes=0-8388607" → 8388608; sin cabecera, GCS no ha guardado nada todavía
    offsetDesdeRange(range) {
        const m = /bytes=0-(\d+)/.exec(range || '');
        return m ? Number(m[1]) + 1 : 0;
    }

    esReintentable(status) {
        return status === 0 || status === 408 || status === 429 || status >= 500;
    }

    enviar(cuerpo, contentRange, offsetBase) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.xhr = xhr;
            xhr.open('PUT', this.url, true);
            xhr.setRequestHeader('Content-Range', contentRange);
            if (cuerpo) {
                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) this.onProgreso(offsetBase + ev.loaded, this.file.size);
                };
            }
            xhr.onload = () => {
                const status = xhr.status;
                if (status === 404 || status === 410) {
                    const e = new Error('La sesión de subida ha caducado. Vuelve a intentarlo.');
                    e.definitivo = true;
                    reject(e);
                    return;
                }
                resolve({ status, range: xhr.getResponseHeader('Range') });
            };
            xhr.onerror = () => reject(new Error('Error de red al subir a Cloud Storage.'));
            xhr.onabort = () => reject(new SubidaCancelada());
            xhr.send(cuerpo);
        });
    }
}

/** Modo simulado: recorre el archivo por trozos sin enviarlo a ningún sitio */
export async function simularSubida(file, onProgreso, control) {
    const total = file.size;
    for (let offset = 0; offset < total; offset += TROZO_BYTES) {
        if (control && control.cancelada) throw new SubidaCancelada();
        await esperar(150);
        onProgreso(Math.min(offset + TROZO_BYTES, total), total);
    }
}
