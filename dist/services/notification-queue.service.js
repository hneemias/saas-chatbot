import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { evolutionApi } from '../integrations/evolution.js';
import { logger } from '../utils/logger.js';
class NotificationQueueService {
    batches = new Map();
    genAI;
    constructor() {
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');
    }
    getKey(tenantId, phone) {
        return `${tenantId}:${phone}`;
    }
    /**
     * Adiciona uma notificação na fila. Se já houver uma notificação pendente para o cliente,
     * acumula o contexto e renova o debounce até o limite máximo.
     */
    enqueue(item) {
        const key = this.getKey(item.tenantId, item.phone);
        const existing = this.batches.get(key);
        // Janela de espera: 60s para escalonamento humano urgente, 90s para consultas normais
        const debounceMs = item.type === 'human_escalation' ? 60 * 1000 : 90 * 1000;
        // Tempo máximo acumulado para nunca postergar indefinidamente (ex: 2.5 minutos)
        const maxHoldMs = 150 * 1000;
        if (existing) {
            clearTimeout(existing.timer);
            existing.items.push(item);
            // Se qualquer um dos itens for human_escalation, eleva a urgência de todo o lote
            const hasEscalation = existing.items.some((i) => i.type === 'human_escalation');
            const effectiveDebounce = hasEscalation ? Math.min(debounceMs, 60 * 1000) : debounceMs;
            const elapsed = Date.now() - existing.firstTimestamp;
            const remainingBeforeMax = Math.max(5000, maxHoldMs - elapsed);
            const delay = Math.min(effectiveDebounce, remainingBeforeMax);
            logger.info({ phone: item.phone, itemsCount: existing.items.length, delayMs: delay }, 'Nova notificação agrupada na fila para o cliente. Timer renovado.');
            existing.timer = setTimeout(() => {
                void this.flush(key);
            }, delay);
        }
        else {
            logger.info({ phone: item.phone, type: item.type, delayMs: debounceMs }, 'Notificação enfileirada com debounce aguardando possíveis complementos do cliente.');
            const timer = setTimeout(() => {
                void this.flush(key);
            }, debounceMs);
            this.batches.set(key, {
                timer,
                firstTimestamp: Date.now(),
                items: [item],
            });
        }
    }
    /**
     * Consolida as mensagens acumuladas e envia para o WhatsApp do grupo.
     */
    async flush(key) {
        const batch = this.batches.get(key);
        if (!batch || batch.items.length === 0) {
            this.batches.delete(key);
            return;
        }
        this.batches.delete(key);
        const items = batch.items;
        const firstItem = items[0];
        // Se qualquer item for escalonamento humano, o cabeçalho deve ser de alerta humano
        const isEscalation = items.some((i) => i.type === 'human_escalation');
        const cleanPhone = firstItem.phone.replace(/@(s\.whatsapp\.net|lid)$/i, '');
        const clientLabel = firstItem.clientName || cleanPhone;
        let finalSummary = '';
        if (items.length === 1) {
            // Apenas 1 notificação: usa o resumo direto
            finalSummary = items[0].reason.trim();
        }
        else {
            // 2 ou mais atualizações: consolida de forma coesa e limpa via Gemini Flash
            finalSummary = await this.synthesizeSummary(items);
        }
        // Remove eventuais menções redundantes ao telefone ou cabeçalho no corpo do resumo
        finalSummary = finalSummary
            .replace(new RegExp(`\\(?(telefone|tel)?\\s*(end)?\\s*${cleanPhone.slice(-4)}\\)?`, 'gi'), '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const titleHeader = isEscalation
            ? '🚨 *ALERTA DE ATENDIMENTO HUMANO*'
            : 'ℹ️ *SOLICITAÇÃO DE ACOMPANHAMENTO*';
        const msg = `${titleHeader}\n\n` +
            `👤 *Cliente:* ${clientLabel}\n` +
            `📱 *Tel:* ${cleanPhone}\n\n` +
            `*Resumo:* ${finalSummary}\n\n` +
            `Link direto: wa.me/${cleanPhone}`;
        try {
            await evolutionApi.sendTextMessage({
                instanceName: firstItem.instanceName,
                remoteJid: firstItem.notificationGroupId,
                text: msg,
                apiKey: firstItem.evolutionApiKey,
            });
            logger.info({ phone: firstItem.phone, isEscalation, itemsConsolidated: items.length }, 'Notificação consolidada enviada para o grupo da equipe com sucesso.');
        }
        catch (err) {
            logger.error({ err: err?.message, phone: firstItem.phone }, 'Falha ao disparar notificação consolidada para o grupo da equipe');
        }
    }
    /**
     * Consolida múltiplos relatos fragmentados em um único texto contínuo, objetivo e elegante.
     */
    async synthesizeSummary(items) {
        const rawList = items
            .map((it, idx) => `Ponto ${idx + 1}: ${it.reason}`)
            .join('\n');
        try {
            const model = this.genAI.getGenerativeModel({
                model: 'gemini-flash-lite-latest',
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 250,
                },
            });
            const prompt = `Você é um assistente encarregado de consolidar múltiplos pontos de notificação de um mesmo cliente em UM ÚNICO resumo objetivo e fluido para a equipe interna.
      
Regras ESTRITAS:
1. Junte todos os fatos (ex: problema do equipamento, pedido de visita e endereço) em 1 ou no máximo 2 frases contínuas e coesas.
2. NUNCA mencione o número de telefone, final de telefone ou link (pois já existem no cabeçalho fixo).
3. Seja direto e profissional.

Pontos informados pelo cliente:
${rawList}

Responda APENAS com o texto consolidado final, sem aspas, títulos ou introduções.`;
            const res = await model.generateContent(prompt);
            const text = res.response.text()?.trim();
            if (text)
                return text;
        }
        catch (err) {
            logger.warn({ err: err?.message }, 'Falha na sintetização via Gemini; unindo pontos com separador');
        }
        // Fallback caso a API de IA oscile
        return items.map((i) => i.reason.trim()).join('. ');
    }
}
export const notificationQueue = new NotificationQueueService();
