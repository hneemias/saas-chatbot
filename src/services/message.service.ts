import { Content } from '@google/generative-ai';
import { supabase } from '../integrations/supabase.js';
import { MessageRecord } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getEquivalentPhoneJids, normalizeWhatsAppJid } from '../utils/phone.js';

export interface BuildChatHistoryResult {
  /**
   * Histórico multi-turn nativo validado para `model.startChat({ history })`:
   * - Sempre vazio `[]` OU iniciando em `role: 'user'` e terminando em `role: 'model'`
   * - Alternância estrita `user` <-> `model` (mensagens seguidas do mesmo lado são mescladas)
   */
  history: Content[];
  /**
   * Mensagem atual do usuário pronta para `chat.sendMessage(...)`.
   * Caso existissem mensagens anteriores do usuário ainda sem resposta no final do banco
   * (ex.: enviadas enquanto a IA estava pausada), elas são incorporadas aqui para não quebrar a alternância de turnos.
   */
  effectiveUserMessage: string;
}

export class MessageService {
  async logMessage(record: MessageRecord): Promise<void> {
    try {
      const normalizedPhone = normalizeWhatsAppJid(record.phone);
      const { error } = await supabase.from('messages').insert({
        tenant_id: record.tenant_id,
        client_id: record.client_id || null,
        phone: normalizedPhone,
        role: record.role,
        content: record.content,
        message_type: record.message_type || 'text',
        created_at: record.created_at || new Date().toISOString(),
      });

      if (error) {
        logger.error({ error: error.message, phone: normalizedPhone }, 'Falha ao gravar mensagem no banco de dados');
      }
    } catch (err: any) {
      logger.error({ err: err.message, phone: record.phone }, 'Exceção ao gravar mensagem');
    }
  }

  async getRecentHistory(rawPhone: string, tenantId: string, limit = 16): Promise<MessageRecord[]> {
    try {
      const jidVariants = getEquivalentPhoneJids(rawPhone);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('phone', jidVariants)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      // Ordena do mais antigo para o mais novo
      return (data as MessageRecord[]).reverse();
    } catch (err: any) {
      logger.error({ err: err.message, phone: rawPhone }, 'Erro ao buscar histórico de mensagens');
      return [];
    }
  }

  /**
   * Constrói o array nativo `Content[]` para `model.startChat({ history })` do Gemini,
   * eliminando a necessidade de injetar `{{ history }}` em texto plano no System Prompt.
   */
  buildGeminiChatTurns(
    messages: MessageRecord[],
    currentUserMessage: string,
    mode: 'external' | 'internal' = 'external'
  ): BuildChatHistoryResult {
    const normalizedTurns: Array<{ role: 'user' | 'model'; text: string }> = [];

    for (const msg of messages || []) {
      const rawText = (msg.content || '').trim();
      if (!rawText) continue;

      let mappedRole: 'user' | 'model';
      let mappedText = rawText;

      if (mode === 'internal') {
        // No modo Atlas (equipe interna), o advogado/admin é o 'user' e o Atlas é 'model'
        mappedRole = msg.role === 'assistant' ? 'model' : 'user';
      } else {
        // No modo Externo (clientes), o cliente é 'user'; IA e intervenções humanas do escritório são 'model'
        if (msg.role === 'user') {
          mappedRole = 'user';
        } else if (msg.role === 'admin') {
          mappedRole = 'model';
          mappedText = `[Atendente Humano do Escritório]: ${rawText}`;
        } else {
          mappedRole = 'model';
        }
      }

      const prev = normalizedTurns[normalizedTurns.length - 1];
      if (prev && prev.role === mappedRole) {
        // Mescla mensagens consecutivas do mesmo papel (ex.: resposta da IA fatiada em múltiplos balões)
        prev.text = `${prev.text}\n\n${mappedText}`;
      } else {
        normalizedTurns.push({ role: mappedRole, text: mappedText });
      }
    }

    if (normalizedTurns.length === 0) {
      return {
        history: [],
        effectiveUserMessage: currentUserMessage,
      };
    }

    // Regra obrigatória do Gemini SDK: `history[0].role` DEVE ser `'user'`
    if (normalizedTurns[0].role === 'model') {
      normalizedTurns.unshift({
        role: 'user',
        text: '[Continuação de conversa anterior]',
      });
    }

    // Regra de alternância: `chat.sendMessage(...)` enviará um novo turno `'user'`,
    // portanto `history` deve terminar em `'model'` (ou ficar vazio se só havia turno `'user'` pendente)
    let effectiveUserMessage = currentUserMessage;
    const lastTurn = normalizedTurns[normalizedTurns.length - 1];
    if (lastTurn && lastTurn.role === 'user') {
      normalizedTurns.pop();
      effectiveUserMessage = `${lastTurn.text}\n\n${currentUserMessage}`;
    }

    const history: Content[] = normalizedTurns.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    return {
      history,
      effectiveUserMessage,
    };
  }

  /**
   * Mantido como utilitário auxiliar para logs, síntese de memória e ferramentas.
   */
  formatHistoryForAgent(
    messages: MessageRecord[],
    agentName = 'Assistente',
    userLabel = 'Cliente',
    mode: 'external' | 'internal' = 'external'
  ): string {
    if (!messages || messages.length === 0) return '';

    return messages
      .map((msg) => {
        let speaker: string;
        if (mode === 'internal') {
          speaker = msg.role === 'assistant' ? agentName : userLabel;
        } else {
          if (msg.role === 'user') {
            speaker = userLabel;
          } else if (msg.role === 'admin') {
            speaker = 'Atendente Humano';
          } else {
            speaker = agentName;
          }
        }

        const content = msg.content || '[Mídia/Arquivo]';
        return `${speaker}: ${content}`;
      })
      .join('\n');
  }
}

export const messageService = new MessageService();
