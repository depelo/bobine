/**
 * Crittografia simmetrica AES-256-GCM per password profili di prova.
 * La chiave viene da process.env.DB_ENCRYPTION_KEY (hex, 64 char = 32 byte).
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
    const hex = process.env.DB_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('DB_ENCRYPTION_KEY mancante o invalida nel .env (servono 64 caratteri hex)');
    }
    return Buffer.from(hex, 'hex');
}

/** Critta una stringa. Restituisce un Buffer (IV + authTag + ciphertext) pronto per VARBINARY. */
function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Layout: [IV 16B][AuthTag 16B][Ciphertext NB]
    return Buffer.concat([iv, authTag, encrypted]);
}

/** Decritta un Buffer (IV + authTag + ciphertext). Restituisce la stringa originale. */
function decrypt(buffer) {
    const key = getKey();
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
