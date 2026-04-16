/**
 * GB2 Routes — Aggregatore
 *
 * Questo file importa i moduli route e li monta sul router Express.
 * Ogni modulo è autocontenuto in routes/gb2/*.js.
 *
 * Architettura pool (2 pool):
 *   getPool163()       — tabelle app su 163 (MRP, GB2, GA)
 *   getPoolDest(uid)   — tabelle BCube su server destinazione (UJET11, GB2_SP)
 */

const express = require('express');
const { getPool163, getPoolDest, sql, getActiveProfile, getServerDest,
        switchToTest, switchToProduction, setTestHasRiep, getTestHasRiep,
        PRODUCTION_PROFILE } = require('../config/db-gb2');
const { authenticateToken } = require('../middlewares/auth');

const createHelpers = require('./gb2/helpers');

function createGb2Routes({ io, skipAuth } = {}) {
    const router = express.Router();
    const authMiddleware = skipAuth ? (req, res, next) => next() : authenticateToken;

    const helpers = createHelpers({
        sql, getPool163, getPoolDest, getActiveProfile, getServerDest,
        getTestHasRiep, PRODUCTION_PROFILE
    });

    const deps = {
        sql, getPool163, getPoolDest,
        getActiveProfile, getServerDest,
        switchToTest, switchToProduction, setTestHasRiep,
        PRODUCTION_PROFILE,
        authMiddleware, io, helpers
    };

    require('./gb2/db-profiles')(router, deps);
    require('./gb2/articoli')(router, deps);
    require('./gb2/mrp-proposte')(router, deps);
    require('./gb2/ordini')(router, deps);
    require('./gb2/conferma-pending')(router, deps);
    require('./gb2/email')(router, deps);
    require('./gb2/fornitori')(router, deps);

    return router;
}

const _bootHelpers = createHelpers({
    sql, getPool163, getPoolDest, getActiveProfile, getServerDest,
    getTestHasRiep, PRODUCTION_PROFILE
});
createGb2Routes.deployProductionObjects = _bootHelpers.deployProductionObjects;
createGb2Routes.cleanupStaleConfermatiPending = _bootHelpers.cleanupStaleConfermatiPending;

module.exports = createGb2Routes;
