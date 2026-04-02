const sql = require('mssql');

const dbConfig = {
    user: 'sa',
    password: 'Risk0804',
    server: 'localhost',
    database: 'GA',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

const dbConfigPE = {
    user: 'sa',
    password: 'Risk0804',
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
