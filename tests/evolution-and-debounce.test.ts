import { describe, it, expect, vi } from 'vitest';
import { EvolutionApiClient } from '../src/integrations/evolution.js';
import { DebounceService } from '../src/services/debounce.service.js';
import { redis } from '../src/integrations/redis.js';
import {
  normalizeWhatsAppJid,
  getCanonicalPhoneKey,
  getEquivalentPhoneJids,
} from '../src/utils/phone.js';

describe('Proteção Anti-Eco Evolution API (Handover Loop Fix)', () => {
  it('deve reconhecer mensagem enviada pelo próprio bot (por texto e por messageId) e NÃO confundir com atendente humano', async () => {
    const client = new EvolutionApiClient();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ key: { id: 'BOT_MSG_ID_123' } }), { status: 200 })
    );

    await client.sendTextMessage({
      instanceName: 'Hneemias',
      remoteJid: '5511999990000@s.whatsapp.net',
      text: 'Olá! Sou a Karol, assistente virtual.',
      apiKey: 'tenant-key',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 1. Reconhece pelo ID da mensagem retornado pela Evolution API
    expect(
      client.wasRecentlySentByBot({
        instanceName: 'Hneemias',
        remoteJid: '5511999990000@s.whatsapp.net',
        messageId: 'BOT_MSG_ID_123',
      })
    ).toBe(true);

    // 2. Mensagem diferente digitada manualmente pelo advogado no WhatsApp Web NÃO é marcada como bot
    expect(
      client.wasRecentlySentByBot({
        instanceName: 'Hneemias',
        remoteJid: '5511999990000@s.whatsapp.net',
        messageId: 'HUMAN_WEB_MSG_999',
        text: 'Oi João, aqui é o Dr. Hneemias assumindo seu caso!',
      })
    ).toBe(false);
  });

  it('deve reconhecer o eco mesmo se o webhook chegar ANTES do retorno HTTP do fetch (race condition)', () => {
    const client = new EvolutionApiClient();
    client.markOutgoingBotMessage({
      instanceName: 'teste',
      remoteJid: '5511988887777@s.whatsapp.net',
      text: 'Mensagem em trânsito',
    });

    expect(
      client.wasRecentlySentByBot({
        instanceName: 'teste',
        remoteJid: '5511988887777@s.whatsapp.net',
        messageId: 'UNKNOWN_YET',
        text: 'Mensagem   em trânsito ',
      })
    ).toBe(true);
  });
});

describe('DebounceService Multitenant & Fallback em Memória', () => {
  it('deve agrupar mensagens picadas do mesmo cliente e isolar buffers entre tenants diferentes', async () => {
    // Simula Redis offline para exercitar também o fallback em memória sem dependência externa
    vi.spyOn(redis, 'rpush').mockRejectedValue(new Error('ECONNREFUSED'));

    const fastDebounce = new DebounceService(40);
    const resultsA: string[] = [];
    const resultsB: string[] = [];

    const samePhone = '5511977776666@s.whatsapp.net';

    await fastDebounce.bufferMessage(`tenant-A:${samePhone}`, 'Oi', async (msg) => {
      resultsA.push(msg);
    });
    await fastDebounce.bufferMessage(`tenant-A:${samePhone}`, 'Preciso de ajuda com INSS', async (msg) => {
      resultsA.push(msg);
    });

    // Mesmo telefone falando simultaneamente com outro escritório (tenant-B)
    await fastDebounce.bufferMessage(`tenant-B:${samePhone}`, 'Boa tarde, sobre divórcio', async (msg) => {
      resultsB.push(msg);
    });

    await new Promise((r) => setTimeout(r, 90));

    expect(resultsA).toEqual(['Oi\nPreciso de ajuda com INSS']);
    expect(resultsB).toEqual(['Boa tarde, sobre divórcio']);
  });
});

describe('Normalização e Deduplicação de Telefone / JID Brasileiro', () => {
  it('deve remover sufixo multi-device (:device) e unificar chave canônica com/sem 9º dígito', () => {
    expect(normalizeWhatsAppJid('556496063283:14@s.whatsapp.net')).toBe(
      '556496063283@s.whatsapp.net'
    );
    expect(normalizeWhatsAppJid('64996063283')).toBe('5564996063283@s.whatsapp.net');

    // Mesma chave canônica com ou sem o 9º dígito
    expect(getCanonicalPhoneKey('556496063283@s.whatsapp.net')).toBe('556496063283');
    expect(getCanonicalPhoneKey('5564996063283@s.whatsapp.net')).toBe('556496063283');

    const variants = getEquivalentPhoneJids('556496063283@s.whatsapp.net');
    expect(variants).toContain('556496063283@s.whatsapp.net');
    expect(variants).toContain('5564996063283@s.whatsapp.net');
  });
});
