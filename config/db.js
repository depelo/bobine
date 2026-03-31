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

const dbConfigET = {
    user: 'sa',
    password: 'Risk0804',
    server: '192.168.0.163',
    database: 'ET',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

const poolGA = new sql.ConnectionPool(dbConfig);
const poolGAConnect = poolGA.connect();

const poolET = new sql.ConnectionPool(dbConfigET);
const poolETConnect = poolET.connect();

module.exports = {
    sql,
    getPoolGA: async () => {
        await poolGAConnect;
        return poolGA;
    },
    getPoolET: async () => {
        await poolETConnect;
        return poolET;
    }
};
