/**
 * Gestione SMTP — legge la configurazione dal profilo attivo.
 * Produzione: da .env (SMTP_HOST, SMTP_PORT, ecc.)
 * Prova: dal profilo di prova in memoria (caricato da [GB2].[dbo].[TestProfiles])
 */

const nodemailer = require('nodemailer');
const { getActiveProfile, isProduction } = require('./db-mrp');

/**
 * Restituisce la config SMTP dal profilo attivo.
 */
function getSmtpConfig() {
    if (isProduction()) {
        return {
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT, 10) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER || '',
            password: process.env.SMTP_PASSWORD || '',
            from_address: process.env.SMTP_FROM_ADDRESS || '',
            from_name: process.env.SMTP_FROM_NAME || 'U.Jet s.r.l.'
        };
    }

    // Profilo di prova — i dati SMTP sono nel profilo attivo in memoria
    const profile = getActiveProfile();
    return {
        host: profile.smtp_host || '',
        port: parseInt(profile.smtp_port, 10) || 587,
        secure: profile.smtp_secure === true,
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
