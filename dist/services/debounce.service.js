import { redis } from '../integrations/redis.js';
import { logger } from '../utils/logger.js';
export class DebounceService {
    activeTimers = new Map();
    memoryBuffers = new Map();
    debounceWaitMs;
    constructor(waitMs = 4000) {
        this.debounceWaitMs = waitMs;
    }
    /**
     * Acumula mensagens de um mesmo escopo (`tenantId:remoteJid`) no Redis
     * (com fallback automático em memória se Redis estiver offline)
     */
    async bufferMessage(scopeKey, messageText, onComplete) {
        const bufferKey = `buffer:${scopeKey}`;
        let usedMemoryFallback = false;
        try {
            await redis.rpush(bufferKey, messageText);
            await redis.expire(bufferKey, 120);
        }
        catch {
            usedMemoryFallback = true;
            const list = this.memoryBuffers.get(scopeKey) || [];
            list.push(messageText);
            this.memoryBuffers.set(scopeKey, list);
        }
        const existingTimer = this.activeTimers.get(scopeKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(async () => {
            this.activeTimers.delete(scopeKey);
            try {
                let messages = [];
                if (!usedMemoryFallback) {
                    try {
                        messages = await redis.lrange(bufferKey, 0, -1);
                        await redis.del(bufferKey);
                    }
                    catch {
                        messages = this.memoryBuffers.get(scopeKey) || [];
                        this.memoryBuffers.delete(scopeKey);
                    }
                }
                else {
                    messages = this.memoryBuffers.get(scopeKey) || [];
                    this.memoryBuffers.delete(scopeKey);
                }
                if (!messages || messages.length === 0)
                    return;
                const fullMessage = messages.filter(Boolean).join('\n').trim();
                if (fullMessage) {
                    logger.info({ scopeKey, count: messages.length }, 'Debounce concluído, processando mensagem agrupada');
                    await onComplete(fullMessage);
                }
            }
            catch (err) {
                logger.error({ err: err.message, scopeKey }, 'Erro ao descarregar buffer de debounce');
            }
        }, this.debounceWaitMs);
        this.activeTimers.set(scopeKey, timer);
    }
}
export const debounceService = new DebounceService();
