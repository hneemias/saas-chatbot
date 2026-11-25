import { SchemaType } from '@google/generative-ai';
import { notificationQueue } from '../services/notification-queue.service.js';
export const notifyTeamTool = {
    declaration: {
        name: 'notify_team',
        description: 'Notifica a equipe interna via WhatsApp sem pausar a IA. Use quando o cliente pedir visita técnica, orçamento, andamento de processo ou informação que dependa de confirmação humana.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                reason: {
                    type: SchemaType.STRING,
                    description: 'Descreva objetivamente apenas a dúvida, endereço ou pedido do cliente. NUNCA cite o número ou final do telefone nem links.',
                },
            },
            required: ['reason'],
        },
    },
    execute: async (args, context) => {
        if (context.notificationGroupId) {
            notificationQueue.enqueue({
                type: 'notify_team',
                tenantId: context.tenantId,
                instanceName: context.instanceName,
                evolutionApiKey: context.evolutionApiKey,
                notificationGroupId: context.notificationGroupId,
                phone: context.phone,
                clientName: context.clientName,
                reason: args.reason,
                timestamp: Date.now(),
            });
        }
        return {
            success: true,
            message: 'Equipe informada da solicitação com sucesso.',
        };
    },
};
