const bcrypt = require('bcrypt');
const sql = require('mssql');

const dbConfig = {
    user: 'sa',
    password: 'Uwey-2735', // Sostituisci se necessario
    server: 'localhost',
    database: 'CMP',
    options: { encrypt: false, trustServerCertificate: true }
};

async function createCaptain() {
    try {
        await sql.connect(dbConfig);
        const hash = await bcrypt.hash('admin123', 10); // Password iniziale: admin123

        // 1. Inserisce il Passaporto
        const userResult = await sql.query(`
            INSERT INTO [CMP].[dbo].[Users] ([Name], [Barcode], [PasswordHash], [IsActive])
            OUTPUT INSERTED.IDUser
            VALUES ('Captain System', 'CAPTAIN-001', '${hash}', 1)
        `);
        const newUserId = userResult.recordset[0].IDUser;

        // 2. Inserisce il Visto
        await sql.query(`
            INSERT INTO [CMP].[dbo].[Captains] ([IDUser], [Role])
            VALUES (${newUserId}, 'Master')
        `);

        console.log('✅ Captain creato con successo! Barcode: CAPTAIN-001 | Password: admin123');
        process.exit(0);
    } catch (err) {
        console.error('Errore:', err);
        process.exit(1);
    }
}

createCaptain();
