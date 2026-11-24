import { SchemaType } from '@google/generative-ai';
import { ragService } from '../services/rag.service.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

export const searchKnowledgeBaseTool: AgentTool = {
  declaration: {
    name: 'search_knowledge_base',
    description: 'Consulta a base de conhecimento jurídica e institucional do escritório (RAG). Use sempre que o cliente ou advogado fizer perguntas sobre teses jurídicas, documentos necessários para entrar com processo, regras de atendimento, valores de consulta ou diretrizes do escritório.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'A pergunta, assunto ou termo jurídico que deseja pesquisar na base de conhecimento.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args: { query: string }, context: ToolContext) => {
    logger.info({ query: args.query, tenantId: context.tenantId }, 'Executando busca RAG na base de conhecimento');

    const results = await ragService.searchKnowledgeBase({
      query: args.query,
      tenantId: context.tenantId,
      limit: 4,
      threshold: 0.45,
    });

    if (!results || results.length === 0) {
      return {
        found: false,
        message: 'Nenhuma informação específica encontrada na base de conhecimento para essa consulta. Responda com as diretrizes gerais de acolhimento do escritório.',
      };
    }

    const compiledKnowledge = results
      .map((r, i) => `[Documento ${i + 1} - Relevância: ${(r.similarity * 100).toFixed(0)}%]:\n${r.content}`)
      .join('\n\n---\n\n');

    return {
      found: true,
      total_results: results.length,
      knowledge: compiledKnowledge,
    };
  },
};
