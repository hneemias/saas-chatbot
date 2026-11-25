import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { clientService } from '../services/client.service.js';
import { memoryService } from '../services/memory.service.js';
import { evolutionApi } from '../integrations/evolution.js';
import { supabase } from '../integrations/supabase.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const classifyLeadTool: AgentTool = {
  declaration: {
    name: 'convert_lead',
    description: 'Classifica e encaminha o atendimento/lead para a equipe responsável quando a triagem estiver completa. Use APENAS UMA VEZ por assunto.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        summary: {
          type: SchemaType.STRING,
          description: 'Resumo conciso da solicitação, orçamento, caso ou defeito relatado pelo cliente.',
        },
        area: {
          type: SchemaType.STRING,
          description: 'Categoria, departamento ou área identificada (ex: Previdenciário, Família, Trabalhista, Comercial/Vendas, Assistência Técnica, Segurança Eletrônica).',
        },
        temperature: {
          type: SchemaType.STRING,
          description: 'Classificação de prioridade/temperatura do atendimento: "🔥 Quente", "⚠️ Morno" ou "❄️ Frio".',
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

    // 1.1 Registra na tabela leads_control se houver clientId
    if (context.clientId) {
      try {
        await supabase.from('leads_control').insert({
          tenant_id: context.tenantId,
          client_id: context.clientId,
          temperature: args.temperature,
          area: args.area,
          summary: args.summary,
          status: 'triagem_concluida',
        });

        // Garante que a síntese da triagem já fique registrada imediatamente na memória permanente do cliente
        const seedSummary =
          `• Área / Serviço: ${args.area} (${args.temperature})\n` +
          `• Resumo da Triagem: ${args.summary}`;
        await memoryService.recordLeadTriageMemory(context.tenantId, context.clientId, seedSummary);
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Falha ao registrar lead em leads_control');
      }
    }

    // 2. Notifica grupo de advogados
    if (context.notificationGroupId) {
      const cleanPhone = context.phone.replace(/@(s\.whatsapp\.net|lid)$/i, '');
      const clientLabel = context.clientName || cleanPhone;

      const leadMsg = `📢 *NOVA TRIAGEM CONCLUÍDA*\n\n` +
        `👤 *Cliente:* ${clientLabel}\n` +
        `📱 *Tel:* ${cleanPhone}\n\n` +
        `🔥 *Prioridade:* ${args.temperature || '⚠️ Morno'}\n` +
        `🏷️ *Categoria:* ${args.area || 'Geral'}\n\n` +
        `📝 *Resumo:*\n${args.summary}\n\n` +
        `Link: wa.me/${cleanPhone}`;

      try {
        await evolutionApi.sendTextMessage({
          instanceName: context.instanceName,
          remoteJid: context.notificationGroupId,
          text: leadMsg,
          apiKey: context.evolutionApiKey,
        });
      } catch (err: any) {
        logger.error({ err: err.message }, 'Falha ao notificar grupo sobre lead classificado');
      }
    }

    return {
      success: true,
      message: 'Atendimento classificado e enviado com sucesso para a equipe responsável.',
    };
  },
};
