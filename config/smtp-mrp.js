/**
 * Gestione SMTP — legge la configurazione dal profilo DB attivo.
 * I campi smtp_* vivono dentro db-profiles.json (legati al profilo DB).
 */

const nodemailer = require('nodemailer');
const db = require('./db-mrp');

/**
 * Restituisce la config SMTP dal profilo DB attivo (versione raw con password)
 */
function getSmtpConfig() {
    // Leggi direttamente dal file per avere smtp_password
    const fs = require('fs');
    const path = require('path');
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'db-profiles-mrp.json'), 'utf-8'));
    const activeId = raw.activeProfileId;
    const profile = raw.profiles.find(p => p.id === activeId);
    if (!profile) return null;

    return {
        host: profile.smtp_host || '',
        port: parseInt(profile.smtp_port, 10) || 587,
        secure: profile.smtp_secure === true || profile.smtp_secure === 'true',
        user: profile.smtp_user || '',
        password: profile.smtp_password || '',
        from_address: profile.smtp_from_address || '',
        from_name: profile.smtp_from_name || 'U.Jet s.r.l.'
    };
}

function isConfigured() {
    const c = getSmtpConfig();
    return c && c.host && c.from_address;
}

function createTransporter() {
    const c = getSmtpConfig();
    if (!c) throw new Error('Nessun profilo DB attivo');
    if (!c.host) throw new Error('Host SMTP non configurato nel profilo DB');

    const opts = {
        host: c.host,
        port: c.port || 587,
        secure: c.secure || false
    };

    if (c.user && c.password) {
        opts.auth = { user: c.user, pass: c.password };
    }

    return nodemailer.createTransport(opts);
}

async function testConnection() {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
}

async function inviaEmail({ to, subject, html, attachments }) {
    const c = getSmtpConfig();
    if (!c) throw new Error('SMTP non configurato nel profilo DB');

    const transporter = createTransporter();
    const from = c.from_name ? `"${c.from_name}" <${c.from_address}>` : c.from_address;

    const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        attachments
    });

    return info;
}

module.exports = {
    getSmtpConfig,
    isConfigured,
    createTransporter,
    testConnection,
    inviaEmail
};
