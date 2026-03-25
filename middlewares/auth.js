const jwt = require('jsonwebtoken');
const sql = require('mssql');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET non è definito nelle variabili d\'ambiente.');
}

async function getEffectivePwdRules(pool, userId) {
    const confRes = await pool.request().query(
        "SELECT ConfigKey, ConfigValue FROM [GA].[dbo].[SystemConfig] WHERE ConfigKey IN ('PwdMinLength', 'PwdRequireNumber', 'PwdRequireUpper', 'PwdRequireSpecial')"
    );
    let globals = { PwdMinLength: 6, PwdRequireNumber: true, PwdRequireUpper: false, PwdRequireSpecial: false };
    confRes.recordset.forEach(r => {
        if (r.ConfigKey === 'PwdMinLength') {
            const parsed = parseInt(r.ConfigValue, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                globals.PwdMinLength = parsed;
            }
        } else if (r.ConfigKey in globals) {
            globals[r.ConfigKey] = r.ConfigValue === '1';
        }
    });

    const userRes = await pool.request()
        .input('id', sql.Int, userId)
        .query(`
            SELECT PwdMinLengthOverride, PwdRequireNumberOverride, PwdRequireUpperOverride, PwdRequireSpecialOverride
            FROM [GA].[dbo].[Users]
            WHERE IDUser = @id
        `);
    const overrides = userRes.recordset[0] || {};

    const numOverride = (val, fallback) =>
        val !== null && val !== undefined && !Number.isNaN(parseInt(val, 10)) ? parseInt(val, 10) : fallback;
    const boolOverride = (val, fallback) =>
        val !== null && val !== undefined
            ? (val === true || val === 1 || val === '1')
            : fallback;

    return {
        minLength: numOverride(overrides.PwdMinLengthOverride, globals.PwdMinLength),
        requireNum: boolOverride(overrides.PwdRequireNumberOverride, globals.PwdRequireNumber),
        requireUpp: boolOverride(overrides.PwdRequireUpperOverride, globals.PwdRequireUpper),
        requireSpec: boolOverride(overrides.PwdRequireSpecialOverride, globals.PwdRequireSpecial)
    };
}

function authenticateToken(req, res, next) {
    const token = req.cookies && req.cookies.jwt_token;
    if (!token) {
        return res.status(401).send('Token mancante');
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).send('Token non valido');
        }
        req.user = user;
        if (req.user && req.user.forcePwdChange) {
            const originalUrl = req.originalUrl || req.url;
            const isAllowedPath = originalUrl.includes('/logout') || originalUrl.includes('/users/me/password');
            if (!isAllowedPath) {
                return res.status(403).json({ requiresPasswordChange: true, message: 'Cambio password obbligatorio' });
            }
        }
        next();
    });
}

function authenticateCaptain(req, res, next) {
    authenticateToken(req, res, () => {
        if (!req.user || !req.user.isSuperuser) {
            return res.status(403).json({ message: 'Accesso negato: richiesti privilegi di Captain' });
        }
        next();
    });
}

module.exports = {
    JWT_SECRET,
    getEffectivePwdRules,
    authenticateToken,
    authenticateCaptain
};
