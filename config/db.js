require('dotenv').config();

const sql = require('mssql');

const dbUser = process.env.DB_USER || 'sa';

const dbConfig = {
    user: dbUser,
    password: process.env.DB_PASSWORD_GA || 'Risk0804',
    server: 'localhost',
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
    server: '192.168.0.163',
    database: 'PE',
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

const poolET = new sql.ConnectionPool(dbConfigET);
const poolETConnect = poolET.connect();

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
    getPoolET: async () => {
        await poolETConnect;
        return poolET;
    }
};
