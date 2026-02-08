#!/usr/bin/env node

const pm2 = require('pm2');

pm2.connect((err) => {
    if (err) {
        console.error('Erro ao conectar com PM2:', err);
        process.exit(2);
    }

    pm2.start({
        name: 'youtube-downloader',
        script: './server.js',
        instances: 1,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        },
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s'
    }, (err, apps) => {
        if (err) {
            console.error('Erro ao iniciar:', err);
            pm2.disconnect();
            process.exit(1);
        } else {
            console.log('✅ Servidor iniciado com PM2!');
            console.log('🌐 Acesse: http://localhost:3000');
            console.log('\nComandos úteis:');
            console.log('  npm run logs      - Ver logs em tempo real');
            console.log('  npm run status    - Ver status do servidor');
            console.log('  npm run restart   - Reiniciar servidor');
            console.log('  npm run stop      - Parar servidor');
            pm2.disconnect();
        }
    });
});

