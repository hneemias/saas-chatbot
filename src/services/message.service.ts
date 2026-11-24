import { supabase } from '../integrations/supabase.js';
import { MessageRecord } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class MessageService {
  async logMessage(record: MessageRecord): Promise<void> {
    try {
      const { error } = await supabase.from('messages').insert({
        tenant_id: record.tenant_id,
        client_id: record.client_id || null,
        phone: record.phone,
        role: record.role,
        content: record.content,
        message_type: record.message_type || 'text',
        created_at: record.created_at || new Date().toISOString(),
      });

      if (error) {
        logger.error({ error: error.message, phone: record.phone }, 'Falha ao gravar mensagem no banco de dados');
      }
    } catch (err: any) {
      logger.error({ err: err.message, phone: record.phone }, 'Exceção ao gravar mensagem');
    }
  }

  async getRecentHistory(phone: string, tenantId: string, limit = 15): Promise<MessageRecord[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('phone', phone)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      // Ordena do mais antigo para o mais novo
      return (data as MessageRecord[]).reverse();
    } catch (err: any) {
      logger.error({ err: err.message, phone }, 'Erro ao buscar histórico de mensagens');
      return [];
    }
  }

  formatHistoryForAgent(messages: MessageRecord[], agentName = 'Assistente', clientName = 'Cliente'): string {
    if (!messages || messages.length === 0) return '';

    return messages
      .map((msg) => {
        const role = msg.role === 'user' ? clientName : agentName;
        const content = msg.content || '[Mídia/Arquivo]';
        return `${role}: ${content}`;
      })
      .join('\n');
  }
}

export const messageService = new MessageService();
