require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');

const createAuthRoutes = require('./routes/authRoutes');
const createAdminRoutes = require('./routes/adminRoutes');
const createBobineRoutes = require('./routes/bobineRoutes');
const etRoutes = require('./routes/etRoutes');

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

const activeUserSockets = new Map();

app.use('/api', createAuthRoutes({ io }));
app.use('/api/admin', createAdminRoutes({ io, activeUserSockets }));
app.use('/api', createBobineRoutes({ io }));
app.use('/api', etRoutes);

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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server API in ascolto in HTTPS sulla porta ${PORT} all'indirizzo https://rotoli.ujet.it`);
});
