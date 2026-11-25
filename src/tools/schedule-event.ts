import { SchemaType } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
import { googleCalendar, CalendarConfig } from '../integrations/google-calendar.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

export const scheduleEventTool: AgentTool = {
  declaration: {
    name: 'schedule_event',
    description: 'Agenda um atendimento, consulta ou reunião na agenda do Google Calendar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_time: {
          type: SchemaType.STRING,
          description: 'Data e hora de início no formato ISO (ex: "2026-11-25T14:00:00-03:00").',
        },
        end_time: {
          type: SchemaType.STRING,
          description: 'Data e hora de término no formato ISO (ex: "2026-11-25T15:00:00-03:00").',
        },
        client_name: {
          type: SchemaType.STRING,
          description: 'Nome do cliente para o título do evento.',
        },
        topic: {
          type: SchemaType.STRING,
          description: 'Assunto do agendamento (ex: "Atendimento Inicial", "Avaliação Técnica", "Reunião Comercial").',
        },
        event_id: {
          type: SchemaType.STRING,
          description: 'ID do evento existente se for um reagendamento.',
        },
      },
      required: ['start_time', 'end_time'],
    },
  },
  execute: async (
    args: {
      start_time: string;
      end_time: string;
      client_name?: string;
      topic?: string;
      event_id?: string;
    },
    context: ToolContext
  ) => {
    try {
      const { data: configRow } = await supabase
        .from('tenant_configs')
        .select('calendar_config')
        .eq('tenant_id', context.tenantId)
        .single();

      const config: CalendarConfig = configRow?.calendar_config || {};

      if (!config.enabled || !config.refresh_token) {
        return {
          success: false,
          message: 'Agenda online ainda não autenticada no painel administrativo. Solicitação anotada para confirmação manual pela equipe.',
        };
      }

      const clientName = args.client_name || context.clientName || 'Cliente';
      const cleanPhone = context.phone.replace('@s.whatsapp.net', '');
      const summary = `📅 Agendamento: ${clientName} - ${args.topic || 'Atendimento'}`;
      const description = `Agendamento realizado pela Assistente Virtual.\n\nCliente: ${clientName}\nTelefone: wa.me/${cleanPhone}\nAssunto: ${args.topic || 'Não especificado'}`;

      if (args.event_id) {
        // Reagendamento
        const updated = await googleCalendar.updateEvent(config, args.event_id, {
          summary,
          description,
          startTime: args.start_time,
          endTime: args.end_time,
        });

        return {
          success: true,
          message: `Consulta reagendada com sucesso para ${args.start_time}. ID: ${updated.id}`,
        };
      }

      // Criação de novo agendamento
      const created = await googleCalendar.createEvent(config, {
        summary,
        description,
        startTime: args.start_time,
        endTime: args.end_time,
      });

      return {
        success: true,
        message: `Consulta agendada com sucesso para ${args.start_time}. ID do evento: ${created.id}`,
      };
    } catch (err: any) {
      logger.error({ err: err.message, tenantId: context.tenantId }, 'Erro ao agendar consulta');
      return {
        success: false,
        message: 'Ocorreu um erro ao gravar o compromisso na agenda. A equipe entrará em contato para confirmar o agendamento.',
      };
    }
  },
};
