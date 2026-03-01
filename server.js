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
const { PassThrough, Transform } = require('stream');
const crypto = require('crypto');
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

function createHeaderGate(res, headers, onFirstChunk) {
    let headersSent = false;

    return new Transform({
        transform(chunk, encoding, callback) {
            if (!headersSent) {
                Object.entries(headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
                headersSent = true;
                if (onFirstChunk) onFirstChunk();
            }

            this.push(chunk);
            callback();
        }
    });
}

function createTempFilePath(prefix, ext) {
    const suffix = crypto.randomBytes(6).toString('hex');
    return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${suffix}.${ext}`);
}

async function safeUnlink(filePath) {
    try {
        await fs.promises.unlink(filePath);
    } catch {}
}

async function getFileSize(filePath) {
    try {
        const stat = await fs.promises.stat(filePath);
        return stat.size;
    } catch {
        return 0;
    }
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
                proc2.on('error', (err2) => {
                    return reject(err2);
                });
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

    // Verificar se é playlist
    const isPlaylist = url.includes('list=') || url.includes('playlist');
    console.log('É playlist?', isPlaylist);

    let erroRespondido = false;
    let clienteDesconectado = false;
    const timeoutMs = isPlaylist ? 300000 : 180000;
    const timeout = setTimeout(() => {
        if (clienteDesconectado) {
            return;
        }

        if (!erroRespondido && !res.headersSent) {
            erroRespondido = true;
            res.status(504).json({ error: 'Tempo excedido ao processar o download.' });
        }
    }, timeoutMs);

    res.on('close', () => {
        clienteDesconectado = true;
        clearTimeout(timeout);
    });

    try {
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
                        if (!clienteDesconectado) {
                            res.status(500).json({ error: 'Erro ao criar ZIP' });
                        }
                    }
                });

                res.on('close', () => {
                    clienteDesconectado = true;
                    clearTimeout(timeout);
                    try { archive.abort(); } catch {}
                    console.log(`Download do ZIP finalizado. ${filesAdded} arquivos, ${filesError} erros.`);
                });

                archive.pipe(res);

                // Processar músicas em paralelo (máx 3 simultâneas para não sobrecarregar)
                let idx = 0;
                let processando = 0;

                const procesarSeguinte = async () => {
                    if (clienteDesconectado || erroRespondido) {
                        return;
                    }

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
                    if (!clienteDesconectado && !erroRespondido) {
                        procesarSeguinte();
                    }
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

                const outputPath = createTempFilePath('yt-audio', 'mp3');
                let downloadConcluido = false;
                let processamentoFinalizado = false;

                const ffmpegCommand = ffmpeg(stream)
                    .audioBitrate(128)
                    .format('mp3')
                    .on('start', () => {
                        console.log('Comando ffmpeg iniciado');
                    })
                    .on('error', async (err) => {
                        console.error('Erro no ffmpeg:', err);
                        if (!erroRespondido && !res.headersSent) {
                            erroRespondido = true;
                            clearTimeout(timeout);
                            res.status(500).json({ error: 'Erro ao converter para MP3' });
                            res.end();
                        }
                        await safeUnlink(outputPath);
                    })
                    .on('end', () => {
                        console.log('Conversão ffmpeg finalizada.');
                        clearTimeout(timeout);
                    });

                stream.on('error', async (err) => {
                    console.error('Erro no stream do YouTube:', err);
                    if (!erroRespondido && !res.headersSent) {
                        erroRespondido = true;
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Erro ao baixar o áudio' });
                        res.end();
                    }
                    try { ffmpegCommand.kill('SIGKILL'); } catch {}
                    await safeUnlink(outputPath);
                });

                ffmpegCommand.save(outputPath);

                ffmpegCommand.on('end', async () => {
                    if (processamentoFinalizado || clienteDesconectado) {
                        await safeUnlink(outputPath);
                        return;
                    }

                    const fileSize = await getFileSize(outputPath);
                    if (fileSize <= 0) {
                        processamentoFinalizado = true;
                        await safeUnlink(outputPath);
                        if (!erroRespondido && !res.headersSent && !clienteDesconectado) {
                            erroRespondido = true;
                            res.status(500).json({ error: 'Arquivo MP3 vazio após conversão. Tente novamente.' });
                        }
                        return;
                    }

                    res.download(outputPath, filename, async (err) => {
                        processamentoFinalizado = true;
                        if (err && !res.headersSent && !erroRespondido) {
                            erroRespondido = true;
                            res.status(500).json({ error: 'Erro ao enviar o arquivo' });
                            res.end();
                        }
                        if (!err) {
                            downloadConcluido = true;
                        }
                        await safeUnlink(outputPath);
                    });
                });

                res.on('close', async () => {
                    clearTimeout(timeout);
                    if (downloadConcluido || res.writableEnded) {
                        return;
                    }
                    try { ffmpegCommand.kill('SIGKILL'); } catch {}
                    try { stream.destroy(); } catch {}
                    await safeUnlink(outputPath);
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
                        const tempBase = createTempFilePath('yt-fallback', 'output').replace(/\.output$/, '');
                        const outputTemplate = `${tempBase}.%(ext)s`;
                        const outputPath = `${tempBase}.mp3`;
                        const args = ['-o', outputTemplate, '--no-playlist', '--extract-audio', '--audio-format', 'mp3', url];
                        let proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
                        let dataSent = false;
                        let handled = false;

                        const sendFallbackError = () => {
                            if (!erroRespondido && !res.headersSent && !clienteDesconectado) {
                                erroRespondido = true;
                                clearTimeout(timeout);
                                res.status(500).json({ error: 'Erro ao baixar' });
                                res.end();
                            }
                        };

                        const attachProcessHandlers = (targetProc, isNpx = false) => {
                            targetProc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trim()));

                            targetProc.on('error', (spawnErr) => {
                                console.error(isNpx ? 'Erro ao iniciar npx yt-dlp:' : 'Erro ao iniciar yt-dlp:', spawnErr);

                                if (!isNpx && spawnErr && spawnErr.code === 'ENOENT' && !handled) {
                                    console.log('yt-dlp não encontrado, tentando via npx...');
                                    proc = spawn('npx', ['yt-dlp', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
                                    attachProcessHandlers(proc, true);
                                    return;
                                }

                                if (!handled) {
                                    handled = true;
                                    sendFallbackError();
                                }
                            });

                            targetProc.on('close', (code) => {
                                if (handled) return;

                                clearTimeout(timeout);
                                console.log('✓ yt-dlp finalizado com código:', code);
                                if (code !== 0) {
                                    handled = true;
                                    sendFallbackError();
                                    return;
                                }

                                if (!fs.existsSync(outputPath)) {
                                    handled = true;
                                    if (!erroRespondido && !res.headersSent && !clienteDesconectado) {
                                        erroRespondido = true;
                                        res.status(500).json({ error: 'Arquivo de saída não encontrado' });
                                        res.end();
                                    }
                                    return;
                                }

                                handled = true;
                                res.download(outputPath, `${sanitizedTitle}.mp3`, async (err) => {
                                    if (err && !res.headersSent && !erroRespondido) {
                                        erroRespondido = true;
                                        res.status(500).json({ error: 'Erro ao enviar o arquivo' });
                                        res.end();
                                    }
                                    dataSent = true;
                                    await safeUnlink(outputPath);
                                });
                            });
                        };

                        attachProcessHandlers(proc, false);

                        res.on('close', () => {
                            clearTimeout(timeout);
                            try { proc.kill(); } catch {}
                            if (!dataSent) {
                                safeUnlink(outputPath);
                            }
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
