# 🔧 Deploy via SSH no TrueNAS - Passo a Passo Completo

## 📋 Pré-requisitos

- TrueNAS instalado e rodando
- IP do TrueNAS (ex: 192.168.1.100)
- Usuário e senha root/admin do TrueNAS
- Git instalado no TrueNAS (já vem por padrão)

---

## PASSO 1: Conectar via SSH

### No Windows (PowerShell ou CMD):

```powershell
# Conectar ao TrueNAS (substitua pelo seu IP)
ssh root@192.168.1.100

# Vai pedir senha - digite a senha do TrueNAS
# Exemplo resposta:
# Password: ••••••••
```

Se funcionou, você verá algo assim:
```
Welcome to TrueNAS CORE
root@truenas[~]#
```

✅ **Você está dentro do TrueNAS!**

---

## PASSO 2: Criar Diretório para o Projeto

```bash
# Ver discos disponíveis
ls /mnt/

# Escolha um pool (ex: pool, tank, data)
# Vou usar "pool" nos exemplos abaixo

# Criar diretório para aplicações
mkdir -p /mnt/pool/apps
cd /mnt/pool/apps

# Confirmar que está no diretório certo
pwd
# Deve mostrar: /mnt/pool/apps
```

---

## PASSO 3: Clonar o Repositório

```bash
# Clonar o projeto do GitHub
git clone https://github.com/CSaad0/downloaderytb.git

# Entrar na pasta
cd downloaderytb

# Verificar se tudo foi copiado
ls -la
# Deve mostrar: Dockerfile, docker-compose.yml, server.js, index.html, etc
```

---

## PASSO 4: Instalar Docker (se não tiver)

### Verificar se Docker já está instalado:

```bash
docker --version
```

Se retornar uma versão, Docker já está pronto! ✓

**Se não tiver Docker:**

```bash
# Atualizar pacotes
pkg update

# Instalar Docker
pkg install -y docker docker-compose

# Iniciar serviço Docker
service docker start

# (Opcional) Fazer Docker iniciar automaticamente
sysrc docker_enable="YES"
```

---

## PASSO 5: Build da Imagem Docker

Ainda dentro de `/mnt/pool/apps/downloaderytb/`:

```bash
# Fazer o build da imagem
docker build -t youtube-downloader:latest .

# Isso vai levar alguns minutos...
# Você verá muitas linhas de progresso
# Espere até ver: "Successfully tagged youtube-downloader:latest"
```

✅ **Imagem criada!**

---

## PASSO 6: Rodar o Container

### Opção A: docker-compose (Recomendado)

```bash
# Ainda em /mnt/pool/apps/downloaderytb/

# Criar a pasta para downloads (opcional)
mkdir -p downloads

# Rodar o container em background
docker-compose up -d

# Verificar se subiu
docker-compose ps

# Deve mostrar:
# NAME                    STATUS
# youtube-downloader      Up 2 seconds
```

### Opção B: Rodar manualmente com Docker

```bash
docker run -d \
  --name youtube-downloader \
  --restart always \
  -p 3000:3000 \
  -v /mnt/pool/apps/downloaderytb/downloads:/app/downloads \
  youtube-downloader:latest
```

---

## PASSO 7: Verificar se Está Funcionando

### No TrueNAS (via SSH):

```bash
# Ver logs em tempo real
docker logs -f youtube-downloader

# Você deve ver:
# Servidor rodando na porta 3000

# Pressione Ctrl+C para sair dos logs
```

### Do seu PC Windows:

```powershell
# Abrir navegador e acessar:
# http://192.168.1.100:3000

# Substitua 192.168.1.100 pelo IP real do seu TrueNAS
```

Se a página carregar, está funcionando! 🎉

---

## PASSO 8: Parar/Reiniciar o Container

```bash
# Parar o container
docker-compose down
# ou
docker stop youtube-downloader

# Reiniciar o container
docker-compose up -d
# ou
docker start youtube-downloader

# Remover container
docker-compose down -v
# ou
docker rm youtube-downloader
```

---

## PASSO 9: Fazer Rodar em Caso de Reboot do TrueNAS

O `docker-compose.yml` tem `restart: always`, então automaticamente vai reiniciar! ✅

Se quiser verificar status após reboot:

```bash
# SSH no TrueNAS novamente
ssh root@192.168.1.100

# Ir para o diretório
cd /mnt/pool/apps/downloaderytb

# Verificar status
docker-compose ps

# Se parou, reiniciar
docker-compose up -d
```

---

## 🐛 TROUBLESHOOTING

### Container não inicia?

```bash
# Ver logs de erro
docker logs youtube-downloader

# Se houver erro, tentar iniciar novamente
docker-compose restart
```

### Porta 3000 já está em uso?

Editar o `docker-compose.yml`:

```bash
# Editar arquivo
nano docker-compose.yml

# Mudar esta linha:
# De: "3000:3000"
# Para: "8080:3000"  (vai usar porta 8080)

# Salvar: Ctrl+X, depois Y, depois Enter

# Reiniciar
docker-compose down
docker-compose up -d

# Acessar em: http://192.168.1.100:8080
```

### FFmpeg não encontrado?

```bash
# Entrar no container
docker exec -it youtube-downloader sh

# Dentro do container
apk update && apk add ffmpeg

# Sair
exit

# Reiniciar container
docker-compose restart
```

### Sem espaço em disco?

```bash
# Ver espaço
df -h

# Limpar imagens não usadas
docker image prune -f

# Limpar containers parados
docker container prune -f
```

---

## ✅ Checklist Final

- [ ] SSH conectado ao TrueNAS
- [ ] Repositório clonado em `/mnt/pool/apps/downloaderytb/`
- [ ] Docker instalado (`docker --version`)
- [ ] Imagem buildada (`docker build` completou)
- [ ] Container rodando (`docker-compose ps` mostra "Up")
- [ ] Acessível via navegador (`http://192.168.1.100:3000`)
- [ ] Auto-restart configurado (já incluído no compose)

---

## 📝 Resumo dos Comandos Principais

```bash
# Conectar
ssh root@192.168.1.100

# Navegar
cd /mnt/pool/apps/downloaderytb

# Build
docker build -t youtube-downloader:latest .

# Rodar
docker-compose up -d

# Ver status
docker-compose ps

# Ver logs
docker logs -f youtube-downloader

# Parar
docker-compose down

# Reiniciar
docker-compose restart
```

---

## 🎯 Próximas Melhorias

1. **Backup automático:**
   ```bash
   # Adicionar a cron para fazer backup dos downloads
   crontab -e
   ```

2. **Monitoramento:**
   ```bash
   # Ver consumo de CPU/memória
   docker stats youtube-downloader
   ```

3. **Atualizar código:**
   ```bash
   cd /mnt/pool/apps/downloaderytb
   git pull origin main
   docker-compose restart
   ```

---

**Está pronto! Seu site roda 24hrs no TrueNAS! 🚀**
