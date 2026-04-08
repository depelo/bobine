require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const { setupWorker } = require('@socket.io/sticky');
const { createAdapter } = require('@socket.io/cluster-adapter');
const cluster = require('cluster');

const createAuthRoutes = require('./routes/authRoutes');
const createAdminRoutes = require('./routes/adminRoutes');
const createBobineRoutes = require('./routes/bobineRoutes');
const etRoutes = require('./routes/etRoutes');
const createGb2Routes = require('./routes/gb2Routes');

const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(express.static(__dirname));

const sslOptions = {
    key: fs.readFileSync('C:\\Acme\\certificati_ssl\\rotoli.ujet.it-key.pem'),
    cert: fs.readFileSync('C:\\Acme\\certificati_ssl\\rotoli.ujet.it-chain.pem')
};

const PORT = 443;
const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Cluster adapter: sincronizza eventi Socket.io tra worker PM2
io.adapter(createAdapter());
setupWorker(io);

const activeUserSockets = new Map();

app.use('/api', createAuthRoutes({ io }));
app.use('/api/admin', createAdminRoutes({ io, activeUserSockets }));
app.use('/api', createBobineRoutes({ io }));
app.use('/api', etRoutes);
app.use('/api/mrp', createGb2Routes({ io }));

io.on('connection', (socket) => {
    let currentUserId = null;

    socket.on('register', (data) => {
        if (!data || !data.userId) return;
        currentUserId = data.userId;

        socket.join('user_' + currentUserId);

        if (!activeUserSockets.has(currentUserId)) {
            activeUserSockets.set(currentUserId, new Set());
            io.to('captains_room').emit('user_status_changed', { userId: currentUserId, isOnline: true });
        }
        activeUserSockets.get(currentUserId).add(socket.id);
    });

    socket.on('register_captain', () => {
        socket.join('captains_room');
        const onlineUsers = Array.from(activeUserSockets.keys());
        socket.emit('initial_online_users', onlineUsers);
    });

    socket.on('force_pwd_curtain', (data) => {
        if (data && data.targetUserId) {
            io.to('user_' + data.targetUserId).emit('show_pwd_curtain', data);
        }
    });

    socket.on('kick_user', (data) => {
        if (data && data.targetUserId) {
            io.to('user_' + data.targetUserId).emit('force_logout', data);
        }
    });

    socket.on('disconnect', () => {
        if (currentUserId && activeUserSockets.has(currentUserId)) {
            const sockets = activeUserSockets.get(currentUserId);
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                activeUserSockets.delete(currentUserId);
                io.to('captains_room').emit('user_status_changed', { userId: currentUserId, isOnline: false });
            }
        }
    });
});

// Gestione graceful shutdown per PM2 reload
process.on('SIGINT', () => {
    console.log('[PM2] SIGINT ricevuto, chiusura graceful...');
    server.close(() => {
        process.exit(0);
    });
    // Forza chiusura dopo 4 secondi se le connessioni non si chiudono
    setTimeout(() => process.exit(0), 4000);
});

server.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Worker ${cluster.worker?.id || 'single'}] Server API in ascolto in HTTPS sulla porta ${PORT}`);

    // Auto-deploy oggetti SQL del modulo MRP/GB2 (solo dal primo worker)
    if (!cluster.worker || cluster.worker.id === 1) {
        try {
            const { getPoolMRP } = require('./config/db-mrp');
            const pool = await getPoolMRP();
            const results = await createGb2Routes.deployMrpObjects(pool);
            console.log('[GB2] Auto-deploy SQL completato:', results.map(r => `${r.file}: ${r.status}`).join(', '));
        } catch (err) {
            console.warn('[GB2] Auto-deploy SQL non riuscito (il server prosegue):', err.message);
        }
    }

    // Segnala a PM2 che il worker e pronto (per wait_ready in ecosystem.config.js)
    if (typeof process.send === 'function') {
        process.send('ready');
    }
});
