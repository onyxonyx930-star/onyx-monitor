# Onyx Monitor - Deploy Guide

## Frontend (Vercel) ✅
**URL:** https://onyx-monitor.vercel.app

## Backend (Render/Railway)
O backend precisa ser hospedado separadamente porque usa SQLite e SNMP (módulos nativos).

### Opção 1: Render (Grátis)
1. Acesse https://render.com e crie uma conta
2. Clique em "New" → "Web Service"
3. Conecte seu repositório GitHub
4. Configure:
   - **Name:** onyx-monitor-api
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node --import tsx server/index.ts`
   - **Port:** 3001

5. Adicione as variáveis de ambiente:
   ```
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=sua-chave-secreta-aqui
   DB_PATH=./data/onyx-monitor.db
   SNMP_DEFAULT_COMMUNITY=public
   SNMP_DEFAULT_PORT=161
   SNMP_TIMEOUT=5000
   ```

6. Clique em "Create Web Service"

### Opção 2: Railway (Grátis com limite)
1. Acesse https://railway.app e crie uma conta
2. Instale o CLI: `npm install -g @railway/cli`
3. Faça login: `railway login`
4. No diretório do projeto: `railway init`
5. Faça deploy: `railway up`

## Configuração do Frontend
Apois deploy o backend, configure a variável de ambiente no Vercel:

1. Acesse https://vercel.com/dashboard
2. Selecione o projeto "onyx-monitor"
3. Vá em Settings → Environment Variables
4. Adicione:
   - **Name:** `VITE_API_URL`
   - **Value:** `https://seu-backend.onrender.com/api`
5. Clique em "Save"
6. Faça redeploy: `vercel --prod`

## Credenciais Padrão
- **Email:** admin@onyx.com
- **Senha:** admin123

## Verificação
1. Acesse o frontend: https://onyx-monitor.vercel.app
2. Faça login com as credenciais acima
3. O sistema deve mostrar o dashboard (vazio no início)
4. Cadastre equipamentos e configure SNMP
