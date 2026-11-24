import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { KnowledgeBaseRecord } from '../types/index.js';
import { logger } from '../utils/logger.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class RagService {
  private genAI: GoogleGenerativeAI;
  private embeddingModelName = 'text-embedding-004';

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  /**
   * Gera o vetor de embedding para um texto via Google Gemini
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModelName });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (err: any) {
      logger.error({ err: err.message, textPreview: text.slice(0, 50) }, 'Erro ao gerar embedding com Gemini');
      return null;
    }
  }

  /**
   * Busca semântica (RAG) na base de conhecimento por proximidade vetorial
   */
  async searchKnowledgeBase(options: {
    query: string;
    tenantId: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{ id: string; content: string; metadata?: any; similarity: number }>> {
    const { query, tenantId, limit = 4, threshold = 0.5 } = options;

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      // 1. Tenta consulta direta via RPC do PostgreSQL/Supabase se existir
      if (queryEmbedding) {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('match_knowledge_base', {
            query_embedding: queryEmbedding,
            filter_tenant_id: tenantId,
            match_count: limit,
            match_threshold: threshold,
          });

          if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
            logger.info({ tenantId, query, hits: rpcData.length }, 'RAG: Resultados encontrados via RPC Supabase');
            return rpcData.map((r: any) => ({
              id: r.id,
              content: r.content,
              metadata: r.metadata,
              similarity: r.similarity || 1,
            }));
          }
        } catch (rpcErr) {
          // Ignora se a function não existir no Postgres e segue para a busca alternativa
        }
      }

      // 2. Busca alternativa direta na tabela knowledge_base do inquilino
      const { data: rows, error } = await supabase
        .from('knowledge_base')
        .select('id, content, metadata, embedding')
        .eq('tenant_id', tenantId);

      if (error || !rows || rows.length === 0) {
        logger.info({ tenantId, query }, 'RAG: Nenhum documento cadastrado na base de conhecimento para este escritório');
        return [];
      }

      // 2.1 Se houver embeddings cadastrados e queryEmbedding gerado, calcula similaridade local
      if (queryEmbedding) {
        const scored = rows
          .map((row) => {
            let rowEmbedding: number[] | null = null;
            if (Array.isArray(row.embedding)) {
              rowEmbedding = row.embedding;
            } else if (typeof row.embedding === 'string') {
              try {
                rowEmbedding = JSON.parse(row.embedding);
              } catch {
                rowEmbedding = null;
              }
            }

            const sim = rowEmbedding ? cosineSimilarity(queryEmbedding, rowEmbedding) : 0;
            return {
              id: row.id,
              content: row.content,
              metadata: row.metadata,
              similarity: sim,
            };
          })
          .filter((item) => item.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        if (scored.length > 0) {
          logger.info({ tenantId, hits: scored.length }, 'RAG: Resultados calculados por similaridade de cosseno');
          return scored;
        }
      }

      // 2.2 Fallback de busca textual caso os documentos ainda não tenham vetores calculados
      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const textMatches = rows
        .map((row) => {
          const contentLower = (row.content || '').toLowerCase();
          const matchCount = queryWords.filter((w) => contentLower.includes(w)).length;
          return {
            id: row.id,
            content: row.content,
            metadata: row.metadata,
            similarity: matchCount > 0 ? matchCount / queryWords.length : 0,
          };
        })
        .filter((item) => item.similarity > 0.3)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      logger.info({ tenantId, hits: textMatches.length }, 'RAG: Resultados encontrados por busca textual');
      return textMatches;
    } catch (err: any) {
      logger.error({ err: err.message, tenantId, query }, 'Erro ao realizar busca RAG na base de conhecimento');
      return [];
    }
  }

  /**
   * Adiciona um novo documento na base de conhecimento já com embedding
   */
  async addDocument(options: {
    tenantId: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<KnowledgeBaseRecord | null> {
    const { tenantId, content, metadata } = options;

    try {
      const embedding = await this.generateEmbedding(content);

      const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
          tenant_id: tenantId,
          content,
          metadata: metadata || {},
          embedding,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error: error.message }, 'Erro ao inserir documento na knowledge_base');
        return null;
      }

      logger.info({ tenantId, docId: data.id }, 'Documento adicionado com sucesso à knowledge_base com embedding');
      return data;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Falha ao salvar documento na base de conhecimento');
      return null;
    }
  }
}

export const ragService = new RagService();
