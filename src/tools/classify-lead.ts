import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { clientService } from '../services/client.service.js';
import { evolutionApi } from '../integrations/evolution.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const classifyLeadTool: AgentTool = {
  declaration: {
    name: 'convert_lead',
    description: 'Classifica e converte o lead para a equipe jurídica quando a triagem estiver completa. Use APENAS UMA VEZ por atendimento.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        summary: {
          type: SchemaType.STRING,
          description: 'Resumo conciso do caso ou necessidade jurídica relatada pelo cliente.',
        },
        area: {
          type: SchemaType.STRING,
          description: 'Área do Direito identificada (ex: Previdenciário, Família, Trabalhista, Cível).',
        },
        temperature: {
          type: SchemaType.STRING,
          description: 'Classificação de prioridade/temperatura do lead: "🔥 Quente", "⚠️ Morno" ou "❄️ Frio".',
        },
      },
      required: ['summary', 'area', 'temperature'],
    },
  },
  execute: async (
    args: { summary: string; area: string; temperature: string },
    context: ToolContext
  ) => {
    // 1. Atualiza status no banco
    await clientService.setStatus(context.phone, context.tenantId, 'triagem_concluida');

    // 2. Notifica grupo de advogados
    if (context.notificationGroupId) {
      const cleanPhone = context.phone.replace('@s.whatsapp.net', '');
      const clientLabel = context.clientName || cleanPhone;

      const leadMsg = `📢 *NOVO LEAD CLASSIFICADO*\n\n` +
        `👤 *Cliente:* ${clientLabel}\n` +
        `📱 *Tel:* ${cleanPhone}\n\n` +
        `🔥 *Temp:* ${args.temperature || '⚠️ Morno'}\n` +
        `⚖️ *Área:* ${args.area || 'Geral'}\n\n` +
        `📝 *Resumo:*\n${args.summary}\n\n` +
        `Link: wa.me/${cleanPhone}`;

      try {
        await evolutionApi.sendTextMessage({
          instanceName: context.instanceName,
          remoteJid: context.notificationGroupId,
          text: leadMsg,
        });
      } catch (err: any) {
        logger.error({ err: err.message }, 'Falha ao notificar grupo sobre lead classificado');
      }
    }

    return {
      success: true,
      message: 'Lead classificado e enviado com sucesso para a equipe jurídica.',
    };
  },
};
