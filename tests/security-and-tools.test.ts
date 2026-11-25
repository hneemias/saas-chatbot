import { describe, it, expect, vi } from 'vitest';
import { agentTools, toolsDeclarations } from '../src/tools/index.js';
import { searchKnowledgeBaseTool, internalSearchKnowledgeBaseTool } from '../src/tools/search-knowledge-base.js';
import { dailySummaryTool } from '../src/tools/daily-summary.js';
import { updateStatusTool } from '../src/tools/update-status.js';
import { classifyLeadTool } from '../src/tools/classify-lead.js';
import { humanEscalationTool } from '../src/tools/human-escalation.js';
import { notifyTeamTool } from '../src/tools/notify-team.js';
import { searchProductsTool, sendProductPhotoTool } from '../src/tools/products-tools.js';
import { productService } from '../src/services/product.service.js';
import { messageService } from '../src/services/message.service.js';
import { evolutionApi } from '../src/integrations/evolution.js';
import { clientService } from '../src/services/client.service.js';
import { ragService } from '../src/services/rag.service.js';
import { supabase } from '../src/integrations/supabase.js';

describe('Segurança Zero-Trust e Catálogo de Ferramentas', () => {
  it('NÃO deve expor ferramentas administrativas (get_daily_summary, update_client_status) para o Agente Externo (Karol)', () => {
    const toolNames = Object.keys(agentTools);
    const declaredNames = toolsDeclarations.map((d) => d.name);

    expect(toolNames).not.toContain('get_daily_summary');
    expect(toolNames).not.toContain('update_client_status');
    expect(declaredNames).not.toContain('get_daily_summary');
    expect(declaredNames).not.toContain('update_client_status');

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'save_client_name',
        'convert_lead',
        'human_escalation',
        'notify_team',
        'check_calendar',
        'schedule_event',
        'search_knowledge_base',
      ])
    );
  });

  it('NÃO deve permitir que a IA externa passe client_id nos parâmetros de search_knowledge_base', () => {
    const props = (searchKnowledgeBaseTool.declaration.parameters as any)?.properties || {};
    expect(Object.keys(props)).toEqual(['query']);
    expect(props.client_id).toBeUndefined();
    expect(props.clientId).toBeUndefined();

    // Já a ferramenta interna do Atlas possui client_query para os advogados
    const internalProps = (internalSearchKnowledgeBaseTool.declaration.parameters as any)?.properties || {};
    expect(internalProps.client_query).toBeDefined();
  });

  it('deve forçar onlyVisibleToClient=true e o clientId do contexto WhatsApp na busca RAG da Karol', async () => {
    const spy = vi.spyOn(ragService, 'searchKnowledgeBase').mockResolvedValueOnce([
      {
        id: 'doc-1',
        scope: 'client',
        clientId: 'client-uuid-autenticado',
        docTitle: 'Andamento INSS',
        visibleToClient: true,
        content: 'Perícia marcada para 15/12.',
        similarity: 0.88,
      },
    ]);

    const res = await searchKnowledgeBaseTool.execute(
      { query: 'qual a data da minha perícia?' },
      {
        tenantId: 'tenant-1',
        instanceName: 'inst-1',
        phone: '5511999999999@s.whatsapp.net',
        clientId: 'client-uuid-autenticado',
        isInternalTeam: false,
      }
    );

    expect(spy).toHaveBeenCalledWith({
      query: 'qual a data da minha perícia?',
      tenantId: 'tenant-1',
      clientId: 'client-uuid-autenticado',
      onlyVisibleToClient: true,
      limit: 5,
      threshold: 0.4,
    });
    expect(res.found).toBe(true);
    expect(res.knowledge).toContain('DOSSIÊ EXCLUSIVO DESTE CLIENTE');
  });

  it('deve bloquear execução direta de get_daily_summary e update_client_status caso isInternalTeam seja false', async () => {
    const externalCtx = {
      tenantId: 'tenant-1',
      instanceName: 'inst-1',
      phone: '5511999999999@s.whatsapp.net',
      isInternalTeam: false,
    };

    const summaryRes = await dailySummaryTool.execute({}, externalCtx);
    expect(summaryRes.success).toBe(false);

    const statusRes = await updateStatusTool.execute(
      { name_query: 'João', status: 'converted' },
      externalCtx
    );
    expect(statusRes.success).toBe(false);
  });

  it('deve repassar evolutionApiKey do tenant e limpar sufixos @s.whatsapp.net / @lid nas notificações de grupo', async () => {
    vi.spyOn(clientService, 'setStatus').mockResolvedValue(true);
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as any);
    const sendSpy = vi.spyOn(evolutionApi, 'sendTextMessage').mockResolvedValue({ key: { id: 'msg-1' } });

    const ctx = {
      tenantId: 'tenant-1',
      instanceName: 'advocacia_hiana',
      evolutionApiKey: 'custom-tenant-evo-key',
      notificationGroupId: '12036304999999@g.us',
      phone: '5511988887777@lid',
      clientId: 'client-1',
      clientName: 'Maria Silva',
    };

    await classifyLeadTool.execute(
      { summary: 'Aposentadoria rural', area: 'Previdenciário', temperature: '🔥 Quente' },
      ctx
    );
    await humanEscalationTool.execute({ reason: 'Cliente pediu advogado humano' }, ctx);
    await notifyTeamTool.execute({ reason: 'Dúvida sobre alvará' }, ctx);

    expect(sendSpy).toHaveBeenCalledTimes(3);
    for (const call of sendSpy.mock.calls) {
      expect(call[0].apiKey).toBe('custom-tenant-evo-key');
      expect(call[0].remoteJid).toBe('12036304999999@g.us');
      expect(call[0].text).toContain('wa.me/5511988887777');
      expect(call[0].text).not.toContain('@lid');
    }
  });

  it('deve consultar catálogo em search_products e disparar foto real via send_product_photo com proteção anti-eco', async () => {
    vi.spyOn(productService, 'searchProducts').mockResolvedValueOnce([
      {
        id: 'p1',
        tenant_id: 'tenant-1',
        sku: '1050',
        name: 'Teclado Mecânico Redragon Kumara',
        category: 'Periféricos',
        price: 219.9,
        stock_quantity: 4,
        image_urls: ['https://cdn.exemplo.com/1050.jpg'],
      },
    ]);

    const searchRes = await searchProductsTool.execute(
      { query: 'teclado mecânico' },
      {
        tenantId: 'tenant-1',
        instanceName: 'eletrotech',
        phone: '5564999999999@s.whatsapp.net',
      }
    );
    expect(searchRes.found).toBe(true);
    expect(searchRes.products?.[0].sku).toBe('1050');
    expect(searchRes.products?.[0].has_photo).toBe(true);

    vi.spyOn(productService, 'getProductsBySkus').mockResolvedValueOnce([
      {
        id: 'p1',
        tenant_id: 'tenant-1',
        sku: '1050',
        name: 'Teclado Mecânico Redragon Kumara',
        price: 219.9,
        stock_quantity: 4,
        image_urls: ['https://cdn.exemplo.com/1050.jpg'],
      },
    ]);
    const imgSpy = vi.spyOn(evolutionApi, 'sendImageMessage').mockResolvedValueOnce({
      key: { id: 'IMG_MSG_1' },
    });
    vi.spyOn(messageService, 'logMessage').mockResolvedValueOnce();

    const photoRes = await sendProductPhotoTool.execute(
      { skus: ['1050'] },
      {
        tenantId: 'tenant-1',
        instanceName: 'eletrotech',
        evolutionApiKey: 'evo-key',
        phone: '5564999999999@s.whatsapp.net',
        clientId: 'client-1',
      }
    );

    expect(photoRes.success).toBe(true);
    expect(photoRes.sent_count).toBe(1);
    expect(imgSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'eletrotech',
        remoteJid: '5564999999999@s.whatsapp.net',
        imageUrl: 'https://cdn.exemplo.com/1050.jpg',
        apiKey: 'evo-key',
      })
    );
  });
});
