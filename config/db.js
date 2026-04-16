require('dotenv').config();

const sql = require('mssql');

const dbUser = process.env.DB_USER || 'sa';

const dbConfig = {
    user: dbUser,
    password: process.env.DB_PASSWORD_GA || 'Risk0804',
    server: process.env.DB_SERVER_GA || 'localhost',
    database: 'GA',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

const dbConfigPE = {
    user: dbUser,
    password: process.env.DB_PASSWORD_PE || 'Risk0804',
    server: process.env.DB_SERVER_PE || '192.168.0.163',
    database: 'PE',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

/** Database MRP (tabelle custom MRP + accesso cross-database a UJET11) */
const dbConfigMRP = {
    user: dbUser,
    password: process.env.DB_PASSWORD_MRP || 'Risk0804',
    server: process.env.DB_SERVER_MRP || '192.168.0.163',
    database: process.env.DB_NAME_MRP || 'MRP',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

/** Database ET su BCUBE2 (metadati tabella fisica UJ_Etichette, ecc.) */
const dbConfigET = {
    user: dbUser,
    password: process.env.DB_PASSWORD_ET || process.env.DB_PASSWORD_PE || 'Risk0804',
    server: process.env.DB_SERVER_ET || 'BCUBE2',
    database: process.env.DB_NAME_ET || 'ET',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

const poolGA = new sql.ConnectionPool(dbConfig);
const poolGAConnect = poolGA.connect();

const poolPE = new sql.ConnectionPool(dbConfigPE);
const poolPEConnect = poolPE.connect();

const poolMRP = new sql.ConnectionPool(dbConfigMRP);
const poolMRPConnect = poolMRP.connect();

const poolET = new sql.ConnectionPool(dbConfigET);
const poolETConnect = poolET.connect();

/** Database UJET11 su BCUBE2 (usato da ITT per classificazione tabtipa) */
const dbConfigITT = {
    user: dbUser,
    password: process.env.DB_PASSWORD_ITT || process.env.DB_PASSWORD_ET || 'Risk0804',
    server: process.env.DB_SERVER_ITT || 'BCUBE2',
    database: process.env.DB_NAME_ITT || 'UJET11',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

/** Database PRG su pc-sviluppo (Ujet Progetti) */
const dbConfigPRG = {
    user: process.env.DB_USER_PRG || dbUser,
    password: process.env.DB_PASSWORD_PRG || 'Risk0804',
    server: process.env.DB_SERVER_PRG || 'pc-sviluppo',
    database: process.env.DB_NAME_PRG || 'PRG',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        useUTC: false
    }
};

const poolITT = new sql.ConnectionPool(dbConfigITT);
const poolITTConnect = poolITT.connect();

const poolPRG = new sql.ConnectionPool(dbConfigPRG);
const poolPRGConnect = poolPRG.connect();

module.exports = {
    sql,
    getPoolGA: async () => {
        await poolGAConnect;
        return poolGA;
    },
    getPoolPE: async () => {
        await poolPEConnect;
        return poolPE;
    },
    getPoolMRP: async () => {
        await poolMRPConnect;
        return poolMRP;
    },
    getPoolET: async () => {
        await poolETConnect;
        return poolET;
    },
    getPoolITT: async () => {
        await poolITTConnect;
        return poolITT;
    },
    getPoolPRG: async () => {
        await poolPRGConnect;
        return poolPRG;
    }
};
