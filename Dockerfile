# Use Node.js 18 como base
FROM node:18-alpine

# Define diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install --production && \
    npm install ffmpeg-static

# Instalar yt-dlp (necessário para fallback)
RUN apk add --no-cache python3 py3-pip && \
    pip3 install yt-dlp

# Copiar arquivo do servidor
COPY server.js .
COPY index.html .
COPY favicon.svg .

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "server.js"]
