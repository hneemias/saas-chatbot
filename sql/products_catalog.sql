-- ============================================================================
-- CATÁLOGO DE PRODUTOS HÍBRIDO (BUSCA INSTANTÂNEA PG_TRGM + VETORIAL GEMINI 1536d)
-- Execute este script no SQL Editor do Supabase. Ele é 100% idempotente.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Tabela de Produtos por Empresa (chave única: tenant_id + sku)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  search_text TEXT NOT NULL DEFAULT '',
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)
);

-- 2. Índices de Alta Performance (mesmo com dezenas de milhares de itens)
CREATE INDEX IF NOT EXISTS idx_products_tenant_stock
  ON public.products (tenant_id, active, stock_quantity DESC, price ASC);

CREATE INDEX IF NOT EXISTS idx_products_search_trgm
  ON public.products USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
  ON public.products USING hnsw (embedding vector_cosine_ops);

-- 3. Segurança RLS (acesso via Service Role do Backend e Admin Panel)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 4. RPC de Busca Semântica Híbrida (fallback inteligente por significado)
DROP FUNCTION IF EXISTS public.match_products(vector(1536), uuid, boolean, numeric, int, float);

CREATE OR REPLACE FUNCTION public.match_products(
  query_embedding vector(1536),
  p_tenant_id uuid,
  p_only_in_stock boolean DEFAULT true,
  p_max_price numeric DEFAULT NULL,
  match_count int DEFAULT 8,
  match_threshold float DEFAULT 0.42
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  sku text,
  name text,
  category text,
  description text,
  price numeric,
  stock_quantity int,
  image_urls jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.tenant_id,
    p.sku,
    p.name,
    p.category,
    p.description,
    p.price,
    p.stock_quantity,
    p.image_urls,
    (1 - (p.embedding <=> query_embedding))::float AS similarity
  FROM public.products p
  WHERE
    p.tenant_id = p_tenant_id
    AND p.active = true
    AND p.embedding IS NOT NULL
    AND (NOT p_only_in_stock OR p.stock_quantity > 0)
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    AND (1 - (p.embedding <=> query_embedding)) >= match_threshold
  ORDER BY p.embedding <=> query_embedding ASC
  LIMIT LEAST(GREATEST(match_count, 1), 20);
END;
$$;
