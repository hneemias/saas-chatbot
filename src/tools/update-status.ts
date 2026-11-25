import { SchemaType } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
import { clientService } from '../services/client.service.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';

export const updateStatusTool: AgentTool = {
  declaration: {
    name: 'update_client_status',
    description: 'Atualiza o status de um cliente (ex: para "converted"). Use quando disser "Fechei com X" ou "Mude o status de Y".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name_query: {
          type: SchemaType.STRING,
          description: 'Nome do cliente cujo status deve ser alterado.',
        },
        status: {
          type: SchemaType.STRING,
          description: 'Novo status a definir (ex: converted, paused, active).',
        },
      },
      required: ['name_query', 'status'],
    },
  },
  execute: async (args: { name_query: string; status: string }, context: ToolContext) => {
    if (context.isInternalTeam === false) {
      return { success: false, message: 'Operação permitida apenas para membros da equipe.' };
    }

    const sanitized = (args.name_query || '').trim().replace(/'/g, "''");
    if (!sanitized) {
      return { success: false, message: 'Informe o nome do cliente.' };
    }

    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, phone')
      .eq('tenant_id', context.tenantId)
      .ilike('name', `%${sanitized}%`)
      .limit(5);

    if (error || !clients || clients.length === 0) {
      return { success: false, message: 'Nenhum cliente encontrado com esse nome.' };
    }

    if (clients.length > 1) {
      const names = clients.map((c) => c.name).join(', ');
      return {
        success: false,
        message: `Encontrei mais de um cliente: ${names}. Por favor, especifique o nome completo.`,
      };
    }

    const target = clients[0];
    await clientService.setStatus(target.phone, context.tenantId, args.status);

    return {
      success: true,
      message: `Status de ${target.name} atualizado com sucesso para "${args.status}".`,
    };
  },
};
