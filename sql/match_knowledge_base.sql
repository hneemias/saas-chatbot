-- Função de busca semântica para RAG com pgvector na tabela knowledge_base
-- Execute este script no SQL Editor do Supabase se desejar que a busca vetorial
-- seja executada diretamente pelo motor do PostgreSQL com indexação HNSW / IVFFlat.

CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding vector,
  filter_tenant_id uuid,
  match_count int DEFAULT 4,
  match_threshold float DEFAULT 0.45
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.tenant_id = filter_tenant_id
    AND 1 - (kb.embedding <=> query_embedding) >= match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
