const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const PROFILES_PATH = path.join(__dirname, 'db-profiles-mrp.json');

// ============================================================
// GESTIONE FILE PROFILI
// ============================================================

function loadProfiles() {
    if (!fs.existsSync(PROFILES_PATH)) {
        const defaultProfiles = {
            profiles: [{
                id: 'produzione',
                label: 'PRODUZIONE',
                server: process.env.DB_SERVER || 'localhost',
                server_ujet11: process.env.DB_SERVER_UJET11 || '',
                database_ujet11: process.env.DB_UJET11 || 'UJET11',
                database_mrp: process.env.DB_MRP || 'MRP',
                user: process.env.DB_USER || 'sa',
                password: process.env.DB_PASSWORD || '',
                color: '#e11d48'
            }],
            activeProfileId: 'produzione'
        };
        fs.writeFileSync(PROFILES_PATH, JSON.stringify(defaultProfiles, null, 2));
        console.log('[DB] db-profiles.json creato dal .env');
        return defaultProfiles;
    }
    return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8'));
}

function saveProfiles(data) {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(data, null, 2));
}

function sanitizeProfile(profile) {
    const { password, smtp_password, ...safe } = profile;
    return safe;
}

function buildConfig(profile, dbName) {
    return {
        server: profile.server,
        database: dbName,
        user: profile.user,
        password: profile.password,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
}

// ============================================================
// STATO DEL MODULO
// ============================================================

let poolMRP = null;
let switching = false;

// Carica il profilo attivo all'avvio del modulo (solo currentProfile, i pool restano lazy)
const _initialProfiles = loadProfiles();
let currentProfile = _initialProfiles.profiles.find(p => p.id === _initialProfiles.activeProfileId)
    || _initialProfiles.profiles[0];

console.log('[DB] Profilo attivo al caricamento:', currentProfile.label, '—', currentProfile.server);

// ============================================================
// POOL GETTER (lazy init con guard mutex)
// ============================================================

async function getPoolMRP() {
    if (switching) throw new Error('Switch profilo in corso, riprova tra un momento');
    if (!poolMRP) {
        poolMRP = await new sql.ConnectionPool(buildConfig(currentProfile, currentProfile.database_mrp)).connect();
        console.log('[DB] Pool MRP connesso —', currentProfile.database_mrp);
    }
    return poolMRP;
}

// ============================================================
// API PROFILI
// ============================================================

function getActiveProfile() {
    return sanitizeProfile(currentProfile);
}

function getAllProfiles() {
    const profiles = loadProfiles();
    return profiles.profiles.map(sanitizeProfile);
}

async function switchProfile(profileId) {
    if (switching) throw new Error('Switch già in corso');
    switching = true;
    try {
        const profiles = loadProfiles();
        const target = profiles.profiles.find(p => p.id === profileId);
        if (!target) throw new Error('Profilo non trovato: ' + profileId);

        // Chiudi pool esistente
        if (poolMRP) { try { await poolMRP.close(); } catch(e) {} }
        poolMRP = null;

        // Aggiorna profilo attivo nel file e in memoria
        currentProfile = target;
        profiles.activeProfileId = profileId;
        saveProfiles(profiles);

        // Pre-crea il pool subito (no lazy) per evitare errori sulla prima richiesta post-switch
        poolMRP = await new sql.ConnectionPool(buildConfig(target, target.database_mrp)).connect();

        console.log('[DB] Switch a profilo:', target.label, '—', target.server);
        return sanitizeProfile(target);
    } finally {
        switching = false;
    }
}

function addProfile(profileData) {
    const profiles = loadProfiles();
    if (profiles.profiles.some(p => p.id === profileData.id)) {
        throw new Error('Profilo con id "' + profileData.id + '" già esistente');
    }
    profiles.profiles.push(profileData);
    saveProfiles(profiles);
    return sanitizeProfile(profileData);
}

function updateProfile(profileId, data) {
    const profiles = loadProfiles();
    const idx = profiles.profiles.findIndex(p => p.id === profileId);
    if (idx === -1) throw new Error('Profilo non trovato: ' + profileId);

    const existing = profiles.profiles[idx];

    // Se password non fornita o vuota, mantieni quella esistente
    if (!data.password || data.password.trim() === '') {
        data.password = existing.password;
    }

    // Merge: id non modificabile
    profiles.profiles[idx] = { ...existing, ...data, id: existing.id };
    saveProfiles(profiles);

    // Aggiorna currentProfile in memoria se è quello attivo
    // (il pool continua a funzionare fino al prossimo switch)
    if (currentProfile && currentProfile.id === profileId) {
        currentProfile = profiles.profiles[idx];
    }

    return sanitizeProfile(profiles.profiles[idx]);
}

function deleteProfile(profileId) {
    const profiles = loadProfiles();
    if (profiles.activeProfileId === profileId) {
        throw new Error('Impossibile eliminare il profilo attivo');
    }
    const idx = profiles.profiles.findIndex(p => p.id === profileId);
    if (idx === -1) throw new Error('Profilo non trovato: ' + profileId);
    profiles.profiles.splice(idx, 1);
    saveProfiles(profiles);
}

module.exports = {
    getPoolMRP,
    sql,
    getActiveProfile,
    getAllProfiles,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile
};
