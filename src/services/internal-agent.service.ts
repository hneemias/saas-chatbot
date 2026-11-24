import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { updateStatusTool } from '../tools/update-status.js';
import { dailySummaryTool } from '../tools/daily-summary.js';
import { checkAvailabilityTool } from '../tools/check-availability.js';
import { AgentTool } from '../tools/types.js';
import { ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { compileSystemPrompt } from '../utils/prompt-compiler.js';

// O Agente Interno (Administrativo) possui ferramentas de gestão e resumos
const internalTools: Record<string, AgentTool> = {
  update_client_status: updateStatusTool,
  get_daily_summary: dailySummaryTool,
  check_calendar: checkAvailabilityTool,
};

const internalDeclarations = Object.values(internalTools).map((t) => t.declaration);

export class InternalAgentService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async runInternalAssistant(options: {
    systemPrompt: string;
    userMessage: string;
    historyFormatted: string;
    context: ToolContext;
    adminName: string;
    adminRole: string;
  }): Promise<string> {
    const { systemPrompt, userMessage, historyFormatted, context, adminName, adminRole } = options;

    // Compila o prompt interno com suporte a tags n8n e template
    const compiledPrompt = compileSystemPrompt(
      systemPrompt || 'Você é um assistente interno de apoio à equipe jurídica.',
      {
        adminName,
        adminRole,
        historyFormatted,
        agentName: 'Atlas',
        phone: context.phone,
      }
    );

    const model = this.genAI.getGenerativeModel({
      model: env.GEMINI_MODEL,
      systemInstruction: compiledPrompt,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
      tools: [{ functionDeclarations: internalDeclarations }],
    });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `[HISTÓRICO RECENTE COM A EQUIPE]\n${historyFormatted || 'Nenhuma mensagem recente.'}` }],
        },
        {
          role: 'model',
          parts: [{ text: `Entendido. Olá ${adminName}! Como posso apoiar você e o escritório hoje?` }],
        },
      ],
    });

    try {
      let result = await chat.sendMessage(userMessage);
      let response = result.response;

      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (response.functionCalls() && response.functionCalls()!.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const functionCalls = response.functionCalls()!;
        const call = functionCalls[0];

        logger.info({ tool: call.name, args: call.args, admin: adminName }, 'Agente Interno executando ferramenta');

        const tool = internalTools[call.name];
        let toolResult = { error: 'Ferramenta administrativa não encontrada' };

        if (tool) {
          try {
            toolResult = await tool.execute(call.args, context);
          } catch (err: any) {
            logger.error({ err: err.message, tool: call.name }, 'Erro ao executar ferramenta interna');
            toolResult = { error: err.message };
          }
        }

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

      return (response.text() || '').trim();
    } catch (err: any) {
      logger.error({ err: err.message, admin: adminName }, 'Falha na resposta do Agente Interno');
      throw err;
    }
  }
}

export const internalAgentService = new InternalAgentService();
