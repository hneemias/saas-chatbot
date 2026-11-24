import { SchemaType } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
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
    const sanitized = args.name_query.replace(/'/g, "''");

    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name')
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
    await supabase
      .from('clients')
      .update({ status: args.status })
      .eq('id', target.id)
      .eq('tenant_id', context.tenantId);

    return {
      success: true,
      message: `Status de ${target.name} atualizado com sucesso para "${args.status}".`,
    };
  },
};
