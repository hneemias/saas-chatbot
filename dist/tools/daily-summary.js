import { SchemaType } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';
export const dailySummaryTool = {
    declaration: {
        name: 'get_daily_summary',
        description: 'Busca o resumo consolidado de todos os atendimentos e mensagens recebidas dos clientes na data especificada (padrão: hoje), agrupado por cliente, excluindo membros da equipe.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                date: {
                    type: SchemaType.STRING,
                    description: 'Data no formato YYYY-MM-DD para consultar o resumo diário (padrão é hoje).',
                },
            },
        },
    },
    execute: async (args, context) => {
        if (context.isInternalTeam === false) {
            return { success: false, error: 'Acesso restrito exclusivamente à equipe interna da empresa.' };
        }
        try {
            const defaultBrDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
            }).format(new Date());
            const targetDate = args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date.trim())
                ? args.date.trim()
                : defaultBrDate;
            // Limites diários no fuso de Brasília (UTC-3)
            const start = `${targetDate}T00:00:00.000-03:00`;
            const end = `${targetDate}T23:59:59.999-03:00`;
            // 1. Obtém telefones dos membros da equipe para desconsiderar no resumo de clientes
            const { data: teamMembers } = await supabase
                .from('team_members')
                .select('phone')
                .eq('tenant_id', context.tenantId);
            const teamPhones = new Set((teamMembers || []).map((t) => t.phone));
            // 2. Consulta mensagens do período juntamente com os dados do cliente
            const { data: messages, error } = await supabase
                .from('messages')
                .select('id, role, content, created_at, phone, client_id, clients!inner(name, phone)')
                .eq('tenant_id', context.tenantId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: true });
            if (error) {
                logger.error({ error: error.message }, 'Erro ao buscar resumo diário no banco');
                return { success: false, error: error.message };
            }
            if (!messages || messages.length === 0) {
                return {
                    success: true,
                    date: targetDate,
                    total_clients: 0,
                    summary: 'Nenhum atendimento realizado nesta data.',
                };
            }
            // 3. Agrupa mensagens por cliente
            const clientMap = new Map();
            for (const m of messages) {
                if (teamPhones.has(m.phone))
                    continue;
                const clientData = m.clients;
                const phone = clientData?.phone || m.phone;
                const name = clientData?.name || 'Desconhecido';
                if (!clientMap.has(phone)) {
                    clientMap.set(phone, {
                        name,
                        phone,
                        msg_count: 0,
                        last_msg_time: m.created_at,
                        messages: [],
                    });
                }
                const entry = clientMap.get(phone);
                entry.msg_count++;
                entry.last_msg_time = m.created_at;
                entry.messages.push({
                    role: m.role,
                    content: m.content || '',
                    created_at: m.created_at,
                });
            }
            const summaryList = Array.from(clientMap.values()).map((c) => ({
                name: c.name,
                phone: c.phone,
                total_messages: c.msg_count,
                last_interaction: c.last_msg_time,
                recent_exchanges: c.messages.slice(-10),
            }));
            return {
                success: true,
                date: targetDate,
                total_clients: summaryList.length,
                clients_summary: summaryList,
            };
        }
        catch (err) {
            logger.error({ err: err.message }, 'Falha na execução de get_daily_summary');
            return { success: false, error: err.message };
        }
    },
};
