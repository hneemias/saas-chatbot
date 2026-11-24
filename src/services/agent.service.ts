import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { agentTools, toolsDeclarations } from '../tools/index.js';
import { ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class AgentService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async runConversation(options: {
    systemPrompt: string;
    userMessage: string;
    historyFormatted: string;
    context: ToolContext;
    temperature?: number;
  }): Promise<string> {
    const { systemPrompt, userMessage, historyFormatted, context, temperature = 0.4 } = options;

    const model = this.genAI.getGenerativeModel({
      model: env.GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature,
        maxOutputTokens: 1000,
      },
      tools: [{ functionDeclarations: toolsDeclarations }],
    });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `[HISTÓRICO RECENTE DE CONVERSA]\n${historyFormatted || 'Nenhuma mensagem anterior.'}` }],
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Estou pronto para atender o cliente seguindo as diretrizes do escritório.' }],
        },
      ],
    });

    try {
      let result = await chat.sendMessage(userMessage);
      let response = result.response;

      // Loop de execução de ferramentas (Tool Calling)
      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (response.functionCalls() && response.functionCalls()!.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const functionCalls = response.functionCalls()!;
        const call = functionCalls[0]; // Processa chamada de tool

        logger.info({ tool: call.name, args: call.args, phone: context.phone }, 'Agente executando ferramenta');

        const tool = agentTools[call.name];
        let toolResult = { error: 'Ferramenta não encontrada' };

        if (tool) {
          try {
            toolResult = await tool.execute(call.args, context);
          } catch (err: any) {
            logger.error({ err: err.message, tool: call.name }, 'Erro ao executar ferramenta');
            toolResult = { error: err.message };
          }
        }

        // Devolve o resultado da tool para o Gemini continuar gerando a resposta
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: call.name,
              response: toolResult,
            },
          },
        ]);

        response = result.response;
      }

      const replyText = response.text();
      return (replyText || '').trim();
    } catch (err: any) {
      logger.error({ err: err.message, phone: context.phone }, 'Falha na resposta do modelo Gemini');
      throw err;
    }
  }

  splitIntoChunks(text: string, maxLen = 1500): string[] {
    if (!text || text.trim() === '') return [];
    const chunks = text.match(new RegExp(`.{1,${maxLen}}(\\s|$)|[\\S]+?(\\s|$)`, 'g')) || [text];
    return chunks.map((c) => c.trim()).filter(Boolean);
  }
}

export const agentService = new AgentService();
