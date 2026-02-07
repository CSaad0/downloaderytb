# SITE PARA BAIXAR MUSICAS

Descrição
- Projeto simples em Node.js que permite converter o áudio de vídeos do YouTube para MP3 através de uma interface web leve. A aplicação aceita um link do YouTube, processa o stream do áudio e disponibiliza o download em MP3.

Principais características
- Interface limpa e responsiva para colar o link do YouTube e iniciar o download.
- Conversão em tempo real usando `ytdl-core` e `ffmpeg`.
- Fallback automático para `yt-dlp` (ou `npx yt-dlp`) quando o `ytdl-core` não consegue extrair os dados do player.
- Tratamento de erros, timeouts e desconexões do cliente.

Como usar localmente

1. Instale dependências:

```bash
npm install
```

2. Inicie o servidor:

```bash
node server.js
```

3. Abra no navegador: `http://localhost:3000` e cole o link do YouTube.

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
- Não hospede conteúdos protegidos por direitos autorais sem permissão.

