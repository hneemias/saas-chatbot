import { SchemaType } from '@google/generative-ai';
import { ragService, RagSearchHit } from '../services/rag.service.js';
import { supabase } from '../integrations/supabase.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

function formatRagHits(results: RagSearchHit[]): string {
  return results
    .map((r, i) => {
      const originLabel =
        r.scope === 'client'
          ? 'DOSSIÊ EXCLUSIVO DESTE CLIENTE'
          : 'BASE INSTITUCIONAL';
      const titlePart = r.docTitle ? ` | Título: "${r.docTitle}"` : '';
      const datePart = r.updatedAt
        ? ` | Atualizado em: ${new Date(r.updatedAt).toLocaleDateString('pt-BR')}`
        : '';
      const visibilityBadge = !r.visibleToClient ? ' | [USO INTERNO DA EQUIPE]' : '';

      return (
        `[Documento ${i + 1} - ${originLabel}${titlePart}${datePart}${visibilityBadge} - Relevância: ${(r.similarity * 100).toFixed(0)}%]:\n` +
        r.content
      );
    })
    .join('\n\n---\n\n');
}

/**
 * Ferramenta RAG para o Agente Externo (Karol - Atendimento a Clientes).
 * Isolamento Zero-Trust: NÃO aceita client_id por argumento da IA.
 * Usa exclusivamente context.clientId autenticado pelo WhatsApp e exige visible_to_client = true.
 */
export const searchKnowledgeBaseTool: AgentTool = {
  declaration: {
    name: 'search_knowledge_base',
    description:
      'Consulta a base de conhecimento institucional (regras, serviços, valores, checklists, políticas) E também os documentos/atualizações liberados especificamente no dossiê deste cliente (certidões, procurações, ordens de serviço ou andamentos).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            'A pergunta, serviço, política, documento ou andamento que deseja pesquisar.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args: { query: string }, context: ToolContext) => {
    logger.info(
      { query: args.query, tenantId: context.tenantId, clientId: context.clientId },
      'Karol executando busca RAG segura (Escritório + Dossiê liberado do cliente)'
    );

    const results = await ragService.searchKnowledgeBase({
      query: args.query,
      tenantId: context.tenantId,
      clientId: context.clientId || null,
      onlyVisibleToClient: true, // Blindagem estrita: apenas documentos liberados ao cliente
      limit: 5,
      threshold: 0.4,
    });

    if (!results || results.length === 0) {
      return {
        found: false,
        message:
          'Nenhuma informação específica ou documento liberado foi encontrado para esta consulta. Responda com cordialidade seguindo as diretrizes da empresa e, se for sobre solicitação ou atendimento em andamento sem informação disponível aqui, ofereça acionar a equipe responsável.',
      };
    }

    return {
      found: true,
      total_results: results.length,
      knowledge: formatRagHits(results),
    };
  },
};

/**
 * Ferramenta RAG para o Agente Interno (Atlas - Advogados / Equipe).
 * Permite consultar toda a base interna e pública do escritório, além do dossiê
 * completo (inclusive documentos privados visible_to_client = false) de qualquer cliente do escritório.
 */
export const internalSearchKnowledgeBaseTool: AgentTool = {
  declaration: {
    name: 'search_knowledge_base',
    description:
      'Consulta a base de conhecimento completa da empresa (pública e interna) e também documentos, ordens de serviço ou atualizações na pasta de clientes específicos.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Assunto, documento, serviço, cláusula ou informação que deseja buscar.',
        },
        client_query: {
          type: SchemaType.STRING,
          description:
            'Opcional: nome ou telefone do cliente caso o integrante da equipe esteja perguntando sobre documentos ou histórico de um cliente específico.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args: { query: string; client_query?: string }, context: ToolContext) => {
    let targetClientId: string | null = null;
    let resolvedClientName: string | null = null;

    if (args.client_query && args.client_query.trim() !== '') {
      const cleanTerm = args.client_query.trim();
      const digits = cleanTerm.replace(/\D/g, '');

      let clientQueryBuilder = supabase
        .from('clients')
        .select('id, name, phone')
        .eq('tenant_id', context.tenantId);

      if (digits.length >= 8) {
        clientQueryBuilder = clientQueryBuilder.ilike('phone', `%${digits}%`);
      } else {
        clientQueryBuilder = clientQueryBuilder.ilike('name', `%${cleanTerm}%`);
      }

      const { data: matchedClients } = await clientQueryBuilder.limit(3);

      if (!matchedClients || matchedClients.length === 0) {
        return {
          found: false,
          message: `Nenhum cliente encontrado com a referência "${cleanTerm}" nesta empresa.`,
        };
      }

      if (matchedClients.length > 1) {
        const list = matchedClients.map((c) => `${c.name || 'Sem nome'} (${c.phone})`).join(', ');
        return {
          found: false,
          message: `Foram encontrados múltiplos clientes para "${cleanTerm}": ${list}. Especifique o nome completo ou telefone.`,
        };
      }

      targetClientId = matchedClients[0].id;
      resolvedClientName = matchedClients[0].name || matchedClients[0].phone;
    }

    logger.info(
      { query: args.query, tenantId: context.tenantId, targetClientId, resolvedClientName },
      'Atlas executando busca RAG interna completa'
    );

    const results = await ragService.searchKnowledgeBase({
      query: args.query,
      tenantId: context.tenantId,
      clientId: targetClientId,
      onlyVisibleToClient: false, // Equipe enxerga documentos públicos e internos
      limit: 6,
      threshold: 0.38,
    });

    if (!results || results.length === 0) {
      return {
        found: false,
        client_matched: resolvedClientName,
        message: targetClientId
          ? `Nenhum documento encontrado na pasta de ${resolvedClientName} ou na base institucional para "${args.query}".`
          : 'Nenhum documento encontrado na base de conhecimento da empresa para esta consulta.',
      };
    }

    return {
      found: true,
      client_matched: resolvedClientName,
      total_results: results.length,
      knowledge: formatRagHits(results),
    };
  },
};
