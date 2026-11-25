import { SchemaType } from '@google/generative-ai';
import { clientService } from '../services/client.service.js';
import { notificationQueue } from '../services/notification-queue.service.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

export const humanEscalationTool: AgentTool = {
  declaration: {
    name: 'human_escalation',
    description: 'Pausa a IA e alerta a equipe interna para assumir o atendimento humano. Use se o cliente estiver irritado, pedir urgência ou solicitar expressamente falar com um atendente humano. NUNCA use se o cliente estiver apenas cumprimentando ou interagindo normalmente.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: {
          type: SchemaType.STRING,
          description: 'Descreva objetivamente apenas o motivo do pedido ou irritação. NUNCA cite o número ou final do telefone nem links.',
        },
      },
      required: ['reason'],
    },
  },
  execute: async (args: { reason: string }, context: ToolContext) => {
    // 0. Guarda de segurança cognitiva: se o contexto for apenas saudação ou conversa casual
    // e o cliente NÃO tiver pedido expressamente por humano/atendente, não pausar.
    const lastUserMsg = (context.userMessage || '').trim().toLowerCase();
    const explicitHumanIntent = /(humano|atendente|pessoa|algu[ée]m|falar com|ajuda humana|sair do bot|suporte)/i;
    const isPureGreeting = /^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi]|opa|fala|tudo bem|blz|beleza|ok|valeu|obrigado|obg|sim|n[ãa]o)[\s!?.ready]*$/i;

    if (isPureGreeting.test(lastUserMsg) && !explicitHumanIntent.test(lastUserMsg)) {
      logger.warn(
        { phone: context.phone, lastUserMsg, reason: args.reason },
        'Escalonamento humano ignorado: mensagem do usuário é apenas cumprimento/confirmação casual.'
      );
      return {
        success: false,
        message: 'A mensagem do cliente é apenas um cumprimento ou confirmação natural. NÃO pause o atendimento nem encerre a conversa; continue atendendo normalmente.',
      };
    }

    // 1. Pausa o cliente no banco
    await clientService.setStatus(context.phone, context.tenantId, 'paused');

    // 2. Alerta o grupo da equipe via WhatsApp através da fila inteligente com debounce
    if (context.notificationGroupId) {
      notificationQueue.enqueue({
        type: 'human_escalation',
        tenantId: context.tenantId,
        instanceName: context.instanceName,
        evolutionApiKey: context.evolutionApiKey,
        notificationGroupId: context.notificationGroupId,
        phone: context.phone,
        clientName: context.clientName,
        reason: args.reason || 'Solicitação de atendimento humano',
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      message: 'Atendimento transferido para a equipe humana e assistente virtual pausado com sucesso.',
    };
  },
};

