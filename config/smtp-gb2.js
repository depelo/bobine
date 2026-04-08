/**
 * Gestione SMTP — configurazione per operatore.
 * Ogni operatore ha la propria config SMTP in [GB2].[dbo].[UserPreferences].
 * Le password sono crittate AES (config/crypto.js).
 */

const nodemailer = require('nodemailer');
const { getPoolProd, sql } = require('./db-gb2');
const { decrypt } = require('./crypto');

/**
 * Legge la config SMTP di un operatore dal DB.
 * @param {number} userId - IDUser dell'operatore
 * @returns {Object|null} { host, port, secure, user, password, from_address, from_name }
 */
async function getSmtpConfigForUser(userId) {
    const pool = await getPoolProd();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`SELECT SmtpHost, SmtpPort, SmtpSecure, SmtpUser, SmtpPassword,
                       SmtpFromAddress, SmtpFromName
                FROM [GB2].[dbo].[UserPreferences]
                WHERE IDUser = @userId`);

    if (!result.recordset.length) return null;

    const row = result.recordset[0];
    if (!row.SmtpHost) return null;

    return {
        host: row.SmtpHost,
        port: row.SmtpPort || 587,
        secure: !!row.SmtpSecure,
        user: row.SmtpUser || '',
        password: row.SmtpPassword ? decrypt(row.SmtpPassword) : '',
        from_address: row.SmtpFromAddress || '',
        from_name: row.SmtpFromName || 'U.Jet s.r.l.'
    };
}

/**
 * Crea un transporter nodemailer da una config SMTP.
 * @param {Object} config - output di getSmtpConfigForUser
 */
function createTransporterFromConfig(config) {
    if (!config || !config.host) {
        throw new Error('Host SMTP non configurato');
    }

    const opts = {
        host: config.host,
        port: config.port || 587,
        secure: config.secure || false
    };

    if (config.user && config.password) {
        opts.auth = { user: config.user, pass: config.password };
    }

    return nodemailer.createTransport(opts);
}

module.exports = {
    getSmtpConfigForUser,
    createTransporterFromConfig
};
