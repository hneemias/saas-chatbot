import { randomUUID } from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { KnowledgeBaseRecord } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface RagSearchHit {
  id: string;
  scope: 'office' | 'client';
  clientId?: string | null;
  docTitle?: string | null;
  visibleToClient: boolean;
  content: string;
  metadata?: Record<string, any>;
  updatedAt?: string | null;
  similarity: number;
}

function isMissingColumnError(message?: string): boolean {
  return /(column .* does not exist|could not find the .* column .* in the schema cache)/i.test(
    message || ''
  );
}

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
  private embeddingModelName = env.GEMINI_EMBEDDING_MODEL;
  private embeddingDimensions = env.GEMINI_EMBEDDING_DIMENSIONS;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  /**
   * Divide documentos grandes (certidões, procurações, manuais) em blocos coesos
   * respeitando quebras de parágrafo/frase com sobreposição contextual (overlap).
   */
  splitDocumentIntoChunks(text: string, maxChunkSize = 1800, overlap = 200): string[] {
    const cleaned = (text || '').replace(/\r\n/g, '\n').trim();
    if (!cleaned) return [];
    if (cleaned.length <= maxChunkSize) return [cleaned];

    const chunks: string[] = [];
    let start = 0;

    while (start < cleaned.length) {
      let end = Math.min(start + maxChunkSize, cleaned.length);

      if (end < cleaned.length) {
        const paragraphBreak = cleaned.lastIndexOf('\n\n', end);
        const lineBreak = cleaned.lastIndexOf('\n', end);
        const sentenceBreak = cleaned.lastIndexOf('. ', end);

        if (paragraphBreak > start + maxChunkSize * 0.5) {
          end = paragraphBreak + 2;
        } else if (lineBreak > start + maxChunkSize * 0.5) {
          end = lineBreak + 1;
        } else if (sentenceBreak > start + maxChunkSize * 0.5) {
          end = sentenceBreak + 2;
        }
      }

      const slice = cleaned.slice(start, end).trim();
      if (slice) {
        chunks.push(slice);
      }

      if (end >= cleaned.length) break;
      start = Math.max(end - overlap, start + 1);
    }

    return chunks;
  }

  /**
   * Gera o vetor de embedding para um texto via Google Gemini (normalizado para MRL / pgvector)
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModelName });
      const result = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        outputDimensionality: this.embeddingDimensions,
      } as any);
      const values = result.embedding.values;
      const norm = Math.sqrt(values.reduce((acc, val) => acc + val * val, 0));
      return norm > 0 ? values.map((v) => v / norm) : values;
    } catch (err: any) {
      logger.error({ err: err.message, textPreview: text.slice(0, 50) }, 'Erro ao gerar embedding com Gemini');
      return null;
    }
  }

  /**
   * Busca semântica (RAG) com isolamento Zero-Trust entre:
   * - Documentos institucionais do escritório (client_id IS NULL)
   * - Dossiê / documentos vinculados ao cliente (client_id = UUID)
   */
  async searchKnowledgeBase(options: {
    query: string;
    tenantId: string;
    clientId?: string | null;
    onlyVisibleToClient?: boolean;
    limit?: number;
    threshold?: number;
  }): Promise<RagSearchHit[]> {
    const {
      query,
      tenantId,
      clientId = null,
      onlyVisibleToClient = true,
      limit = 5,
      threshold = 0.42,
    } = options;

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      // 1. Tenta consulta direta via RPC vetorial no PostgreSQL/Supabase
      if (queryEmbedding) {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('match_knowledge_base', {
            query_embedding: queryEmbedding,
            filter_tenant_id: tenantId,
            filter_client_id: clientId,
            only_visible_to_client: onlyVisibleToClient,
            match_count: limit,
            match_threshold: threshold,
          });

          if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
            logger.info(
              { tenantId, clientId, onlyVisibleToClient, hits: rpcData.length },
              'RAG: Resultados encontrados via RPC Supabase'
            );
            return rpcData.map((r: any) => ({
              id: r.id,
              scope: r.client_id ? 'client' : 'office',
              clientId: r.client_id ?? null,
              docTitle: r.doc_title || r.metadata?.title || null,
              visibleToClient: Boolean(r.visible_to_client),
              content: r.content,
              metadata: r.metadata,
              updatedAt: r.updated_at ?? null,
              similarity: r.similarity ?? 1,
            }));
          }
        } catch {
          // Segue para busca direta caso a função RPC ainda não tenha sido atualizada no banco
        }
      }

      // 2. Fallback seguro direto na tabela knowledge_base aplicando os mesmos filtros Zero-Trust
      const rows = await this.fetchScopedRows({ tenantId, clientId, onlyVisibleToClient });
      if (rows.length === 0) {
        logger.info({ tenantId, clientId, onlyVisibleToClient }, 'RAG: Nenhum documento elegível para o escopo');
        return [];
      }

      // 2.1 Similaridade de cosseno em memória se houver embeddings
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

            const baseSim = rowEmbedding ? cosineSimilarity(queryEmbedding, rowEmbedding) : 0;
            const boost = clientId && row.client_id === clientId ? 0.03 : 0;

            return {
              id: row.id!,
              scope: (row.client_id ? 'client' : 'office') as 'client' | 'office',
              clientId: row.client_id ?? null,
              docTitle: row.doc_title || row.metadata?.title || null,
              visibleToClient: row.visible_to_client ?? (row.client_id ? false : true),
              content: row.content,
              metadata: row.metadata,
              updatedAt: row.updated_at || row.created_at || null,
              similarity: Math.min(1, baseSim + boost),
              rawSimilarity: baseSim,
            };
          })
          .filter((item) => item.rawSimilarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit)
          .map(({ rawSimilarity: _raw, ...hit }) => hit);

        if (scored.length > 0) {
          logger.info({ tenantId, clientId, hits: scored.length }, 'RAG: Resultados por similaridade de cosseno');
          return scored;
        }
      }

      // 2.2 Fallback textual (palavras-chave no título ou conteúdo)
      const queryWords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (queryWords.length === 0) return [];

      const textMatches = rows
        .map((row) => {
          const searchable = `${row.doc_title || ''} ${row.metadata?.title || ''} ${row.content || ''}`.toLowerCase();
          const matchCount = queryWords.filter((w) => searchable.includes(w)).length;
          const sim = matchCount / queryWords.length;

          return {
            id: row.id!,
            scope: (row.client_id ? 'client' : 'office') as 'client' | 'office',
            clientId: row.client_id ?? null,
            docTitle: row.doc_title || row.metadata?.title || null,
            visibleToClient: row.visible_to_client ?? (row.client_id ? false : true),
            content: row.content,
            metadata: row.metadata,
            updatedAt: row.updated_at || row.created_at || null,
            similarity: sim,
          };
        })
        .filter((item) => item.similarity > 0.3)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      logger.info({ tenantId, clientId, hits: textMatches.length }, 'RAG: Resultados por busca textual');
      return textMatches;
    } catch (err: any) {
      logger.error({ err: err.message, tenantId, clientId, query }, 'Erro ao realizar busca RAG');
      return [];
    }
  }

  /**
   * Retorna um índice curto e leve dos títulos/datas de documentos liberados especificamente
   * para este cliente (visible_to_client = true).
   */
  async getClientSharedDocumentsIndex(tenantId: string, clientId?: string | null): Promise<string> {
    if (!clientId) return '';

    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('id, doc_title, metadata, updated_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('visible_to_client', true)
        .order('updated_at', { ascending: false })
        .limit(15);

      if (error || !data || data.length === 0) {
        return '';
      }

      const seenTitles = new Set<string>();
      const lines: string[] = [];

      for (const row of data) {
        const title = (row.doc_title || row.metadata?.title || 'Documento / Atualização do Cliente').trim();
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);

        const rawDate = row.updated_at || row.created_at;
        const formattedDate = rawDate
          ? new Date(rawDate).toLocaleDateString('pt-BR')
          : 'data recente';

        lines.push(`- ${title} (atualizado em ${formattedDate})`);
      }

      return lines.join('\n');
    } catch {
      return '';
    }
  }

  /**
   * Ingere um documento (do escritório ou de um cliente) com chunking automático
   * e geração de embeddings para cada bloco. Ideal para uso direto pelo Admin Panel.
   */
  async ingestDocument(options: {
    tenantId: string;
    content: string;
    docTitle?: string;
    clientId?: string | null;
    visibleToClient?: boolean;
    autoChunk?: boolean;
    metadata?: Record<string, any>;
  }): Promise<{
    docGroupId: string;
    totalChunks: number;
    visibleToClient: boolean;
    records: Omit<KnowledgeBaseRecord, 'embedding'>[];
  }> {
    const {
      tenantId,
      content,
      docTitle,
      clientId = null,
      autoChunk = true,
      metadata = {},
    } = options;

    // Regra segura de visibilidade padrão:
    // - Escritório (sem clientId) => true
    // - Cliente (com clientId) => false (privado até o advogado liberar no Admin Panel)
    const visibleToClient =
      options.visibleToClient !== undefined ? options.visibleToClient : clientId === null;

    const chunks = autoChunk ? this.splitDocumentIntoChunks(content) : [content.trim()];
    if (chunks.length === 0) {
      throw new Error('O conteúdo do documento não pode estar vazio.');
    }

    const docGroupId = metadata.doc_group_id || randomUUID();
    const nowIso = new Date().toISOString();
    const resolvedTitle = docTitle || metadata.title || null;

    const rowsToInsert = await Promise.all(
      chunks.map(async (chunkText, idx) => {
        const textForEmbedding = resolvedTitle ? `${resolvedTitle}\n\n${chunkText}` : chunkText;
        const embedding = await this.generateEmbedding(textForEmbedding);

        return {
          tenant_id: tenantId,
          client_id: clientId,
          doc_title: resolvedTitle,
          visible_to_client: visibleToClient,
          content: chunkText,
          metadata: {
            ...metadata,
            title: resolvedTitle ?? undefined,
            doc_group_id: docGroupId,
            chunk_index: idx,
            total_chunks: chunks.length,
            client_id: clientId ?? undefined,
            visible_to_client: visibleToClient,
          },
          embedding,
          updated_at: nowIso,
        };
      })
    );

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert(rowsToInsert)
      .select('id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, created_at, updated_at');

    if (!error && data) {
      logger.info(
        { tenantId, clientId, visibleToClient, docGroupId, totalChunks: data.length },
        'Documento ingerido na knowledge_base com embeddings'
      );
      return {
        docGroupId,
        totalChunks: data.length,
        visibleToClient,
        records: data as Omit<KnowledgeBaseRecord, 'embedding'>[],
      };
    }

    // Caso o banco ainda não tenha as colunas novas e seja documento institucional, salva no formato legado
    if (error && isMissingColumnError(error.message)) {
      if (clientId) {
        throw new Error(
          'Para vincular documentos a clientes específicos, execute primeiro o script sql/match_knowledge_base.sql no SQL Editor do Supabase.'
        );
      }

      logger.warn('Inserindo documento institucional em schema legado (execute sql/match_knowledge_base.sql)');
      const legacyRows = rowsToInsert.map((r) => ({
        tenant_id: r.tenant_id,
        content: r.content,
        metadata: r.metadata,
        embedding: r.embedding,
      }));

      const legacyInsert = await supabase
        .from('knowledge_base')
        .insert(legacyRows)
        .select('id, tenant_id, content, metadata, created_at');

      if (legacyInsert.error || !legacyInsert.data) {
        throw new Error(legacyInsert.error?.message || 'Erro ao inserir documento na knowledge_base');
      }

      return {
        docGroupId,
        totalChunks: legacyInsert.data.length,
        visibleToClient,
        records: legacyInsert.data as Omit<KnowledgeBaseRecord, 'embedding'>[],
      };
    }

    throw new Error(error?.message || 'Falha ao inserir documento na knowledge_base');
  }

  /**
   * Wrapper unitário retrocompatível
   */
  async addDocument(options: {
    tenantId: string;
    content: string;
    docTitle?: string;
    clientId?: string | null;
    visibleToClient?: boolean;
    metadata?: Record<string, any>;
  }): Promise<KnowledgeBaseRecord | null> {
    try {
      const res = await this.ingestDocument({ ...options, autoChunk: false });
      return (res.records[0] as KnowledgeBaseRecord) || null;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Erro em addDocument');
      return null;
    }
  }

  /**
   * Lista documentos do escritório e/ou de um cliente sem trafegar os vetores pesados
   */
  async listDocuments(options: {
    tenantId: string;
    scope?: 'all' | 'office' | 'client';
    clientId?: string;
    limit?: number;
  }): Promise<Omit<KnowledgeBaseRecord, 'embedding'>[]> {
    const { tenantId, scope = 'all', clientId, limit = 100 } = options;

    let qb = supabase
      .from('knowledge_base')
      .select('id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (scope === 'office') {
      qb = qb.is('client_id', null);
    } else if (scope === 'client') {
      if (clientId) {
        qb = qb.eq('client_id', clientId);
      } else {
        qb = qb.not('client_id', 'is', null);
      }
    } else if (clientId) {
      qb = qb.or(`client_id.is.null,client_id.eq.${clientId}`);
    }

    const { data, error } = await qb;
    if (!error && data) {
      return data as Omit<KnowledgeBaseRecord, 'embedding'>[];
    }

    if (error && isMissingColumnError(error.message)) {
      if (scope === 'client') return [];
      const legacy = await supabase
        .from('knowledge_base')
        .select('id, tenant_id, content, metadata, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return (legacy.data || []) as Omit<KnowledgeBaseRecord, 'embedding'>[];
    }

    throw new Error(error?.message || 'Erro ao listar documentos');
  }

  /**
   * Alterna a visibilidade (visible_to_client) de um documento (ou de todos os chunks do mesmo doc_group_id)
   */
  async setDocumentVisibility(options: {
    tenantId: string;
    id: string;
    visibleToClient: boolean;
    applyToGroup?: boolean;
  }): Promise<Omit<KnowledgeBaseRecord, 'embedding'>[]> {
    const { tenantId, id, visibleToClient, applyToGroup = true } = options;
    const nowIso = new Date().toISOString();

    // Verifica se o id pertence a um grupo de chunks (doc_group_id)
    let groupId: string | null = null;
    if (applyToGroup) {
      const { data: targetRow } = await supabase
        .from('knowledge_base')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      groupId = targetRow?.metadata?.doc_group_id || null;
    }

    let qb = supabase
      .from('knowledge_base')
      .update({ visible_to_client: visibleToClient, updated_at: nowIso })
      .eq('tenant_id', tenantId);

    if (groupId) {
      qb = qb.contains('metadata', { doc_group_id: groupId });
    } else {
      qb = qb.eq('id', id);
    }

    const { data, error } = await qb.select(
      'id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, created_at, updated_at'
    );

    if (error) {
      if (isMissingColumnError(error.message)) {
        throw new Error(
          'Coluna visible_to_client ainda não existe no banco. Execute sql/match_knowledge_base.sql no Supabase.'
        );
      }
      throw new Error(error.message);
    }

    return (data || []) as Omit<KnowledgeBaseRecord, 'embedding'>[];
  }

  /**
   * Atualiza o título, conteúdo ou metadados de um registro e regera o embedding automaticamente se o texto mudar
   */
  async updateDocument(options: {
    tenantId: string;
    id: string;
    docTitle?: string;
    content?: string;
    visibleToClient?: boolean;
    metadata?: Record<string, any>;
  }): Promise<Omit<KnowledgeBaseRecord, 'embedding'> | null> {
    const { tenantId, id, docTitle, content, visibleToClient, metadata } = options;

    const { data: existing, error: findErr } = await supabase
      .from('knowledge_base')
      .select('id, doc_title, content, metadata')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (findErr && isMissingColumnError(findErr.message)) {
      throw new Error('Execute sql/match_knowledge_base.sql no Supabase antes de editar documentos.');
    }
    if (!existing) return null;

    const nextTitle = docTitle !== undefined ? docTitle : existing.doc_title;
    const nextContent = content !== undefined ? content.trim() : existing.content;
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (docTitle !== undefined) updatePayload.doc_title = docTitle;
    if (visibleToClient !== undefined) updatePayload.visible_to_client = visibleToClient;
    if (metadata !== undefined) {
      updatePayload.metadata = { ...(existing.metadata || {}), ...metadata };
    }

    if (content !== undefined || docTitle !== undefined) {
      updatePayload.content = nextContent;
      const textForEmbedding = nextTitle ? `${nextTitle}\n\n${nextContent}` : nextContent;
      updatePayload.embedding = await this.generateEmbedding(textForEmbedding);
    }

    const { data, error } = await supabase
      .from('knowledge_base')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, created_at, updated_at')
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as Omit<KnowledgeBaseRecord, 'embedding'>) || null;
  }

  /**
   * Remove um documento (e opcionalmente todos os seus chunks irmãos do mesmo doc_group_id)
   */
  async deleteDocument(options: {
    tenantId: string;
    id: string;
    deleteGroup?: boolean;
  }): Promise<{ deletedCount: number }> {
    const { tenantId, id, deleteGroup = true } = options;

    let groupId: string | null = null;
    if (deleteGroup) {
      const { data: targetRow } = await supabase
        .from('knowledge_base')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      groupId = targetRow?.metadata?.doc_group_id || null;
    }

    let qb = supabase.from('knowledge_base').delete().eq('tenant_id', tenantId);
    if (groupId) {
      qb = qb.contains('metadata', { doc_group_id: groupId });
    } else {
      qb = qb.eq('id', id);
    }

    const { data, error } = await qb.select('id');
    if (error) throw new Error(error.message);

    return { deletedCount: data ? data.length : 0 };
  }

  /**
   * Busca linhas elegíveis respeitando estritamente o isolamento de escopo,
   * com fallback caso o banco ainda esteja no schema legado sem client_id.
   */
  private async fetchScopedRows(params: {
    tenantId: string;
    clientId: string | null;
    onlyVisibleToClient: boolean;
  }): Promise<KnowledgeBaseRecord[]> {
    const { tenantId, clientId, onlyVisibleToClient } = params;

    let queryBuilder = supabase
      .from('knowledge_base')
      .select('id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, embedding, created_at, updated_at')
      .eq('tenant_id', tenantId);

    if (onlyVisibleToClient) {
      queryBuilder = queryBuilder.eq('visible_to_client', true);
      if (clientId) {
        queryBuilder = queryBuilder.or(`client_id.is.null,client_id.eq.${clientId}`);
      } else {
        queryBuilder = queryBuilder.is('client_id', null);
      }
    } else if (clientId) {
      queryBuilder = queryBuilder.or(`client_id.is.null,client_id.eq.${clientId}`);
    }

    const { data, error } = await queryBuilder;

    if (!error && data) {
      return data as KnowledgeBaseRecord[];
    }

    if (error && isMissingColumnError(error.message)) {
      logger.warn('Schema legado detectado em knowledge_base; execute sql/match_knowledge_base.sql no Supabase');
      const legacy = await supabase
        .from('knowledge_base')
        .select('id, tenant_id, content, metadata, embedding, created_at')
        .eq('tenant_id', tenantId);

      return (legacy.data || []) as KnowledgeBaseRecord[];
    }

    return [];
  }
}

export const ragService = new RagService();
