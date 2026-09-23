import { LightningElement, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME_FIELD from '@salesforce/schema/User.Name';
import EMAIL_FIELD from '@salesforce/schema/User.Email';
import PHONE_FIELD from '@salesforce/schema/User.Phone';
import LANGUAGE_FIELD from '@salesforce/schema/User.LanguageLocaleKey';

const LANGUAGE_LABELS = {
    es: 'Español',
    es_ES: 'Español',
    en_US: 'Inglés',
    en: 'Inglés',
    fr: 'Francés',
    pt_BR: 'Portugués',
    ca: 'Catalán'
};

/**
 * Página "Mi perfil" del área privada.
 * Muestra los datos del usuario logado (nombre, email, teléfono, idioma).
 *
 * @author JCL - BEOC9
 */
export default class PortalUserProfile extends LightningElement {
    userId = USER_ID;

    currentUserName;
    currentUserEmail;
    currentUserPhone;
    currentUserLanguage;

    @wire(getRecord, {
        recordId: '$userId',
        fields: [NAME_FIELD, EMAIL_FIELD, PHONE_FIELD, LANGUAGE_FIELD]
    })
    wiredUser({ data, error }) {
        if (data) {
            this.currentUserName = data.fields.Name.value;
            this.currentUserEmail = data.fields.Email.value;
            this.currentUserPhone = data.fields.Phone.value;
            this.currentUserLanguage = data.fields.LanguageLocaleKey.value;
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('Error obteniendo los datos del usuario logado', error);
        }
    }

    get displayName() {
        return this.currentUserName || 'Usuario';
    }

    get displayEmail() {
        return this.currentUserEmail || '—';
    }

    get displayPhone() {
        return this.currentUserPhone || '—';
    }

    get displayLanguageLabel() {
        if (!this.currentUserLanguage) {
            return '—';
        }
        return LANGUAGE_LABELS[this.currentUserLanguage] || this.currentUserLanguage;
    }

    get displayInitials() {
        if (!this.currentUserName) {
            return '--';
        }
        return this.currentUserName
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('');
    }
}