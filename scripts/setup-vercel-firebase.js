#!/usr/bin/env node

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const SERVICE_ACCOUNT_PATH = process.argv[2];
const VERCEL_PROJECT = process.argv[3] || 'onyx-monitor';

if (!SERVICE_ACCOUNT_PATH) {
  console.error('Uso: node scripts/setup-vercel-firebase.js <service-account.json> [vercel-project-name]');
  process.exit(1);
}

try {
  const sa = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  
  const projectId = sa.project_id;
  const clientEmail = sa.client_email;
  const privateKey = sa.private_key;
  
  console.log(`Configurando Firebase no Vercel para projeto: ${projectId}\n`);
  
  const envVars = [
    { name: 'FIREBASE_PROJECT_ID', value: projectId },
    { name: 'FIREBASE_CLIENT_EMAIL', value: clientEmail },
    { name: 'FIREBASE_PRIVATE_KEY', value: privateKey },
  ];

  for (const env of envVars) {
    try {
      const cmd = `vercel env add ${env.name} production --yes --${VERCEL_PROJECT}`;
      execSync(cmd, { input: env.value, stdio: 'pipe' });
      console.log(`✅ ${env.name} configurado`);
    } catch (e) {
      console.error(`❌ Erro ao configurar ${env.name}:`, e.message);
    }
  }

  console.log('\n✅ Variáveis do Firebase Admin configuradas no Vercel!');
  console.log('\nPróximo passo: Configure as variáveis do Firebase Client (frontend):');
  console.log('  - VITE_FIREBASE_API_KEY');
  console.log('  - VITE_FIREBASE_AUTH_DOMAIN');
  console.log('  - VITE_FIREBASE_PROJECT_ID');
  
} catch (e) {
  console.error('Erro ao processar arquivo:', e.message);
  process.exit(1);
}