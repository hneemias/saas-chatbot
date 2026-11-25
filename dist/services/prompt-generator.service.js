import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
export class PromptGeneratorService {
    genAI;
    constructor() {
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
    async generatePrompt(options) {
        const { tenantId, agentType, briefing, useKnowledgeBase = true, currentPrompt } = options;
        // 1. Busca dados da empresa
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name, slug')
            .eq('id', tenantId)
            .single();
        const tenantName = tenant?.name || 'Empresa';
        // 2. Busca configurações de IA da empresa (para saber nomes configurados e catálogo de produtos)
        const { data: config } = await supabase
            .from('tenant_configs')
            .select('external_agent_name, internal_agent_name, classifier_rules')
            .eq('tenant_id', tenantId)
            .maybeSingle();
        const enableCatalog = Boolean(config?.classifier_rules?.enable_product_catalog);
        const externalName = config?.external_agent_name || 'Assistente';
        const internalName = config?.internal_agent_name || 'Copiloto';
        // 3. Se solicitado, busca documentos do RAG da empresa
        let knowledgeExcerpts = '';
        if (useKnowledgeBase) {
            const { data: docs } = await supabase
                .from('knowledge_base')
                .select('doc_title, content, metadata')
                .eq('tenant_id', tenantId)
                .is('client_id', null)
                .limit(10);
            if (docs && docs.length > 0) {
                knowledgeExcerpts = docs
                    .map((d) => `--- [Documento: ${d.doc_title || 'Sem título'}] ---\n${d.content?.slice(0, 800) || ''}`)
                    .join('\n\n');
            }
        }
        // 4. Monta as instruções para a IA geradora
        const isExternal = agentType === 'external';
        const systemInstruction = `Você é um Engenheiro Sênior de Prompts especializado em agentes autônomos de IA para WhatsApp corporativo.
Sua missão é criar ou aperfeiçoar o System Prompt de produção para o agente de uma empresa cliente.

DIRETRIZES DE ARQUITETURA DA PLATAFORMA (OBRIGATÓRIO SEGUIR À RISCA):
1. VARIÁVEIS DE IDENTIDADE (NUNCA substitua por nomes fixos, use exatamente as variáveis entre chaves duplas):
   - {{ agent_name }}: Nome do agente ativo
   - {{ tenant_name }}: Nome da empresa
   - {{ client_name }}: Nome do cliente identificado (quando aplicável)
   - {{ external_agent_name }}: Nome da assistente externa
   - {{ internal_agent_name }}: Nome do copiloto interno

2. FORMATAÇÃO DO WHATSAPP:
   - Use APENAS UM asterisco para negrito (*negrito*). NUNCA use asteriscos duplos (**negrito**).
   - NUNCA use aspas duplas dobradas (""texto"").
   - Mensagens devem ser leves, acolhedoras, sem blocos gigantescos de texto ininterrupto.

3. FERRAMENTAS DO SISTEMA (Explique quando e como o agente deve acioná-las):
${isExternal
            ? `   - \`save_client_name\`: Salvar imediatamente o nome do cliente assim que ele informar na conversa.
   - \`search_knowledge_base\`: Consultar regras da empresa, serviços, valores, garantias ou dossiês do cliente antes de responder dúvidas específicas.
   - \`convert_lead\`: Encaminhar o atendimento e classificar o lead assim que a triagem estiver concluída.
   - \`notify_team\`: Enviar alerta para o grupo da equipe interna quando houver uma demanda que precise de atenção humana imediata.
   - \`human_escalation\`: Transferir para atendimento humano quando o cliente pedir expressamente ou for caso urgente/complexo.
${enableCatalog
                ? `   - CATÁLOGO DE PRODUTOS ATIVO: O agente dispõe de \`search_products\` (busca produto por nome/SKU), \`get_product_details\` e \`send_product_photo\` (envia foto oficial com preço e estoque). Oriente o agente a consultar produtos e enviar foto quando o cliente pedir fotos ou detalhes de itens.`
                : ''}`
            : `   - \`get_daily_summary\`: Resumo das interações e atendimentos do dia.
   - \`update_client_status\`: Atualizar status de clientes no CRM interno.
   - \`search_knowledge_base\`: Consultar base de conhecimento da empresa e histórico de clientes.`}

4. TOM DE VOZ E POSTURA:
   - Neutro quanto ao segmento, comercial, pronto para uso em produção, profissional, humanizado e focado na resolução e conversão.
   - Zero jargões técnicos para o cliente final (nunca mencione prompts, tokens, RAG, banco de dados ou embeddings).

5. RETORNO:
   - Retorne EXCLUSIVAMENTE o texto final do System Prompt pronto para ser colado no sistema.
   - NÃO inclua explicações antes ou depois.
   - NÃO envolva em blocos de código com crases triplas (\`\`\`markdown ou \`\`\`). Retorne apenas o texto puro.`;
        const userContent = `DADOS DA EMPRESA:
- Nome da Empresa: ${tenantName}
- Tipo do Agente: ${isExternal ? `Atendimento Externo ao Cliente no WhatsApp (Nome: ${externalName})` : `Copiloto da Equipe Interna (Nome: ${internalName})`}
${enableCatalog ? '- Catálogo de Produtos Físicos com Fotos: Habilitado' : '- Catálogo de Produtos Físicos: Desabilitado'}

INFORMAÇÕES E BRIEFING FORNECIDOS PELO GESTOR:
${briefing.trim()}

${knowledgeExcerpts
            ? `DOCUMENTOS EXISTENTES NA BASE DE CONHECIMENTO DA EMPRESA (Use estas regras, horários, preços e serviços para enriquecer as instruções):
${knowledgeExcerpts}`
            : 'Nenhum documento prévio anexado na Base de Conhecimento.'}

${currentPrompt && currentPrompt.trim().length > 20
            ? `PROMPT ATUALMENTE CONFIGURADO (Use como base para aprimorar, otimizar e corrigir conforme as diretrizes):
${currentPrompt.trim()}`
            : ''}`;
        // 5. Executa a geração com Gemini
        const model = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction,
            generationConfig: {
                temperature: 0.3,
            },
        });
        const result = await model.generateContent(userContent);
        let text = result.response.text() || '';
        // Remove eventual bloco de código markdown se o modelo incluiu
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        return text;
    }
}
export const promptGeneratorService = new PromptGeneratorService();
