import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from '../src/server.js';
import { env } from '../src/config/env.js';
import { ragService } from '../src/services/rag.service.js';
import { tenantService } from '../src/services/tenant.service.js';
import { teamService } from '../src/services/team.service.js';
import { clientService } from '../src/services/client.service.js';
import { messageService } from '../src/services/message.service.js';
import { evolutionApi } from '../src/integrations/evolution.js';

describe('Integração HTTP: Rotas /api/knowledge e /webhook/evolution', () => {
  let server: Server;
  let baseUrl: string;
  const sampleTenantId = '43da620a-bfb1-4ebc-95b0-1b246a7ce5e0';

  beforeEach(async () => {
    const app = createServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    env.ADMIN_API_KEY = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /health deve responder 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('deve exigir x-api-key em /api/knowledge quando ADMIN_API_KEY estiver configurada', async () => {
    env.ADMIN_API_KEY = 'segredo-painel-123';
    vi.spyOn(ragService, 'listDocuments').mockResolvedValue([]);

    const unauth = await fetch(`${baseUrl}/api/knowledge?tenantId=${sampleTenantId}`);
    expect(unauth.status).toBe(401);

    const auth = await fetch(`${baseUrl}/api/knowledge?tenantId=${sampleTenantId}`, {
      headers: { 'x-api-key': 'segredo-painel-123' },
    });
    expect(auth.status).toBe(200);
    const json = await auth.json();
    expect(json.count).toBe(0);
  });

  it('POST /webhook/evolution deve ignorar eventos diferentes de messages.upsert e ecos do próprio bot', async () => {
    const getTenantSpy = vi.spyOn(tenantService, 'getByInstanceName').mockResolvedValue({
      tenant: {
        id: sampleTenantId,
        name: 'Escritório Teste',
        evolution_instance_name: 'inst_teste',
        evolution_api_key: 'evo-key',
        subscription_status: 'active',
      },
      config: {
        tenant_id: sampleTenantId,
        external_agent_name: 'Karol',
      },
    });
    const setStatusSpy = vi.spyOn(clientService, 'setStatus').mockResolvedValue(true);

    // 1. Evento messages.update (confirmação de leitura) deve ser ignorado antes mesmo de consultar o banco
    await fetch(`${baseUrl}/webhook/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'messages.update',
        instance: 'inst_teste',
        data: { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: '1' }, messageType: 'conversation' },
      }),
    });
    expect(getTenantSpy).not.toHaveBeenCalled();

    // 2. Eco de mensagem enviada pelo próprio bot (fromMe: true) NÃO deve pausar o cliente
    evolutionApi.markOutgoingBotMessage({
      instanceName: 'inst_teste',
      remoteJid: '5511999999999@s.whatsapp.net',
      messageId: 'ECHO_ID_77',
      text: 'Resposta da Karol',
    });

    await fetch(`${baseUrl}/webhook/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'inst_teste',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'ECHO_ID_77' },
          messageType: 'conversation',
          message: { conversation: 'Resposta da Karol' },
        },
      }),
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(setStatusSpy).not.toHaveBeenCalled();
  });

  it('POST /webhook/evolution deve pausar o cliente e gravar role=admin quando um atendente humano real responde', async () => {
    vi.spyOn(tenantService, 'getByInstanceName').mockResolvedValue({
      tenant: {
        id: sampleTenantId,
        name: 'Escritório Teste',
        evolution_instance_name: 'inst_teste',
        evolution_api_key: 'evo-key',
        subscription_status: 'active',
      },
      config: { tenant_id: sampleTenantId },
    });
    vi.spyOn(teamService, 'getMember').mockResolvedValue(null);
    vi.spyOn(clientService, 'getOrCreate').mockResolvedValue({
      id: 'client-1',
      tenant_id: sampleTenantId,
      phone: '5511988881111@s.whatsapp.net',
      status: 'active',
      created_at: new Date().toISOString(),
    });
    const setStatusSpy = vi.spyOn(clientService, 'setStatus').mockResolvedValue(true);
    const logSpy = vi.spyOn(messageService, 'logMessage').mockResolvedValue();

    await fetch(`${baseUrl}/webhook/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'inst_teste',
        data: {
          key: { remoteJid: '5511988881111@s.whatsapp.net', fromMe: true, id: 'HUMAN_MSG_1' },
          messageType: 'conversation',
          message: { conversation: 'Olá, aqui é a Dra. Hiana assumindo seu atendimento!' },
        },
      }),
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(setStatusSpy).toHaveBeenCalledWith('5511988881111@s.whatsapp.net', sampleTenantId, 'paused');
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        content: 'Olá, aqui é a Dra. Hiana assumindo seu atendimento!',
      })
    );
  });
});
