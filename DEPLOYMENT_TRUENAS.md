# 🐳 Deployment no TrueNAS com Docker

## Opção 1: Docker + TrueNAS Apps (Recomendado)

### Passo 1: Preparar o projeto
1. Copie todos os arquivos para um repositório Git (já feito ✓)
2. O `Dockerfile` e `docker-compose.yml` já estão no projeto

### Passo 2: No TrueNAS - Ativar Docker

1. **Acesse a interface do TrueNAS:**
   - URL: `https://seu_truenas_ip/ui`
   - Login com suas credenciais

2. **Ativar Docker:**
   - Vá para: `Apps` → `Manage Catalogs`
   - Certifique-se de ter o catálogo oficial ativado

3. **Criar aplicação customizada:**
   - Clique em `Create Application`
   - Escolha `Custom App`
   - Configure:
     - **Name:** youtube-downloader
     - **Image Repository:** (sua imagem Docker ou build local)
     - **Port:** 3000
     - **Volumes:** `/app/downloads` → mapeie para um caminho no NAS

### Passo 3: Build e Deploy

#### Opção A: Build direto no TrueNAS (via SSH)

```bash
# SSH no TrueNAS
ssh seu_usuario@seu_truenas_ip

# Clone o repositório
cd /mnt/pool/apps
git clone https://github.com/CSaad0/downloaderytb.git
cd downloaderytb

# Build da imagem Docker
docker build -t youtube-downloader:latest .

# Rodar com docker-compose
docker-compose up -d
```

#### Opção B: Push da imagem para Docker Hub (Melhor)

```bash
# No seu PC Windows:

# 1. Fazer login no Docker Hub
docker login

# 2. Build da imagem
docker build -t seu_usuario/youtube-downloader:latest .

# 3. Push para Docker Hub
docker push seu_usuario/youtube-downloader:latest

# 4. No TrueNAS, usar a imagem:
docker pull seu_usuario/youtube-downloader:latest
docker-compose up -d
```

---

## Opção 2: Rodando em uma Jail no TrueNAS

Se o TrueNAS não tiver Docker ativado:

### Via SSH no TrueNAS:

```bash
# Criar jail com Node.js
iocage create -r 13.1-RELEASE -n youtube-downloader

# Acessar a jail
iocage console youtube-downloader

# Dentro da jail:
pkg install node npm git ffmpeg python39 py39-pip

# Clonar repositório
cd /home
git clone https://github.com/CSaad0/downloaderytb.git
cd downloaderytb

# Instalar dependências
npm install

# Instalar yt-dlp
pip3.9 install yt-dlp

# Iniciar servidor em background
nohup npm start > /var/log/youtube-downloader.log 2>&1 &

# Ou com PM2
npm install pm2 -g
pm2 start server.js --name youtube-downloader
pm2 startup
pm2 save
```

---

## Opção 3: Usar Linux VM no TrueNAS

1. Criar uma máquina virtual Linux (Ubuntu 22.04)
2. Seguir o mesmo processo de instalação
3. Usar PM2 para auto-restart

---

## Verificar se está funcionando

```bash
# Testar acesso
curl http://seu_truenas_ip:3000

# Ver logs
docker logs youtube-downloader  # (se Docker)
pm2 logs youtube-downloader      # (se Jail/VM)
```

---

## 📊 Comparação das Opções

| Opção | Facilidade | Performance | Recursos |
|-------|-----------|-------------|----------|
| **Docker** | ⭐⭐⭐⭐⭐ | Excelente | Baixo |
| **Jail** | ⭐⭐⭐ | Muito Bom | Médio |
| **VM Linux** | ⭐⭐ | Bom | Alto |

---

## ✅ Próximos Passos

1. **Instale Docker no seu PC** (se não tiver):
   ```bash
   # Windows: Baixar Docker Desktop
   # https://www.docker.com/products/docker-desktop
   ```

2. **Teste localmente:**
   ```bash
   docker build -t youtube-downloader:latest .
   docker-compose up
   ```

3. **Push para Docker Hub** (opcional mas recomendado)

4. **Configure no TrueNAS**

---

## 🔧 Troubleshooting

### "Container não inicia"
```bash
docker logs youtube-downloader
```

### "Porta 3000 em uso"
```bash
# Mudar porta no docker-compose.yml:
ports:
  - "8080:3000"  # Acessa via 8080
```

### "ffmpeg não encontrado"
```bash
# Já incluído no Dockerfile, mas se precisar instalar manualmente:
docker exec youtube-downloader apk add ffmpeg
```

---

## 📱 Acessar do celular/outro PC

Uma vez rodando no TrueNAS:
```
http://192.168.1.X:3000
```
(Substitua `192.168.1.X` pelo IP do seu TrueNAS)

---

**Recomendação:** Use **Docker + TrueNAS Apps** - é a forma mais simples e elegante! 🚀
