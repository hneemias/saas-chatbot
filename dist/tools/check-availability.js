import { SchemaType } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
import { googleCalendar } from '../integrations/google-calendar.js';
import { logger } from '../utils/logger.js';
export const checkAvailabilityTool = {
    declaration: {
        name: 'check_calendar',
        description: 'Consulta os horários livres e a disponibilidade na agenda da empresa para os próximos 7 dias.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                days_ahead: {
                    type: SchemaType.INTEGER,
                    description: 'Quantidade de dias a frente para consultar (padrão 7).',
                },
            },
        },
    },
    execute: async (args, context) => {
        try {
            // 1. Busca configurações de agenda do tenant
            const { data: configRow } = await supabase
                .from('tenant_configs')
                .select('calendar_config')
                .eq('tenant_id', context.tenantId)
                .single();
            const config = configRow?.calendar_config || {};
            if (!config.enabled || !config.refresh_token) {
                return {
                    success: false,
                    available: false,
                    message: 'A integração de agenda desta empresa ainda não foi configurada pelo painel administrativo. Informe ao cliente que o agendamento será confirmado manualmente pela equipe.',
                };
            }
            const days = args.days_ahead || 7;
            const now = new Date();
            const timeMin = now.toISOString();
            const maxDate = new Date();
            maxDate.setDate(now.getDate() + days);
            const timeMax = maxDate.toISOString();
            // 2. Busca eventos existentes no Google Calendar
            const events = await googleCalendar.listEvents(config, timeMin, timeMax);
            const busySlots = events.map((e) => ({
                start: e.start?.dateTime || e.start?.date,
                end: e.end?.dateTime || e.end?.date,
                summary: 'Compromisso agendado',
            }));
            // 3. Adiciona restrições de horário comercial e almoço
            const workDays = config.work_days || [1, 2, 3, 4, 5];
            const lunchStart = config.lunch_start || '12:00';
            const lunchEnd = config.lunch_end || '13:00';
            const businessStart = config.business_start || '09:00';
            const businessEnd = config.business_end || '18:00';
            return {
                success: true,
                business_hours: `${businessStart} às ${businessEnd}`,
                work_days_description: 'Segunda a Sexta-feira',
                lunch_break: `${lunchStart} às ${lunchEnd} (bloqueado)`,
                busy_slots: busySlots,
                instructions_for_agent: `Use os horários comerciais e os slots ocupados para sugerir 2 ou 3 opções de datas e horários convenientes para o cliente.`,
            };
        }
        catch (err) {
            logger.error({ err: err.message, tenantId: context.tenantId }, 'Erro ao checar disponibilidade');
            return {
                success: false,
                message: 'No momento não foi possível acessar a agenda online. Sugira um horário de sua preferência que nossa equipe confirmará.',
            };
        }
    },
};
