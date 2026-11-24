import { SchemaType } from '@google/generative-ai';
import { evolutionApi } from '../integrations/evolution.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

export const notifyTeamTool: AgentTool = {
  declaration: {
    name: 'notify_team',
    description: 'Notifica a equipe administrativa via WhatsApp sem pausar a IA. Use quando o cliente perguntar sobre andamento de processo existente ou quando você prometer consultar o advogado.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: {
          type: SchemaType.STRING,
          description: 'Resumo da dúvida ou consulta do cliente sobre o processo.',
        },
      },
      required: ['reason'],
    },
  },
  execute: async (args: { reason: string }, context: ToolContext) => {
    if (context.notificationGroupId) {
      const cleanPhone = context.phone.replace('@s.whatsapp.net', '');
      const clientLabel = context.clientName || cleanPhone;
      const msg = `ℹ️ *CONSULTA DE PROCESSO*\n\n` +
        `👤 *Cliente:* ${clientLabel}\n` +
        `📱 *Tel:* ${cleanPhone}\n\n` +
        `*Resumo:* ${args.reason || 'Consulta geral'}\n\n` +
        `Link: wa.me/${cleanPhone}`;

      try {
        await evolutionApi.sendTextMessage({
          instanceName: context.instanceName,
          remoteJid: context.notificationGroupId,
          text: msg,
        });
      } catch (err: any) {
        logger.error({ err: err.message }, 'Falha ao enviar notificação de consulta para o grupo');
      }
    }

    return {
      success: true,
      message: 'Equipe informada da consulta com sucesso.',
    };
  },
};
