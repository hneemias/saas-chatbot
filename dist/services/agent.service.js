import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { agentTools, toolsDeclarations } from '../tools/index.js';
import { searchProductsTool, sendProductPhotoTool } from '../tools/products-tools.js';
import { messageService } from './message.service.js';
import { logger } from '../utils/logger.js';
export class AgentService {
    genAI;
    constructor() {
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
    async runConversation(options) {
        const { systemPrompt, userMessage, historyMessages = [], context, temperature = 0.4, enableCatalogTools = false, } = options;
        const activeToolsMap = enableCatalogTools
            ? {
                ...agentTools,
                search_products: searchProductsTool,
                send_product_photo: sendProductPhotoTool,
            }
            : agentTools;
        const activeDeclarations = enableCatalogTools
            ? [...toolsDeclarations, searchProductsTool.declaration, sendProductPhotoTool.declaration]
            : toolsDeclarations;
        // Constrói turnos multi-turn nativos (`user` <-> `model`) sem injeção artificial de texto plano
        const { history, effectiveUserMessage } = messageService.buildGeminiChatTurns(historyMessages, userMessage, 'external');
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
                systemInstruction: systemPrompt,
                generationConfig: {
                    temperature,
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
                // Loop de execução de ferramentas (Tool Calling)
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
                        logger.info({ tool: call.name, args: call.args, phone: context.phone }, 'Agente executando ferramenta');
                        const tool = activeToolsMap[call.name];
                        let toolResult = { error: 'Ferramenta não encontrada' };
                        if (tool) {
                            try {
                                toolResult = await tool.execute(call.args, context);
                            }
                            catch (err) {
                                logger.error({ err: err.message, tool: call.name }, 'Erro ao executar ferramenta');
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
                const replyText = response.text();
                return (replyText || '').trim();
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
                    logger.warn({ failedModel: modelName, fallbackModel: nextModel, phone: context.phone, err: msg }, 'Modelo Gemini com pico de demanda/timeout; alternando imediatamente para modelo de contingência');
                    continue;
                }
                logger.error({ err: msg, model: modelName, phone: context.phone }, 'Falha na resposta do modelo Gemini');
                throw err;
            }
        }
        throw lastError;
    }
    splitIntoChunks(text, maxLen = 1500) {
        if (!text || text.trim() === '')
            return [];
        const chunks = text.match(new RegExp(`.{1,${maxLen}}(\\s|$)|[\\S]+?(\\s|$)`, 'g')) || [text];
        return chunks.map((c) => c.trim()).filter(Boolean);
    }
}
export const agentService = new AgentService();
