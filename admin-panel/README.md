# 🖥️ Painel Administrativo — SaaS Chatbot (`admin-panel`)

Aplicação web administrativa construída em **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4** e **shadcn/ui** para operação multitenant da plataforma `saas-chatbot`.

## Principais Módulos

- **Dashboard Global (`/dashboard`)**: Visão consolidada de empresas ativas, volume de atendimentos, saúde dos serviços e curadoria de conversas recentes com abertura direta no chat do cliente.
- **Gestão de Empresas (`/tenants` e `/tenants/[id]`)**:
  - **Clientes & Dossiês**: Histórico de conversas em tempo real, Memória do Cliente e documentos individuais com controle de liberação no atendimento.
  - **Catálogo & Estoque**: Cadastro manual, upload de fotos no Supabase Storage, importação de planilhas `.xlsx`/`.csv` preservando imagens existentes e upload de fotos em lote por SKU.
  - **Base de Conhecimento**: Documentos institucionais com simulador interativo de resposta para WhatsApp e destaque visual dos trechos consultados.
  - **Equipe, Agentes de IA, WhatsApp (QR Code + Webhook 1-Clique), Agenda Google Calendar e Desempenho**.

## Configuração Rápida

1. Copie o arquivo de exemplo de variáveis de ambiente:
   ```bash
   cp .env.example .env.local
   ```
2. Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `BACKEND_API_URL` e as credenciais da `EVOLUTION_API`.
3. Instale as dependências e inicie em desenvolvimento (porta `3001` por padrão, evitando conflito com o backend na porta `3000`):
   ```bash
   npm install
   npm run dev
   ```

## Scripts Disponíveis

- `npm run dev` — Inicia o servidor de desenvolvimento em `http://localhost:3001`
- `npm run build` — Gera o build otimizado de produção
- `npm start` — Inicia o servidor de produção na porta `3001`
- `npx tsc --noEmit` — Valida toda a tipagem TypeScript sem erros

Para a documentação completa da arquitetura, banco de dados e motor de IA, consulte o [`README.md` principal na raiz do repositório](../README.md).
