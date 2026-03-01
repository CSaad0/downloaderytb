# Use Node.js 18 como base
FROM node:18-bullseye

# Define diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install --production && \
    npm install ffmpeg-static

# Instalar ffmpeg e yt-dlp (necessário para fallback)
RUN apt-get update && \
    apt-get install -y ffmpeg python3-pip && \
    pip3 install --no-cache-dir --upgrade yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Copiar arquivo do servidor
COPY server.js .
COPY index.html .
COPY favicon.svg .

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "server.js"]
