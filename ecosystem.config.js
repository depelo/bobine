module.exports = {
    apps: [{
        name: 'portalujet',
        script: 'server.js',
        instances: 1,
        exec_mode: 'fork',
        kill_timeout: 5000,
        listen_timeout: 10000,
        wait_ready: true,
        max_memory_restart: '500M',
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        env: {
            NODE_ENV: 'production'
        }
    }]
};
