require('dotenv').config();

const sql = require('mssql');

const dbUser = process.env.DB_USER || 'sa';

const dbConfig = {
    user: dbUser,
    password: process.env.DB_PASSWORD_GA || '',
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
    password: process.env.DB_PASSWORD_PE || '',
    server: '192.168.0.163',
    database: 'PE',
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

module.exports = {
    sql,
    getPoolGA: async () => {
        await poolGAConnect;
        return poolGA;
    },
    getPoolPE: async () => {
        await poolPEConnect;
        return poolPE;
    }
};
