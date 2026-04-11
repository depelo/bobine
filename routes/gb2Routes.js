/**
 * GB2 Routes — Aggregatore
 *
 * Questo file importa i moduli route e li monta sul router Express.
 * Ogni modulo è autocontenuto in routes/gb2/*.js.
 *
 * Moduli:
 *   helpers.js         — funzioni condivise (deploy, naming, utility)
 *   db-profiles.js     — gestione profili connessione DB
 *   articoli.js        — ricerca articoli + progressivi + caricaMRP
 *   mrp-proposte.js    — proposte ordini MRP + consumi storici
 *   ordini.js          — emissione ordini + PDF + storico + duplicati
 *   email.js           — SMTP + invio email + preview + drafts
 *   fornitori.js       — classificazione fornitori + anagrafica + template
 */

const express = require('express');
const { getPoolMRP, getPoolProd, getPoolBcube, sql, getActiveProfile, isProduction,
        switchToTest, switchToProduction, setTestHasRiep, getTestHasRiep,
        PRODUCTION_PROFILE } = require('../config/db-gb2');
const { authenticateToken } = require('../middlewares/auth');

// Crea helpers (funzioni condivise)
const createHelpers = require('./gb2/helpers');

function createGb2Routes({ io, skipAuth } = {}) {
    const router = express.Router();
    const authMiddleware = skipAuth ? (req, res, next) => next() : authenticateToken;

    // Inizializza helpers con le dipendenze
    const helpers = createHelpers({
        sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
        getTestHasRiep, PRODUCTION_PROFILE
    });

    // Oggetto dipendenze condivise — passato a ogni modulo
    const deps = {
        sql, getPoolMRP, getPoolProd, getPoolBcube,
        getActiveProfile, isProduction,
        switchToTest, switchToProduction, setTestHasRiep,
        PRODUCTION_PROFILE,
        authMiddleware, io, helpers
    };

    // Monta i moduli route
    require('./gb2/db-profiles')(router, deps);
    require('./gb2/articoli')(router, deps);
    require('./gb2/mrp-proposte')(router, deps);
    require('./gb2/ordini')(router, deps);
    require('./gb2/email')(router, deps);
    require('./gb2/fornitori')(router, deps);

    return router;
}

// Espone deployProductionObjects per server.js (auto-deploy al boot)
const _bootHelpers = createHelpers({
    sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
    getTestHasRiep, PRODUCTION_PROFILE
});
createGb2Routes.deployProductionObjects = _bootHelpers.deployProductionObjects;

module.exports = createGb2Routes;
