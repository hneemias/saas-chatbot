-- ============================================================================
-- MIGRAÇÃO E FUNÇÃO VETORIAL (RAG DUPLO: ESCRITÓRIO + DOSSIÊ DO CLIENTE)
-- Compatível com gemini-embedding-001 (1536 dimensões MRL) + pgvector HNSW
-- Execute este script no SQL Editor do Supabase.
-- ============================================================================

-- 1. Garante extensão pgvector ativa
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Cria tabela knowledge_base caso ainda não exista
CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NULL REFERENCES clients(id) ON DELETE CASCADE,
  doc_title text NULL,
  visible_to_client boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Migração idempotente caso a tabela já exista no projeto
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS client_id uuid NULL REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS doc_title text NULL,
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Documentos institucionais antigos (sem client_id) permanecem visíveis para a Karol por padrão
-- caso não tenham marcação explícita em metadata->>'internal_only'
UPDATE knowledge_base
SET visible_to_client = true
WHERE client_id IS NULL
  AND COALESCE((metadata->>'internal_only')::boolean, false) = false;

-- 4. Índices de performance e isolamento multitenant
CREATE INDEX IF NOT EXISTS idx_knowledge_base_scope
  ON knowledge_base (tenant_id, client_id, visible_to_client);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_hnsw
  ON knowledge_base USING hnsw (embedding vector_cosine_ops);

-- 5. Remove assinaturas antigas se existirem para evitar ambiguidade de overload
DROP FUNCTION IF EXISTS match_knowledge_base(vector, uuid, int, float);
DROP FUNCTION IF EXISTS match_knowledge_base(vector, uuid, uuid, boolean, int, float);

-- 6. Função RPC Zero-Trust para busca híbrida (Escritório + Dossiê do Cliente)
CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding vector(1536),
  filter_tenant_id uuid,
  filter_client_id uuid DEFAULT NULL,
  only_visible_to_client boolean DEFAULT true,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.40
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  doc_title text,
  visible_to_client boolean,
  content text,
  metadata jsonb,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.client_id,
    kb.doc_title,
    kb.visible_to_client,
    kb.content,
    kb.metadata,
    kb.updated_at,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.tenant_id = filter_tenant_id
    AND kb.embedding IS NOT NULL
    -- Controle de visibilidade:
    -- Se only_visible_to_client = true (Karol / Cliente), exige visible_to_client = true
    -- e restringe estritamente a documentos do escritório (client_id IS NULL)
    -- ou documentos liberados DESTE exato cliente (client_id = filter_client_id).
    AND (
      CASE
        WHEN only_visible_to_client THEN
          kb.visible_to_client = true
          AND (
            kb.client_id IS NULL
            OR (filter_client_id IS NOT NULL AND kb.client_id = filter_client_id)
          )
        ELSE
          -- Equipe interna / Atlas: enxerga documentos públicos e internos.
          -- Se filtrar por um cliente específico, traz o dossiê daquele cliente + institucional.
          (
            filter_client_id IS NULL
            OR kb.client_id = filter_client_id
            OR kb.client_id IS NULL
          )
      END
    )
    AND 1 - (kb.embedding <=> query_embedding) >= match_threshold
  ORDER BY
    -- Pequeno desempate priorizando documento específico do cliente quando a relevância for muito próxima
    (CASE WHEN filter_client_id IS NOT NULL AND kb.client_id = filter_client_id THEN 0.03 ELSE 0 END)
    + (1 - (kb.embedding <=> query_embedding)) DESC
  LIMIT match_count;
END;
$$;
