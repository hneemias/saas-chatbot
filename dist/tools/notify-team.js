import { SchemaType } from '@google/generative-ai';
import { evolutionApi } from '../integrations/evolution.js';
import { logger } from '../utils/logger.js';
export const notifyTeamTool = {
    declaration: {
        name: 'notify_team',
        description: 'Notifica a equipe interna via WhatsApp sem pausar a IA. Use quando o cliente pedir andamento de processo, ordem de serviço ou informação que dependa de confirmação humana.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                reason: {
                    type: SchemaType.STRING,
                    description: 'Resumo da dúvida, pedido de orçamento ou consulta de andamento do cliente.',
                },
            },
            required: ['reason'],
        },
    },
    execute: async (args, context) => {
        if (context.notificationGroupId) {
            const cleanPhone = context.phone.replace(/@(s\.whatsapp\.net|lid)$/i, '');
            const clientLabel = context.clientName || cleanPhone;
            const msg = `ℹ️ *SOLICITAÇÃO DE ACOMPANHAMENTO*\n\n` +
                `👤 *Cliente:* ${clientLabel}\n` +
                `📱 *Tel:* ${cleanPhone}\n\n` +
                `*Resumo:* ${args.reason || 'Consulta geral'}\n\n` +
                `Link: wa.me/${cleanPhone}`;
            try {
                await evolutionApi.sendTextMessage({
                    instanceName: context.instanceName,
                    remoteJid: context.notificationGroupId,
                    text: msg,
                    apiKey: context.evolutionApiKey,
                });
            }
            catch (err) {
                logger.error({ err: err.message }, 'Falha ao enviar notificação de consulta para o grupo');
            }
        }
        return {
            success: true,
            message: 'Equipe informada da consulta com sucesso.',
        };
    },
};
