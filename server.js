// Checagem automática de dependências essenciais
try {
    require.resolve('express');
    require.resolve('ytdl-core');
    require.resolve('fluent-ffmpeg');
    require.resolve('@ffmpeg-installer/ffmpeg');
    require.resolve('cors');
    require.resolve('archiver');
} catch (e) {
    console.error('\n[ERRO] Dependências não encontradas. Execute:');
    console.error('npm install express ytdl-core fluent-ffmpeg @ffmpeg-installer/ffmpeg cors archiver\n');
    process.exit(1);
}

const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const archiver = require('archiver');
const os = require('os');
const { PassThrough } = require('stream');
const app = express();

ffmpeg.setFfmpegPath(ffmpegPath);

// Parser robusto para saída do yt-dlp (JSON único ou múltiplos objetos)
function parseYtDlpPlaylistOutput(rawOutput) {
    const cleanOutput = (rawOutput || '').trim();
    if (!cleanOutput) {
        throw new Error('Saída vazia do yt-dlp');
    }

    // Tentar JSON único primeiro
    try {
        const data = JSON.parse(cleanOutput);
        if (data && Array.isArray(data.entries)) {
            return data;
        }
        return { entries: Array.isArray(data) ? data : [data] };
    } catch {
        // Seguir para extração de múltiplos objetos
    }

    const objects = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < cleanOutput.length; i++) {
        const ch = cleanOutput[i];
        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                const chunk = cleanOutput.slice(start, i + 1);
                try {
                    objects.push(JSON.parse(chunk));
                } catch {
                    // ignora chunk inválido
                }
                start = -1;
            }
        }
    }

    if (objects.length === 1 && objects[0] && Array.isArray(objects[0].entries)) {
        return objects[0];
    }

    if (objects.length > 0) {
        return { entries: objects };
    }

    throw new Error('Nenhum JSON válido encontrado na saída do yt-dlp');
}

// CORS para qualquer origem
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de cada requisição
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Servir o index.html diretamente
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Função auxiliar para baixar uma música
async function downloadAudio(url, isPlaylist = false) {
    return new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            const videoTitle = info.videoDetails.title;
            console.log('Baixando:', videoTitle);

            const stream = ytdl.downloadFromInfo(info, {
                filter: 'audioonly',
                quality: 'highestaudio',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });

            const sanitizedTitle = videoTitle.replace(/[<>:"|?*\\/]/g, '').slice(0, 200);
            const passThrough = new PassThrough();

            ffmpeg(stream)
                .audioBitrate(128)
                .format('mp3')
                .on('error', (err) => {
                    console.error('Erro ffmpeg:', err.message);
                    reject(err);
                })
                .on('end', () => {
                    console.log('Conversão concluída:', sanitizedTitle);
                    passThrough.end();
                })
                .pipe(passThrough, { end: true });

            resolve({ filename: `${sanitizedTitle}.mp3`, stream: passThrough });
        } catch (err) {
            reject(err);
        }
    });
}

// Função para obter informações de uma playlist
async function getPlaylistInfo(url) {
    const baseArgs = ['--flat-playlist', '--no-warnings', '--no-call-home', '--skip-download'];
    const primaryArgs = [url, '--dump-single-json', ...baseArgs];
    const fallbackArgs = [url, '--dump-json', ...baseArgs];

    const output = await runYtDlp(primaryArgs);
    const parsedPrimary = tryParsePlaylistOutput(output);
    if (parsedPrimary) return parsedPrimary;

    const outputFallback = await runYtDlp(fallbackArgs);
    const parsedFallback = tryParsePlaylistOutput(outputFallback);
    if (parsedFallback) return parsedFallback;

    throw new Error('Erro ao fazer parse JSON da playlist');
}

async function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        let output = '';
        const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { console.error('[yt-dlp]', data.toString().trim()); });

        proc.on('close', (code) => {
            if (code === 0) return resolve(output);
            return reject(new Error('Erro ao obter info da playlist'));
        });

        proc.on('error', (err) => {
            if (err.code === 'ENOENT') {
                const proc2 = spawn('npx', ['yt-dlp', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
                let output2 = '';
                proc2.stdout.on('data', (data) => { output2 += data.toString(); });
                proc2.stderr.on('data', (data) => { console.error('[yt-dlp]', data.toString().trim()); });
                proc2.on('close', (code) => {
                    if (code === 0) return resolve(output2);
                    return reject(new Error('Erro ao obter info da playlist'));
                });
            } else {
                return reject(err);
            }
        });
    });
}

function tryParsePlaylistOutput(output) {
    try {
        let cleanOutput = (output || '').trim();
        const jsonStart = cleanOutput.indexOf('{');
        if (jsonStart > 0) {
            cleanOutput = cleanOutput.substring(jsonStart);
        }
        return parseYtDlpPlaylistOutput(cleanOutput);
    } catch {
        return null;
    }
}

app.post('/download', async (req, res) => {
    console.log('POST /download:', req.body);
    const { url } = req.body || {};
    if (!url) {
        console.log('URL inválida:', url);
        return res.status(400).json({ error: 'URL inválida do YouTube.' });
    }

    // Validação rápida de URL (regex em vez de ytdl.validateURL que é lento)
    if (!url.match(/(?:youtube\.com|youtu\.be)/)) {
        return res.status(400).json({ error: 'URL deve ser do YouTube.' });
    }

    let erroRespondido = false;
    const timeout = setTimeout(() => {
        if (!erroRespondido && !res.headersSent) {
            erroRespondido = true;
            res.status(504).json({ error: 'Tempo excedido ao processar o download.' });
        }
    }, 300000); // 5 minutos para playlists

    try {
        // Verificar se é playlist
        const isPlaylist = url.includes('list=') || url.includes('playlist');
        console.log('É playlist?', isPlaylist);

        if (isPlaylist) {
            // Processar playlist
            try {
                const playlistInfo = await getPlaylistInfo(url);
                const entries = playlistInfo.entries || [];
                console.log(`Playlist com ${entries.length} vídeos`);

                if (entries.length === 0) {
                    if (!res.headersSent && !erroRespondido) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        return res.status(400).json({ error: 'Playlist vazia ou indisponível.' });
                    }
                    return;
                }

                // Limite de 50 músicas
                const limitedEntries = entries.slice(0, 50);

                res.setHeader('Content-Disposition', 'attachment; filename="playlist.zip"');
                res.setHeader('Content-Type', 'application/zip');

                const archive = archiver('zip', { zlib: { level: 5 } });
                let filesAdded = 0;
                let filesError = 0;

                archive.on('error', (err) => {
                    console.error('Erro no archive:', err);
                    if (!erroRespondido && !res.headersSent) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Erro ao criar ZIP' });
                    }
                });

                res.on('close', () => {
                    clearTimeout(timeout);
                    console.log(`Download do ZIP finalizado. ${filesAdded} arquivos, ${filesError} erros.`);
                });

                archive.pipe(res);

                // Processar músicas em paralelo (máx 3 simultâneas para não sobrecarregar)
                let idx = 0;
                let processando = 0;

                const procesarSeguinte = async () => {
                    if (idx >= limitedEntries.length) {
                        if (processando === 0) {
                            archive.finalize();
                        }
                        return;
                    }

                    const entry = limitedEntries[idx];
                    const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                    const entryIdx = idx;
                    idx++;
                    processando++;

                    try {
                        console.log(`[${entryIdx + 1}/${limitedEntries.length}] ${entry.title}`);
                        const audio = await downloadAudio(videoUrl, true);
                        archive.append(audio.stream, { name: audio.filename });
                        filesAdded++;
                    } catch (err) {
                        console.error(`[${entryIdx + 1}] Erro:`, err.message);
                        filesError++;
                    }

                    processando--;
                    procesarSeguinte();
                };

                // Iniciar 3 downloads em paralelo
                procesarSeguinte();
                procesarSeguinte();
                procesarSeguinte();
            } catch (err) {
                console.error('Erro ao processar playlist:', err.message);
                if (!res.headersSent && !erroRespondido) {
                    erroRespondido = true;
                    clearTimeout(timeout);
                    res.status(500).json({ error: 'Erro ao processar playlist: ' + err.message });
                }
            }
        } else {
            // Processar vídeo individual
            // Validação rápida via regex (sem fazer request)
            if (!url.match(/(?:youtube\.com\/watch|youtu\.be\/)/)) {
                if (!erroRespondido) {
                    erroRespondido = true;
                    clearTimeout(timeout);
                    return res.status(400).json({ error: 'URL inválida do YouTube.' });
                }
                return;
            }

            try {
                console.log('Iniciando download de:', url);
                const info = await ytdl.getInfo(url);
                const videoTitle = info.videoDetails.title;
                console.log('✓ Título original do YouTube:', videoTitle);

                const stream = ytdl.downloadFromInfo(info, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    }
                });

                const sanitizedTitle = videoTitle.replace(/[<>:"|?*\\/]/g, '').slice(0, 200);
                const filename = `${sanitizedTitle}.mp3`;

                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');

                const passThrough = new PassThrough();

                ffmpeg(stream)
                    .audioBitrate(128)
                    .format('mp3')
                    .on('start', (cmd) => {
                        console.log('Comando ffmpeg iniciado');
                    })
                    .on('error', (err) => {
                        console.error('Erro no ffmpeg:', err);
                        passThrough.destroy();
                        if (!erroRespondido && !res.headersSent) {
                            erroRespondido = true;
                            clearTimeout(timeout);
                            res.status(500).json({ error: 'Erro ao converter para MP3' });
                            res.end();
                        }
                    })
                    .on('end', () => {
                        console.log('Conversão ffmpeg finalizada.');
                        passThrough.end();
                        clearTimeout(timeout);
                    })
                    .pipe(passThrough, { end: true });

                passThrough.pipe(res, { end: true });

                res.on('close', () => {
                    clearTimeout(timeout);
                    try { passThrough.destroy(); } catch {}
                    try { stream.destroy(); } catch {}
                });

            } catch (infoErr) {
                const msg = infoErr && infoErr.message ? infoErr.message : String(infoErr);
                console.error('ytdl.getInfo falhou:', msg);

                if (!erroRespondido && !res.headersSent && (msg.includes('Could not extract functions') || msg.includes('Unable to extract') || msg.includes('This video is unavailable'))) {
                    console.log('⚠ ytdl.getInfo falhou, tentando fallback com yt-dlp...');
                    try {
                        // Primeiro, obter o título via yt-dlp antes de baixar
                        let videoTitleFromYtdlp = 'audio_baixado';
                        
                        try {
                            let infoOutput = '';
                            const infoProc = spawn('yt-dlp', [url, '--dump-json', '--no-playlist'], { stdio: ['ignore', 'pipe', 'pipe'] });
                            infoProc.stdout.on('data', (data) => { infoOutput += data.toString(); });
                            
                            await new Promise((resolve) => {
                                infoProc.on('close', (code) => {
                                    if (code === 0) {
                                        try {
                                            const jsonStart = infoOutput.indexOf('{');
                                            if (jsonStart !== -1) {
                                                const infoJson = JSON.parse(infoOutput.substring(jsonStart));
                                                videoTitleFromYtdlp = infoJson.title || 'audio_baixado';
                                                console.log('✓ Título do yt-dlp:', videoTitleFromYtdlp);
                                            }
                                        } catch (e) {
                                            console.log('Não conseguiu parse do título, usando padrão');
                                        }
                                    }
                                    resolve();
                                });
                            });
                        } catch (e) {
                            console.log('Erro ao obter título do yt-dlp:', e.message);
                        }
                        
                        const sanitizedTitle = videoTitleFromYtdlp.replace(/[<>:"|?*\\/]/g, '').slice(0, 200);
                        const args = ['-o', '-', '--no-playlist', '--extract-audio', '--audio-format', 'mp3', url];
                        let proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

                        proc.on('error', (spawnErr) => {
                            console.error('Erro ao iniciar yt-dlp:', spawnErr);
                            if (spawnErr && spawnErr.code === 'ENOENT') {
                                console.log('yt-dlp não encontrado, tentando via npx...');
                                proc = spawn('npx', ['yt-dlp', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

                                proc.on('error', (spawnErr2) => {
                                    console.error('Erro ao iniciar npx yt-dlp:', spawnErr2);
                                    if (!erroRespondido && !res.headersSent) {
                                        erroRespondido = true;
                                        clearTimeout(timeout);
                                        res.status(500).json({ error: 'Erro ao baixar' });
                                        res.end();
                                    }
                                });
                            } else {
                                if (!erroRespondido && !res.headersSent) {
                                    erroRespondido = true;
                                    clearTimeout(timeout);
                                    res.status(500).json({ error: 'Erro ao baixar' });
                                    res.end();
                                }
                            }
                        });

                        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp3"`);
                        res.setHeader('Content-Type', 'audio/mpeg');

                        proc.stdout.pipe(res);
                        proc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trim()));

                        proc.on('close', (code) => {
                            clearTimeout(timeout);
                            console.log('✓ yt-dlp finalizado com código:', code);
                        });

                        res.on('close', () => { 
                            clearTimeout(timeout);
                            try { proc.kill(); } catch {} 
                        });
                    } catch (fallbackErr) {
                        console.error('Erro no fallback:', fallbackErr);
                        if (!erroRespondido && !res.headersSent) {
                            erroRespondido = true;
                            clearTimeout(timeout);
                            res.status(500).json({ error: 'Erro ao processar' });
                            res.end();
                        }
                    }
                } else {
                    if (!erroRespondido && !res.headersSent) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Erro ao baixar: ' + msg });
                        res.end();
                    }
                }
            }
        }
    } catch (err) {
        console.error('Erro geral:', err);
        if (!erroRespondido && !res.headersSent) {
            erroRespondido = true;
            clearTimeout(timeout);
            res.status(500).json({ error: 'Erro ao processar: ' + err.message });
            res.end();
        }
    }
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
