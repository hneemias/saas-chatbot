import { describe, it, expect } from 'vitest';
import { compileSystemPrompt, migrateLegacyN8nExpressions } from '../src/utils/prompt-compiler.js';
import { messageService } from '../src/services/message.service.js';
import { memoryService } from '../src/services/memory.service.js';
import { ragService } from '../src/services/rag.service.js';
import { ttsService } from '../src/services/tts.service.js';

describe('Compilador de Prompts, Multi-Turn Nativo, Memória Episódica, RAG e TTS', () => {
  it('deve injetar <session_context> no rodapé com memória de longo prazo, dossiê liberado e variáveis de identidade', () => {
    const rawPrompt =
      `Você é **{{ agent_name }}**, assistente de **{{ tenant_name }}**.\n` +
      `Copiloto interno: {{ internal_agent_name }}.`;

    const compiled = compileSystemPrompt(rawPrompt, {
      mode: 'external',
      tenantName: 'Hiana Carolina Advocacia',
      externalAgentName: 'Karol',
      internalAgentName: 'Atlas',
      clientName: 'Carlos Eduardo',
      clientStatus: 'active',
      phone: '5564999999999@s.whatsapp.net',
      clientMemorySummary: '• Demanda: BPC/LOAS idoso (67 anos)\n• Relato: Já possui CadÚnico atualizado.',
      clientDocumentsIndex: '- Procuração Assinada (atualizado em 24/11/2026)',
      nativeMultiTurnHistory: true,
    });

    // Topo estático preservado para Cache Implícito de Prefixo do Gemini
    expect(compiled.startsWith('Você é **Karol**, assistente de **Hiana Carolina Advocacia**.')).toBe(true);
    expect(compiled).toContain('Copiloto interno: Atlas.');

    // Envelope automático no rodapé
    expect(compiled).toContain('<session_context>');
    expect(compiled).toContain('Nome Registrado do Cliente: Carlos Eduardo');
    expect(compiled).toContain('Status Atual do Atendimento: active');
    expect(compiled).toContain('• Demanda: BPC/LOAS idoso (67 anos)');
    expect(compiled).toContain('- Procuração Assinada (atualizado em 24/11/2026)');
    expect(compiled.endsWith('</session_context>')).toBe(true);
  });

  it('deve substituir expressões legadas do n8n e parametrizar external_agent_name no Atlas', () => {
    const legacyAtlas =
      `Agente: {{ $node["Início"].json.internal_agent_name }} de {{ $node["Início"].json.tenant_name }}\n` +
      `Não aja como "{{ external_agent_name }}".\n` +
      `Data: {{ $now.toFormat('yyyy-MM-dd') }} {{ $now.toFormat('HH:mm') }} ({{ $now.toFormat('cn') }})\n` +
      `Admin: {{ $('Obter Admin').first().json.name }} - {{ $('É Membro Equipe?').first().json.role }}\n` +
      `Histórico: {{ $('Formatar Histórico IA1').item.json.history_formatted }}`;

    const cleanTemplate = migrateLegacyN8nExpressions(legacyAtlas);
    expect(cleanTemplate).not.toMatch(/\$\(|\$now|\$node/);
    expect(cleanTemplate).toContain('{{ internal_agent_name }}');
    expect(cleanTemplate).toContain('{{ tenant_name }}');

    const compiledAtlas = compileSystemPrompt(cleanTemplate, {
      mode: 'internal',
      agentName: 'Atlas',
      internalAgentName: 'Atlas',
      externalAgentName: 'Lohanna',
      tenantName: 'Eletrotech Accessory',
      adminName: 'Hneemias',
      adminRole: 'admin',
      nativeMultiTurnHistory: true,
    });

    expect(compiledAtlas).toContain('Agente: Atlas de Eletrotech Accessory');
    expect(compiledAtlas).toContain('Não aja como "Lohanna".');
    expect(compiledAtlas).toContain('<session_context>');
    expect(compiledAtlas).toContain('Assistente Externa de Clientes: Lohanna');
  });

  it('deve construir histórico multi-turn Content[] válido para o Gemini SDK cobrindo todos os casos de borda', () => {
    // Caso 1: Histórico vazio
    const emptyTurn = messageService.buildGeminiChatTurns([], 'Bom dia!', 'external');
    expect(emptyTurn.history).toEqual([]);
    expect(emptyTurn.effectiveUserMessage).toBe('Bom dia!');

    // Caso 2: Janela começando por mensagem da IA + múltiplos balões seguidos + intervenção humana + mensagem pendente do cliente no fim
    const edgeMessages = [
      { tenant_id: 't1', phone: 'p1', role: 'assistant' as const, content: 'Oi João, conseguiu os documentos?' },
      { tenant_id: 't1', phone: 'p1', role: 'user' as const, content: 'Consegui sim!' },
      { tenant_id: 't1', phone: 'p1', role: 'assistant' as const, content: 'Perfeito! Pode enviar foto do RG.' },
      { tenant_id: 't1', phone: 'p1', role: 'assistant' as const, content: 'E também do comprovante de endereço.' },
      { tenant_id: 't1', phone: 'p1', role: 'admin' as const, content: 'João, aqui é a Dra. Hiana, pode mandar em PDF também.' },
      { tenant_id: 't1', phone: 'p1', role: 'user' as const, content: 'Estava separando aqui...' },
    ];

    const built = messageService.buildGeminiChatTurns(
      edgeMessages,
      'Pronto, acabei de localizar tudo!',
      'external'
    );

    // 1º item SEMPRE deve ser 'user' (exigência do validateChatHistory do Gemini SDK)
    expect(built.history[0].role).toBe('user');
    // Último item do history SEMPRE deve ser 'model' antes de sendMessage()
    expect(built.history[built.history.length - 1].role).toBe('model');

    // Alternância estrita user <-> model
    for (let i = 1; i < built.history.length; i++) {
      expect(built.history[i].role).not.toBe(built.history[i - 1].role);
    }

    // Múltiplos balões seguidos e intervenção humana mesclados no mesmo turno 'model'
    const lastModelText = (built.history[built.history.length - 1].parts[0] as any).text;
    expect(lastModelText).toContain('Perfeito! Pode enviar foto do RG.');
    expect(lastModelText).toContain('E também do comprovante de endereço.');
    expect(lastModelText).toContain('[Atendente Humano do Escritório]: João, aqui é a Dra. Hiana');

    // Mensagem 'user' pendente no fim do banco foi mesclada na mensagem atual enviada ao sendMessage()
    expect(built.effectiveUserMessage).toBe(
      'Estava separando aqui...\n\nPronto, acabei de localizar tudo!'
    );
  });

  it('deve aplicar throttling inteligente na atualização de memória episódica do cliente', () => {
    const baseClient = {
      id: 'c1',
      tenant_id: 't1',
      phone: '5511999999999@s.whatsapp.net',
      status: 'active',
      created_at: new Date().toISOString(),
      metadata: {},
    };

    // Apenas 1ª mensagem curta ("Oi"): não dispara síntese desnecessária
    expect(
      memoryService.shouldRefreshMemory({
        client: baseClient,
        recentMessagesCount: 0,
        latestUserMessage: 'Oi, bom dia',
      })
    ).toBe(false);

    // A partir de 4 mensagens sem memória prévia: dispara primeira síntese!
    expect(
      memoryService.shouldRefreshMemory({
        client: baseClient,
        recentMessagesCount: 2, // +2 = 4 mensagens totais
        latestUserMessage: 'Trabalhei 5 anos sem registro.',
      })
    ).toBe(true);

    // Se acabou de atualizar agora mesmo e só chegaram +2 mensagens curtas: aguarda
    const freshClient = {
      ...baseClient,
      metadata: {
        memory_summary: '• Trabalhista: 5 anos sem registro',
        memory_updated_at: new Date().toISOString(),
        memory_window_count: 4,
      },
    };
    expect(
      memoryService.shouldRefreshMemory({
        client: freshClient,
        recentMessagesCount: 4, // windowTotal=6 (diferença 2 < 4 e recém-atualizado)
        latestUserMessage: 'Entendi, obrigado',
      })
    ).toBe(false);
  });

  it('deve rotular corretamente mensagens de admin vs assistente no formatador auxiliar', () => {
    const sampleMessages = [
      { tenant_id: 't1', phone: 'p1', role: 'user' as const, content: 'Oi, quero agendar' },
      { tenant_id: 't1', phone: 'p1', role: 'assistant' as const, content: 'Claro! Qual seu nome?' },
      { tenant_id: 't1', phone: 'p1', role: 'admin' as const, content: 'Assumindo atendimento aqui.' },
    ];

    const externalFormatted = messageService.formatHistoryForAgent(
      sampleMessages,
      'Karol',
      'João',
      'external'
    );
    expect(externalFormatted).toBe(
      'João: Oi, quero agendar\nKarol: Claro! Qual seu nome?\nAtendente Humano: Assumindo atendimento aqui.'
    );
  });

  it('deve fatiar documentos extensos em chunks respeitando tamanho máximo e overlap', () => {
    const paragraph = 'Cláusula jurídica detalhada sobre honorários e documentos previdenciários necessários.\n\n';
    const longDoc = paragraph.repeat(40);

    const chunks = ragService.splitDocumentIntoChunks(longDoc, 1000, 150);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000);
    }
  });

  it('deve limpar emojis, markdown e links wa.me para leitura natural no TTS', () => {
    const dirty = '🔥 Olá **Dr. Hneemias**! Veja o contato em wa.me/5511999999999 🚀';
    const clean = ttsService.normalizeTextForSpeech(dirty);
    expect(clean).toBe('Olá Dr. Hneemias! Veja o contato em link do WhatsApp');
  });
});
