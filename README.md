# 🎵 YouTube para MP3 - Downloader

Aplicação Node.js para baixar músicas do YouTube em MP3 e playlists em ZIP.

## 🚀 Instalação

```bash
npm install
```

## 📍 Modo Normal (Teste)

Para rodar o servidor normalmente:

```bash
npm start
```

Acesse: http://localhost:3000

## ⏰ Modo 24 Horas (Produção)

Para rodar o servidor **24 horas continuamente**:

```bash
npm run start:24h
```

### 📋 Comandos PM2

- **Ver status**: `npm run status`
- **Ver logs**: `npm run logs`
- **Pausar**: `npm run stop`
- **Reiniciar**: `npm run restart`

## 📥 Como Usar

### Vídeo Individual
- Cole o link do YouTube
- Clique em "Baixar MP3"
- Arquivo com nome original será baixado

### Playlist
- Cole a URL da playlist (com `list=`)
- Clique em "Baixar MP3"
- Baixa até 50 músicas em `playlist.zip`

## 📦 Características

- ✅ Suporte a vídeos e playlists
- ✅ Conversão em tempo real para MP3 (128kbps)
- ✅ Fallback automático com yt-dlp
- ✅ Funciona 24/7 com PM2
- ✅ Interface bonita e responsiva
- ✅ Nomes originais dos arquivos

## ⚙️ PM2 - Configuração 24h

O PM2 está pronto para:
- ✅ Reiniciar se o servidor cair
- ✅ Limitar memória: 500MB
- ✅ Salvar logs automaticamente
- ✅ Rodar continuamente sem parar

## 🔧 Troubleshooting

**Porta 3000 em uso?**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Ver erros?**
```bash
npm run logs
```

## 📝 Notas

- Respeite direitos autorais
- Máx. 50 músicas por playlist
- Timeout: 5min playlists, 1min vídeos
- Requer ffmpeg e yt-dlp instalados

Publicar no GitHub

1. Inicialize o repositório localmente (se ainda não):

```bash
git init
git add .
git commit -m "Initial commit"
```

2. Crie um repositório no GitHub (via site) e adicione o remote:

```bash
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git branch -M main
git push -u origin main
```

3. (Opcional) Habilitar GitHub Pages nas configurações do repositório para publicar a interface estática.

Observações
- O servidor usa `ytdl-core` + `ffmpeg`. Se `ytdl-core` falhar ao extrair, há fallback que usa `yt-dlp` (ou `npx yt-dlp`).

- Não hospede e nem faça downloads de conteúdos protegidos por direitos autorais sem permissão esse projeto foi criado com finalidade de estudos da programação.

