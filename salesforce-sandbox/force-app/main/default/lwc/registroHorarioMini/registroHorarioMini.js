import { LightningElement, track } from 'lwc';
import startTimerInit from '@salesforce/apex/RegistroHorarioCtr.startTimerInit';
import startTimer from '@salesforce/apex/RegistroHorarioCtr.startTimer';
import stopTimer from '@salesforce/apex/RegistroHorarioCtr.stopTimer';

/**
 * Versión compacta del registro horario para Mi panel. Reutiliza el Apex del
 * componente Aura RegistroHorario (RegistroHorarioCtr) sin tocar su lógica:
 * al cargar reanuda el fichaje abierto y la entrada/salida viaja con la
 * geolocalización y la IP del navegador, como en el original.
 */
export default class RegistroHorarioMini extends LightningElement {

    @track isStarted = false;
    @track seconds = '00';
    @track minutes = '00';
    @track hours = '00';
    @track message = '';
    @track cargando = false;
    recordId = null;
    timerId = null;

    connectedCallback() {
        this.cargando = true;
        startTimerInit()
            .then(res => {
                if (res && res.status && res.isResume) {
                    this.recordId = res.recordId;
                    this.seconds = res.seconds;
                    this.minutes = res.minutes;
                    this.hours = res.hours;
                    this.isStarted = true;
                    this.tick();
                }
            })
            .catch(() => { /* sin fichaje abierto o sin acceso: se queda a cero */ })
            .finally(() => { this.cargando = false; });
    }

    disconnectedCallback() {
        if (this.timerId) clearTimeout(this.timerId);
    }

    get tiempo() { return `${this.hours}:${this.minutes}:${this.seconds}`; }
    get hayMensaje() { return !!this.message; }

    handleEntrada() {
        this.message = '';
        this.isStarted = true;
        this.seconds = '00'; this.minutes = '00'; this.hours = '00';
        this.tick();
        this.extraInfo()
            .then(info => startTimer({ extraInfo: JSON.stringify(info) }))
            .then(res => {
                if (res && res.status) {
                    this.recordId = res.recordId;
                } else {
                    this.pararReloj();
                    this.message = (res && res.message) || 'No se pudo registrar la entrada';
                }
            })
            .catch(() => { this.pararReloj(); this.message = 'No se pudo registrar la entrada'; });
    }

    handleSalida() {
        this.message = '';
        this.pararReloj();
        this.extraInfo()
            .then(info => stopTimer({ recordId: this.recordId, extraInfo: JSON.stringify(info) }))
            .then(res => {
                if (!(res && res.status)) {
                    this.message = (res && res.message) || 'No se pudo registrar la salida';
                }
            })
            .catch(() => { this.message = 'No se pudo registrar la salida'; });
    }

    pararReloj() {
        this.isStarted = false;
        if (this.timerId) clearTimeout(this.timerId);
    }

    handleCerrarMensaje() { this.message = ''; }

    tick() {
        this.timerId = setTimeout(() => {
            if (!this.isStarted) return;
            let s = parseInt(this.seconds, 10) + 1;
            let m = parseInt(this.minutes, 10);
            let h = parseInt(this.hours, 10);
            if (s > 59) { s = 0; m += 1; }
            if (m > 59) { m = 0; h += 1; }
            this.seconds = String(s).padStart(2, '0');
            this.minutes = String(m).padStart(2, '0');
            this.hours = String(h).padStart(2, '0');
            this.tick();
        }, 1000);
    }

    // Geolocalización e IP como el componente original; si algo no responde
    // a tiempo, el fichaje se envía igualmente con lo que haya
    extraInfo() {
        const conTope = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({}), ms))]);
        const geo = new Promise(resolve => {
            if (!navigator.geolocation) { resolve({}); return; }
            navigator.geolocation.getCurrentPosition(
                p => resolve({ Latitude: p.coords.latitude, Longitude: p.coords.longitude }),
                () => resolve({}),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
        const ip = fetch('https://ipapi.co/json/')
            .then(r => r.json())
            .then(o => ({ IpInfo: o.ip }))
            .catch(() => ({}));
        return Promise.all([conTope(geo, 6000), conTope(ip, 6000)])
            .then(([g, i]) => ({ ...g, ...i }));
    }
}