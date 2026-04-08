module.exports = {
    apps: [{
        name: 'portalujet',
        script: 'server.js',
        instances: 2,
        exec_mode: 'cluster',
        // Graceful reload: aspetta che le connessioni attive terminino
        kill_timeout: 5000,        // 5s per chiudere connessioni in corso
        listen_timeout: 10000,     // 10s max per il worker nuovo
        wait_ready: true,          // aspetta process.send('ready') da server.js
        // Auto-restart
        max_memory_restart: '500M',
        // Logs
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        // Env
        env: {
            NODE_ENV: 'production'
        }
    }]
};
