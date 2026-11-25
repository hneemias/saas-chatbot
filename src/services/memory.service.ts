import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { Client, MessageRecord } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface RefreshMemoryOptions {
  tenantId: string;
  client: Client;
  recentMessages: MessageRecord[];
  latestUserMessage: string;
  latestAssistantReply: string;
  force?: boolean;
}

export class MemoryService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  /**
   * Extrai o resumo de memória de longo prazo armazenado em `clients.metadata.memory_summary`.
   */
  extractClientMemory(client?: Pick<Client, 'metadata'> | null): string {
    const raw = client?.metadata?.memory_summary;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  /**
   * Decide se vale a pena sintetizar/atualizar a memória episódica do cliente agora,
   * evitando chamadas desnecessárias em saudações curtas ("oi", "bom dia").
   */
  shouldRefreshMemory(options: {
    client: Client;
    recentMessagesCount: number;
    latestUserMessage: string;
    force?: boolean;
  }): boolean {
    const { client, recentMessagesCount, latestUserMessage, force = false } = options;
    if (force) return true;

    // Total aproximado na janela atual (+2 pela interação recém-concluída)
    const windowTotal = recentMessagesCount + 2;
    const existingMemory = this.extractClientMemory(client);
    const hasSubstantialDetail = (latestUserMessage || '').trim().length >= 100;

    // Primeira síntese a partir de 4 mensagens na conversa (ou relato longo já de cara)
    if (!existingMemory) {
      return windowTotal >= 4 || (windowTotal >= 2 && hasSubstantialDetail);
    }

    const prevUpdatedAt = client.metadata?.memory_updated_at
      ? Date.parse(client.metadata.memory_updated_at)
      : 0;
    const prevWindowCount = Number(client.metadata?.memory_window_count || 0);

    // Se passaram mais de 15 minutos desde a última síntese ou acumulou >= 4 novas mensagens
    const elapsedMs = prevUpdatedAt ? Date.now() - prevUpdatedAt : Number.MAX_SAFE_INTEGER;
    if (elapsedMs >= 15 * 60 * 1000) return true;
    if (Math.abs(windowTotal - prevWindowCount) >= 4) return true;
    if (hasSubstantialDetail && elapsedMs >= 2 * 60 * 1000) return true;

    return false;
  }

  /**
   * Registra/mescla o resumo inicial da triagem (`convert_lead`) sem apagar fatos anteriores já existentes.
   */
  async recordLeadTriageMemory(
    tenantId: string,
    clientId: string,
    triageBlock: string
  ): Promise<boolean> {
    try {
      const { data: current } = await supabase
        .from('clients')
        .select('metadata')
        .eq('id', clientId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const existing = typeof current?.metadata?.memory_summary === 'string'
        ? current.metadata.memory_summary.trim()
        : '';

      const combined = existing
        ? existing.includes(triageBlock.trim())
          ? existing
          : `${existing}\n${triageBlock.trim()}`
        : triageBlock.trim();

      return await this.saveClientMemorySummary(tenantId, clientId, combined);
    } catch {
      return false;
    }
  }

  /**
   * Persiste `memory_summary` dentro de `clients.metadata` preservando quaisquer chaves existentes.
   */
  async saveClientMemorySummary(
    tenantId: string,
    clientId: string,
    summary: string,
    windowCount?: number
  ): Promise<boolean> {
    try {
      const { data: current, error: readErr } = await supabase
        .from('clients')
        .select('metadata')
        .eq('id', clientId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (readErr) {
        logger.warn({ error: readErr.message, clientId }, 'Falha ao ler metadata do cliente para salvar memória');
        return false;
      }

      const nextMetadata: Record<string, any> = {
        ...(current?.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
        memory_summary: summary.trim(),
        memory_updated_at: new Date().toISOString(),
      };

      if (typeof windowCount === 'number') {
        nextMetadata.memory_window_count = windowCount;
      }

      const { error: updateErr } = await supabase
        .from('clients')
        .update({
          metadata: nextMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        logger.warn({ error: updateErr.message, clientId }, 'Falha ao gravar memory_summary no cliente');
        return false;
      }

      return true;
    } catch (err: any) {
      logger.error({ err: err.message, clientId }, 'Exceção ao salvar memória de longo prazo do cliente');
      return false;
    }
  }

  /**
   * Gera/atualiza de forma incremental a memória permanente do cliente em background,
   * condensando fatos importantes antes que saiam da janela curta de histórico.
   */
  async refreshClientMemoryInBackground(options: RefreshMemoryOptions): Promise<string | null> {
    const {
      tenantId,
      client,
      recentMessages,
      latestUserMessage,
      latestAssistantReply,
      force = false,
    } = options;

    if (!client?.id) return null;

    if (
      !this.shouldRefreshMemory({
        client,
        recentMessagesCount: recentMessages.length,
        latestUserMessage,
        force,
      })
    ) {
      return null;
    }

    try {
      const previousMemory = this.extractClientMemory(client);

      const transcriptLines = [
        ...recentMessages.map((m) => {
          const speaker =
            m.role === 'user'
              ? 'Cliente'
              : m.role === 'admin'
                ? 'Atendente Humano'
                : 'Assistente';
          return `${speaker}: ${m.content}`;
        }),
        `Cliente: ${latestUserMessage}`,
        `Assistente: ${latestAssistantReply}`,
      ].join('\n');

      const model = this.genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
        systemInstruction:
          'Você é um sintetizador de memória de CRM. Sua única tarefa é manter uma ficha factual ultra-concisa ' +
          'sobre o cliente com base na memória anterior e no diálogo recente.\n' +
          'Regras estritas:\n' +
          '1. NUNCA invente informações que não foram ditas.\n' +
          '2. PRESERVE fatos permanentes importantes da Memória Anterior (datas, empresas, modelos, valores, área jurídica, familiares, provas) mesmo que não apareçam nas mensagens recentes.\n' +
          '3. Escreva no máximo 5 tópicos curtos iniciados por "• " cobrindo apenas o que já se sabe: Perfil/Identificação, Demanda/Assunto, Fatos Relevantes Relatados e Próximo Passo/Pendência.\n' +
          '4. Sem introduções nem conclusões — retorne APENAS os tópicos.',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 350,
        },
      });

      const prompt =
        `[MEMÓRIA ANTERIOR DO CLIENTE]\n` +
        `${previousMemory || 'Nenhuma memória registrada ainda.'}\n\n` +
        `[DIÁLOGO RECENTE]\n` +
        `${transcriptLines}\n\n` +
        `Gere a ficha atualizada de memória permanente:`;

      const result = await model.generateContent(prompt);
      const summary = (result.response.text() || '').trim();

      if (!summary) return null;

      await this.saveClientMemorySummary(
        tenantId,
        client.id,
        summary,
        recentMessages.length + 2
      );

      logger.debug({ clientId: client.id }, 'Memória episódica de longo prazo do cliente atualizada');
      return summary;
    } catch (err: any) {
      logger.warn({ err: err.message, clientId: client.id }, 'Falha não-bloqueante ao atualizar memória do cliente');
      return null;
    }
  }
}

export const memoryService = new MemoryService();
