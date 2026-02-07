// Checagem automática de dependências essenciais
try {
    require.resolve('express');
    require.resolve('ytdl-core');
    require.resolve('fluent-ffmpeg');
    require.resolve('@ffmpeg-installer/ffmpeg');
    require.resolve('cors');
} catch (e) {
    console.error('\n[ERRO] Dependências não encontradas. Execute:');
    console.error('npm install express ytdl-core fluent-ffmpeg @ffmpeg-installer/ffmpeg cors\n');
    process.exit(1);
}

const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const cors = require('cors');
const path = require('path');
const app = express();

ffmpeg.setFfmpegPath(ffmpegPath);

// CORS para qualquer origem
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de cada requisição
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Servir arquivos estáticos (caso queira adicionar CSS/JS futuramente)
app.use(express.static(__dirname));

// Servir o index.html diretamente
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/download', async (req, res) => {
    console.log('Recebido POST /download:', req.body);
    const { url } = req.body || {};
    if (!url || !ytdl.validateURL(url)) {
        console.log('URL inválida:', url);
        return res.status(400).json({ error: 'URL inválida do YouTube.' });
    }

    let erroRespondido = false;
    const timeout = setTimeout(() => {
        if (!erroRespondido) {
            erroRespondido = true;
            res.status(504).json({ error: 'Tempo excedido ao processar o download.' });
        }
    }, 60000); // 60 segundos

    try {
        // Primeiro: pedir as informações do vídeo antes de criar o ffmpeg.
        try {
            const info = await ytdl.getInfo(url);
            console.log('Informações do vídeo (getInfo):', info.videoDetails.title);

            // Criar o stream a partir da informação e iniciar ffmpeg imediatamente
            const stream = ytdl.downloadFromInfo(info, {
                filter: 'audioonly',
                quality: 'highestaudio',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });

            res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
            res.setHeader('Content-Type', 'audio/mpeg');

            ffmpeg(stream)
                .audioBitrate(128)
                .format('mp3')
                .on('start', (cmd) => {
                    console.log('Comando ffmpeg iniciado:', cmd);
                })
                .on('error', (err) => {
                    console.error('Erro no ffmpeg:', err);
                    if (!erroRespondido && !res.headersSent) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Erro ao converter para MP3: ' + (err && err.message ? err.message : String(err)) });
                        res.end();
                    }
                })
                .on('end', () => {
                    console.log('Conversão ffmpeg finalizada.');
                    clearTimeout(timeout);
                })
                .pipe(res, { end: true });

            // Se o cliente desconectar, limpar tudo
            res.on('close', () => {
                clearTimeout(timeout);
                try { stream.destroy(); } catch {}
            });

            return;
        } catch (infoErr) {
            const msg = infoErr && infoErr.message ? infoErr.message : String(infoErr);
            console.error('ytdl.getInfo falhou:', msg);
            // Se falhar ao obter info, tentar fallback com yt-dlp
            if (!erroRespondido && !res.headersSent && (msg.includes('Could not extract functions') || msg.includes('Unable to extract') || msg.includes('This video is unavailable'))) {
                console.log('getInfo falhou com problema de extração; tentando fallback com yt-dlp...');
                try {
                    const { spawn } = require('child_process');
                    const args = ['-o', '-', '--no-playlist', '--extract-audio', '--audio-format', 'mp3', url];
                    let proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

                    proc.on('error', (spawnErr) => {
                        console.error('Erro ao iniciar yt-dlp diretamente:', spawnErr && spawnErr.code ? spawnErr.code : spawnErr);
                        if (spawnErr && spawnErr.code === 'ENOENT') {
                            console.log('yt-dlp não encontrado no PATH, tentando via npx...');
                            proc = spawn('npx', ['yt-dlp', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

                            proc.on('error', (spawnErr2) => {
                                console.error('Erro ao iniciar npx yt-dlp:', spawnErr2);
                                if (!erroRespondido && !res.headersSent) {
                                    erroRespondido = true;
                                    clearTimeout(timeout);
                                    res.status(500).json({ error: 'Erro ao baixar com yt-dlp (npx): ' + (spawnErr2.message || spawnErr2) });
                                    res.end();
                                }
                            });
                        } else {
                            if (!erroRespondido && !res.headersSent) {
                                erroRespondido = true;
                                clearTimeout(timeout);
                                res.status(500).json({ error: 'Erro ao baixar com yt-dlp: ' + (spawnErr.message || spawnErr) });
                                res.end();
                            }
                        }
                    });

                    res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
                    res.setHeader('Content-Type', 'audio/mpeg');

                    proc.stdout.pipe(res);
                    proc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trim()));

                    proc.on('close', (code) => {
                        clearTimeout(timeout);
                        if (code !== 0) {
                            console.error('yt-dlp saiu com código', code);
                        } else {
                            console.log('yt-dlp finalizado com sucesso.');
                        }
                    });

                    // Se o cliente desconectar, matar o processo
                    res.on('close', () => { try { proc.kill(); } catch {} });
                    return;
                } catch (fallbackErr) {
                    console.error('Erro no fallback yt-dlp:', fallbackErr);
                    if (!erroRespondido && !res.headersSent) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Erro no fallback: ' + (fallbackErr.message || String(fallbackErr)) });
                        res.end();
                    }
                    return;
                }
            }

            // Caso contrário, responder com erro padrão
            if (!erroRespondido && !res.headersSent) {
                erroRespondido = true;
                clearTimeout(timeout);
                res.status(500).json({ error: 'Erro ao baixar o áudio do YouTube: ' + msg });
                res.end();
            }
        }

    } catch (err) {
        console.error('Erro geral:', err);
        if (!erroRespondido && !res.headersSent) {
            erroRespondido = true;
            clearTimeout(timeout);
            res.status(500).json({ error: 'Erro ao processar o download: ' + err.message });
            res.end();
        }
    }
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
