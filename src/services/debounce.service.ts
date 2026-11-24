import { redis } from '../integrations/redis.js';
import { logger } from '../utils/logger.js';

export class DebounceService {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private DEBOUNCE_WAIT_MS = 4000; // 4 segundos de espera para agrupar mensagens picadas

  /**
   * Acumula mensagens de um mesmo remetente no Redis e aguarda o término do debounce
   */
  async bufferMessage(
    remoteJid: string,
    messageText: string,
    onComplete: (fullMessage: string) => Promise<void>
  ): Promise<void> {
    const bufferKey = `buffer:${remoteJid}`;

    // 1. Adiciona a nova mensagem à lista no Redis
    await redis.rpush(bufferKey, messageText);
    await redis.expire(bufferKey, 120); // Expira em 2 minutos caso ocorra falha

    // 2. Limpa timer anterior para este usuário se houver
    const existingTimer = this.activeTimers.get(remoteJid);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 3. Define novo timer de debounce
    const timer = setTimeout(async () => {
      this.activeTimers.delete(remoteJid);

      try {
        // Busca todas as mensagens acumuladas no Redis
        const messages = await redis.lrange(bufferKey, 0, -1);
        await redis.del(bufferKey);

        if (!messages || messages.length === 0) return;

        const fullMessage = messages.filter(Boolean).join('\n').trim();
        if (fullMessage) {
          logger.info({ remoteJid, count: messages.length }, 'Debounce concluído, processando mensagem agrupada');
          await onComplete(fullMessage);
        }
      } catch (err: any) {
        logger.error({ err: err.message, remoteJid }, 'Erro ao descarregar buffer de debounce');
      }
    }, this.DEBOUNCE_WAIT_MS);

    this.activeTimers.set(remoteJid, timer);
  }
}

export const debounceService = new DebounceService();
