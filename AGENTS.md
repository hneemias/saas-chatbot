# Diretrizes Obrigatórias do Projeto (UI, Copywriting & Arquitetura)

## 1. Linguagem de Produto nas Telas (Zero Jargão Técnico ou Tom de Migração)
- Todo texto visível na interface (`admin-panel` e mensagens ao usuário final) deve ser escrito **como um produto SaaS comercial pronto**, pensado para advogados, gestores e administradores.
- **PROIBIDO na UI:**
  - Escrever textos em tom de *changelog*, migração ou explicação de bastidores para quem "usava uma versão anterior" (ex.: *"Agora não precisa mais de..."*, *"Substituindo o n8n"*, *"Novo motor ativo"*).
  - Expor jargões de engenharia, nomes de tabelas/tags internas ou detalhes de infraestrutura em títulos, subtítulos, badges e botões (ex.: `RAG`, `multi-turn`, `episódico`, `embeddings`, `vetorizar`, `chunks`, `1536d`, `pgvector`, `HNSW`, `<session_context>`, `JWT`, `RLS`, `Node.js`, nomes de tools internas como `check_calendar`).
  - Usar nomes fixos de agentes (`Karol`, `Atlas`) em rótulos genéricos da plataforma quando o nome é configurável por escritório (prefira *"Assistente de Clientes"*, *"Copiloto da Equipe"* ou o valor dinâmico configurado no tenant).
- **OBRIGATÓRIO na UI:**
  - Títulos curtos, inteligentes e autoexplicativos (ex.: *Agentes de Inteligência Artificial*, *Base de Conhecimento*, *Memória do Cliente*, *Dossiê*, *Webhook de Mensagens*).
  - Subtítulos enxutos (1 linha curta) focados apenas no **benefício/ação do usuário**, omitindo o óbvio quando o título já for claro.
  - Botões com verbos diretos (*Salvar Alterações*, *Novo Documento*, *Salvar no Dossiê*, *Testar Consulta*).

## 2. Padrões Técnicos do Repositório
- Nos prompts de IA (`tenant_configs`), usar variáveis de identidade (`{{ agent_name }}`, `{{ external_agent_name }}`, `{{ internal_agent_name }}`, `{{ tenant_name }}`) em vez de nomes fixos.
- Nunca gravar arquivos `.env` / `.env.local` com UTF-8 BOM no Windows.
