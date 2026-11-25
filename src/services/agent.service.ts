import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { agentTools, toolsDeclarations } from '../tools/index.js';
import { searchProductsTool, sendProductPhotoTool } from '../tools/products-tools.js';
import { AgentTool } from '../tools/types.js';
import { MessageRecord, ToolContext } from '../types/index.js';
import { messageService } from './message.service.js';
import { logger } from '../utils/logger.js';

export class AgentService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async runConversation(options: {
    systemPrompt: string;
    userMessage: string;
    historyMessages?: MessageRecord[];
    historyFormatted?: string;
    context: ToolContext;
    temperature?: number;
    enableCatalogTools?: boolean;
  }): Promise<string> {
    const {
      systemPrompt,
      userMessage,
      historyMessages = [],
      context,
      temperature = 0.4,
      enableCatalogTools = false,
    } = options;

    const activeToolsMap: Record<string, AgentTool> = enableCatalogTools
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
    const { history, effectiveUserMessage } = messageService.buildGeminiChatTurns(
      historyMessages,
      userMessage,
      'external'
    );

    const candidateModels = Array.from(
      new Set([env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(Boolean))
    );

    let lastError: any = null;

    for (const modelName of candidateModels) {
      const model = this.genAI.getGenerativeModel(
        {
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature,
            maxOutputTokens: 1000,
          },
          tools: [{ functionDeclarations: activeDeclarations }],
        },
        { timeout: 20000 }
      );

      const chat = model.startChat({ history });

      try {
        let result = await chat.sendMessage(effectiveUserMessage);
        let response = result.response;

        // Loop de execução de ferramentas (Tool Calling)
        let iterations = 0;
        const MAX_ITERATIONS = 5;

        while (response.functionCalls() && response.functionCalls()!.length > 0 && iterations < MAX_ITERATIONS) {
          iterations++;
          const functionCalls = response.functionCalls()!;

          const functionResponses = await Promise.all(
            functionCalls.map(async (call) => {
              logger.info({ tool: call.name, args: call.args, phone: context.phone }, 'Agente executando ferramenta');

              const tool = activeToolsMap[call.name];
              let toolResult: Record<string, any> = { error: 'Ferramenta não encontrada' };

              if (tool) {
                try {
                  toolResult = await tool.execute(call.args, context);
                } catch (err: any) {
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
            })
          );

          // Devolve todos os resultados das tools em paralelo para o Gemini continuar gerando a resposta
          result = await chat.sendMessage(functionResponses);
          response = result.response;
        }

        const replyText = response.text();
        return (replyText || '').trim();
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        const isTransientOverload =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('504') ||
          msg.toLowerCase().includes('abort') ||
          msg.toLowerCase().includes('timeout') ||
          msg.toLowerCase().includes('high demand') ||
          msg.toLowerCase().includes('overloaded');

        if (isTransientOverload && modelName !== candidateModels[candidateModels.length - 1]) {
          logger.warn(
            { failedModel: modelName, fallbackModel: env.GEMINI_FALLBACK_MODEL, phone: context.phone, err: msg },
            'Modelo Gemini com pico de demanda/timeout; alternando imediatamente para modelo de contingência'
          );
          continue;
        }

        logger.error({ err: msg, model: modelName, phone: context.phone }, 'Falha na resposta do modelo Gemini');
        throw err;
      }
    }

    throw lastError;
  }

  splitIntoChunks(text: string, maxLen = 1500): string[] {
    if (!text || text.trim() === '') return [];
    const chunks = text.match(new RegExp(`.{1,${maxLen}}(\\s|$)|[\\S]+?(\\s|$)`, 'g')) || [text];
    return chunks.map((c) => c.trim()).filter(Boolean);
  }
}

export const agentService = new AgentService();
