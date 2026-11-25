import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { agentTools, toolsDeclarations } from '../tools/index.js';
import { searchProductsTool, sendProductPhotoTool } from '../tools/products-tools.js';
import { messageService } from './message.service.js';
import { logger } from '../utils/logger.js';
import { formatWhatsAppText } from '../utils/whatsapp-formatter.js';
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
            'gemini-3-flash-preview',
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
            // Função de chamada com retry rápido em caso de pico momentâneo (503/high demand)
            const executeWithRetry = async (contents) => {
                let attempt = 0;
                const MAX_RETRIES = 2;
                while (true) {
                    try {
                        return await model.generateContent({ contents });
                    }
                    catch (err) {
                        attempt++;
                        const msg = String(err?.message || '');
                        const is503 = msg.includes('503') ||
                            msg.toLowerCase().includes('high demand') ||
                            msg.toLowerCase().includes('overloaded');
                        if (is503 && attempt <= MAX_RETRIES) {
                            logger.warn({ model: modelName, attempt, maxRetries: MAX_RETRIES, phone: context.phone }, 'Oscilação temporária de demanda no Gemini (503); aguardando 1s para nova tentativa automática');
                            await new Promise((r) => setTimeout(r, 1000 * attempt));
                            continue;
                        }
                        throw err;
                    }
                }
            };
            // Monta histórico inicial no formato de conteúdos nativos do Gemini
            const currentContents = [
                ...history,
                { role: 'user', parts: [{ text: effectiveUserMessage }] },
            ];
            try {
                let result = await executeWithRetry(currentContents);
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
                    result = await executeWithRetry(currentContents);
                    response = result.response;
                }
                const replyText = response.text();
                return formatWhatsAppText((replyText || '').trim());
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
    splitIntoChunks(text, maxLen = 1200) {
        if (!text || text.trim() === '')
            return [];
        // Remove qualquer resquício acidental de marcador de foto ou dados técnicos duplicados
        let cleaned = text
            .replace(/\[Foto enviada\][^\n]*\n?/gi, '')
            .replace(/^Código:\s*\d+\s*•\s*Valor:[^\n]*\n?/gmi, '')
            .trim();
        if (!cleaned)
            return [];
        // Se o texto total couber confortavelmente em até 800 caracteres, envie em balão único (sem picar por linha)
        if (cleaned.length <= 800) {
            return [cleaned];
        }
        // Divide prioritariamente por parágrafos duplos (\n\n)
        const paragraphs = cleaned.split(/\n\s*\n/);
        const chunks = [];
        let current = '';
        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed)
                continue;
            if (!current) {
                current = trimmed;
            }
            else if (current.length + trimmed.length + 2 <= maxLen) {
                current += '\n\n' + trimmed;
            }
            else {
                chunks.push(current);
                current = trimmed;
            }
        }
        if (current) {
            chunks.push(current);
        }
        return chunks.length > 0 ? chunks : [cleaned];
    }
}
export const agentService = new AgentService();
