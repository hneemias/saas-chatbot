import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { updateStatusTool } from '../tools/update-status.js';
import { dailySummaryTool } from '../tools/daily-summary.js';
import { checkAvailabilityTool } from '../tools/check-availability.js';
import { internalSearchKnowledgeBaseTool } from '../tools/search-knowledge-base.js';
import { internalSearchProductsTool } from '../tools/products-tools.js';
import { messageService } from './message.service.js';
import { logger } from '../utils/logger.js';
import { compileSystemPrompt } from '../utils/prompt-compiler.js';
// O Agente Interno (Administrativo) possui ferramentas de gestão, resumos e base de conhecimento completa
const internalTools = {
    update_client_status: updateStatusTool,
    get_daily_summary: dailySummaryTool,
    check_calendar: checkAvailabilityTool,
    search_knowledge_base: internalSearchKnowledgeBaseTool,
};
const internalDeclarations = Object.values(internalTools).map((t) => t.declaration);
export class InternalAgentService {
    genAI;
    constructor() {
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
    async runInternalAssistant(options) {
        const { systemPrompt, userMessage, historyMessages = [], historyFormatted, context, adminName, adminRole, tenantName, agentName = 'Atlas', externalAgentName = 'Karol', enableCatalogTools = false, } = options;
        // Compila o prompt interno com identidade estática no topo + `<session_context>` no final
        const compiledPrompt = compileSystemPrompt(systemPrompt || 'Você é {{ agent_name }}, assistente interno de apoio à equipe de {{ tenant_name }}.', {
            mode: 'internal',
            tenantName,
            adminName,
            adminRole,
            historyFormatted,
            agentName,
            internalAgentName: agentName,
            externalAgentName,
            phone: context.phone,
            nativeMultiTurnHistory: true,
            appendSessionContext: true,
        });
        const activeInternalTools = enableCatalogTools
            ? { ...internalTools, search_products: internalSearchProductsTool }
            : internalTools;
        const activeDeclarations = enableCatalogTools
            ? [...internalDeclarations, internalSearchProductsTool.declaration]
            : internalDeclarations;
        const { history, effectiveUserMessage } = messageService.buildGeminiChatTurns(historyMessages, userMessage, 'internal');
        const candidateModels = Array.from(new Set([
            env.GEMINI_MODEL,
            'gemini-flash-lite-latest',
            env.GEMINI_FALLBACK_MODEL,
            'gemini-3.5-flash-lite',
            'gemini-3.8-flash',
            'gemini-3.6-flash',
        ].filter(Boolean)));
        let lastError = null;
        for (const modelName of candidateModels) {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: compiledPrompt,
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1000,
                },
                tools: [{ functionDeclarations: activeDeclarations }],
            }, { timeout: 35000 });
            // Monta histórico inicial no formato de conteúdos nativos do Gemini
            const currentContents = [
                ...history,
                { role: 'user', parts: [{ text: effectiveUserMessage }] },
            ];
            try {
                let result = await model.generateContent({ contents: currentContents });
                let response = result.response;
                let iterations = 0;
                const MAX_ITERATIONS = 5;
                while (response.functionCalls() && response.functionCalls().length > 0 && iterations < MAX_ITERATIONS) {
                    iterations++;
                    const functionCalls = response.functionCalls();
                    const candidateContent = response.candidates?.[0]?.content;
                    if (candidateContent) {
                        currentContents.push(candidateContent);
                    }
                    const functionResponses = await Promise.all(functionCalls.map(async (call) => {
                        logger.info({ tool: call.name, args: call.args, admin: adminName }, 'Agente Interno executando ferramenta');
                        const tool = activeInternalTools[call.name];
                        let toolResult = { error: 'Ferramenta administrativa não encontrada' };
                        if (tool) {
                            try {
                                toolResult = await tool.execute(call.args, context);
                            }
                            catch (err) {
                                logger.error({ err: err.message, tool: call.name }, 'Erro ao executar ferramenta interna');
                                toolResult = { error: err.message };
                            }
                        }
                        return {
                            functionResponse: {
                                name: call.name,
                                response: toolResult,
                            },
                        };
                    }));
                    // No Gemini 2.x e 3.x, a resposta da tool é enviada com role: 'user'
                    currentContents.push({
                        role: 'user',
                        parts: functionResponses,
                    });
                    result = await model.generateContent({ contents: currentContents });
                    response = result.response;
                }
                return (response.text() || '').trim();
            }
            catch (err) {
                lastError = err;
                const msg = String(err?.message || '');
                const isTransientOverload = msg.includes('503') ||
                    msg.includes('429') ||
                    msg.includes('504') ||
                    msg.toLowerCase().includes('abort') ||
                    msg.toLowerCase().includes('timeout') ||
                    msg.toLowerCase().includes('high demand') ||
                    msg.toLowerCase().includes('overloaded') ||
                    msg.toLowerCase().includes('resource has been exhausted');
                const currentIdx = candidateModels.indexOf(modelName);
                const nextModel = candidateModels[currentIdx + 1];
                if (isTransientOverload && nextModel) {
                    logger.warn({ failedModel: modelName, fallbackModel: nextModel, admin: adminName, err: msg }, 'Modelo do Agente Interno com pico de demanda/timeout; alternando para modelo de contingência');
                    continue;
                }
                logger.error({ err: msg, model: modelName, admin: adminName }, 'Falha na resposta do Agente Interno');
                throw err;
            }
        }
        throw lastError;
    }
}
export const internalAgentService = new InternalAgentService();
