import { supabase } from '../integrations/supabase.js';
import { ragService } from './rag.service.js';
import { logger } from '../utils/logger.js';
/**
 * Mapa de sinônimos comerciais comuns em informática/varejo para ampliar o recall
 * da busca instantânea (< 25ms) mesmo antes de acionar o fallback semântico vetorial.
 */
const SYNONYM_GROUPS = [
    ['headset', 'fone', 'auricular', 'microfone'],
    ['teclado', 'keyboard', 'mecanico', 'mecânico'],
    ['mouse', 'mice', 'sem fio', 'wireless'],
    ['notebook', 'laptop', 'portatil'],
    ['pc', 'computador', 'desktop', 'gabinete', 'cpu'],
    ['monitor', 'tela', 'display', 'hdmi', 'vga'],
    ['ssd', 'nvme', 'm2', 'hd', 'armazenamento'],
    ['memoria', 'memória', 'ram', 'ddr4', 'ddr5'],
    ['fonte', 'carregador', 'atx', 'alimentacao'],
    ['roteador', 'wifi', 'wi-fi', 'rede', 'switch', 'repetidor'],
    ['camera', 'câmera', 'cftv', 'dvr', 'seguranca'],
    ['impressora', 'toner', 'cartucho', 'tinta', 'multifuncional'],
    ['cabo', 'adaptador', 'conversor', 'usb', 'tipo c'],
];
function normalizeAccents(str) {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
export function buildProductSearchText(item) {
    const raw = [item.sku, item.name, item.category || '', item.description || '']
        .filter(Boolean)
        .join(' ');
    return `${raw} ${normalizeAccents(raw)}`.trim();
}
export class ProductService {
    /**
     * Busca Híbrida Ultrarrápida:
     * 1. Busca indexada via PostgreSQL (`pg_trgm` / ILIKE multi-token + expansão de sinônimos) em ~15-30ms;
     * 2. Caso retorne menos de 2 itens, complementa com busca semântica vetorial (`match_products` 1536d).
     */
    async searchProducts(options) {
        const { tenantId, query, onlyInStock = true, maxPrice, limit = 8, } = options;
        const cleanQuery = (query || '').trim();
        if (!cleanQuery) {
            let qb = supabase
                .from('products')
                .select('id, tenant_id, sku, name, category, description, price, stock_quantity, image_urls, active, updated_at')
                .eq('tenant_id', tenantId)
                .eq('active', true)
                .order('stock_quantity', { ascending: false })
                .limit(limit);
            if (onlyInStock)
                qb = qb.gt('stock_quantity', 0);
            if (typeof maxPrice === 'number' && maxPrice > 0)
                qb = qb.lte('price', maxPrice);
            const { data } = await qb;
            return data || [];
        }
        const normQuery = normalizeAccents(cleanQuery);
        const stopWords = new Set([
            'de', 'da', 'do', 'das', 'dos', 'um', 'uma', 'uns', 'umas', 'para', 'pro', 'pra',
            'com', 'sem', 'que', 'qual', 'quais', 'tem', 'voces', 'voce', 'loja', 'preco', 'valor',
        ]);
        const rawTokens = normQuery
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length >= 2 && !stopWords.has(t));
        // Expande termos com sinônimos equivalentes para consulta OR abrangente e pontuação local
        const expandedTerms = new Set(rawTokens.length > 0 ? rawTokens : [normQuery]);
        for (const token of rawTokens) {
            for (const group of SYNONYM_GROUPS) {
                if (group.some((g) => normalizeAccents(g) === token)) {
                    for (const syn of group) {
                        const cleanSyn = normalizeAccents(syn);
                        if (!cleanSyn.includes(' '))
                            expandedTerms.add(cleanSyn);
                    }
                }
            }
        }
        let sqlBuilder = supabase
            .from('products')
            .select('id, tenant_id, sku, name, category, description, price, stock_quantity, image_urls, active, search_text, updated_at')
            .eq('tenant_id', tenantId)
            .eq('active', true);
        if (onlyInStock) {
            sqlBuilder = sqlBuilder.gt('stock_quantity', 0);
        }
        if (typeof maxPrice === 'number' && maxPrice > 0) {
            sqlBuilder = sqlBuilder.lte('price', maxPrice);
        }
        const orClauses = Array.from(expandedTerms)
            .slice(0, 10)
            .map((term) => `search_text.ilike.%${term}%`);
        if (orClauses.length > 0) {
            sqlBuilder = sqlBuilder.or(orClauses.join(','));
        }
        const { data: sqlHits, error: sqlErr } = await sqlBuilder.limit(40);
        if (sqlErr) {
            logger.warn({ error: sqlErr.message, tenantId }, 'Aviso ao buscar produtos via SQL');
        }
        // Pontua relevância priorizando match exato de código, múltiplos tokens da pergunta e itens com foto
        const scored = (sqlHits || []).map((item) => {
            const hay = normalizeAccents(`${item.sku} ${item.name} ${item.category || ''} ${item.description || ''}`);
            let score = 0;
            if (normalizeAccents(item.sku) === normQuery)
                score += 100;
            if (hay.includes(normQuery))
                score += 30;
            for (const tk of rawTokens) {
                if (hay.includes(tk))
                    score += 12;
            }
            for (const syn of expandedTerms) {
                if (!rawTokens.includes(syn) && hay.includes(syn))
                    score += 4;
            }
            if (Array.isArray(item.image_urls) && item.image_urls.length > 0)
                score += 2;
            if (item.stock_quantity > 0)
                score += 3;
            return { item, score };
        });
        scored.sort((a, b) => b.score - a.score || a.item.price - b.item.price);
        const results = scored.slice(0, limit).map((s) => s.item);
        // 2. Fallback Semântico Vetorial apenas se a busca léxica trouxe poucos resultados
        if (results.length < 2 && cleanQuery.length >= 3) {
            try {
                const queryEmbedding = await ragService.generateEmbedding(cleanQuery);
                if (!queryEmbedding)
                    return results;
                const { data: vecHits, error: vecErr } = await supabase.rpc('match_products', {
                    query_embedding: queryEmbedding,
                    p_tenant_id: tenantId,
                    p_only_in_stock: onlyInStock,
                    p_max_price: typeof maxPrice === 'number' && maxPrice > 0 ? maxPrice : null,
                    match_count: limit,
                    match_threshold: 0.42,
                });
                if (!vecErr && Array.isArray(vecHits)) {
                    const seenIds = new Set(results.map((r) => r.id));
                    for (const vh of vecHits) {
                        if (!seenIds.has(vh.id)) {
                            results.push(vh);
                            seenIds.add(vh.id);
                            if (results.length >= limit)
                                break;
                        }
                    }
                }
            }
            catch (vecEx) {
                logger.debug({ err: vecEx?.message }, 'Fallback vetorial de produtos ignorado');
            }
        }
        return results;
    }
    async getProductsBySkus(tenantId, skus) {
        const cleanSkus = (skus || []).map((s) => String(s || '').trim()).filter(Boolean);
        if (cleanSkus.length === 0)
            return [];
        const { data, error } = await supabase
            .from('products')
            .select('id, tenant_id, sku, name, category, description, price, stock_quantity, image_urls, active')
            .eq('tenant_id', tenantId)
            .in('sku', cleanSkus);
        if (error || !data)
            return [];
        return data;
    }
    async listProducts(params) {
        const { tenantId, search, stockFilter = 'all', limit = 10000 } = params;
        const pageSize = 1000;
        const allRows = [];
        let from = 0;
        while (allRows.length < limit) {
            const fetchCount = Math.min(pageSize, limit - allRows.length);
            let qb = supabase
                .from('products')
                .select('id, tenant_id, sku, name, category, description, price, stock_quantity, image_urls, active, updated_at')
                .eq('tenant_id', tenantId)
                .order('name', { ascending: true })
                .range(from, from + fetchCount - 1);
            if (stockFilter === 'in_stock') {
                qb = qb.gt('stock_quantity', 0);
            }
            else if (stockFilter === 'out_of_stock') {
                qb = qb.lte('stock_quantity', 0);
            }
            if (search && search.trim() !== '') {
                const term = normalizeAccents(search.trim());
                qb = qb.ilike('search_text', `%${term}%`);
            }
            const { data, error } = await qb;
            if (error) {
                if (/relation .*products.* does not exist|Could not find the table/i.test(error.message)) {
                    return { data: [], tableMissing: true };
                }
                throw new Error(error.message);
            }
            if (!data || data.length === 0)
                break;
            allRows.push(...data);
            if (data.length < fetchCount)
                break;
            from += fetchCount;
        }
        let items = allRows;
        if (stockFilter === 'with_photo') {
            items = items.filter((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
        }
        return { data: items, tableMissing: false };
    }
    /**
     * Importação em lote de planilha (Upsert por `tenant_id + sku`):
     * - Atualiza preço e estoque instantaneamente;
     * - Preserva `image_urls`, `category` e `embedding` existentes caso o produto já esteja cadastrado!
     */
    async bulkUpsertProducts(tenantId, rows) {
        const dedupBySku = new Map();
        for (const r of rows || []) {
            const sku = String(r.sku || '').trim();
            const name = String(r.name || '').trim();
            if (!sku || !name)
                continue;
            dedupBySku.set(sku, { ...r, sku, name });
        }
        const uniqueRows = Array.from(dedupBySku.values());
        if (uniqueRows.length === 0) {
            return { totalProcessed: 0, newProducts: 0, updatedProducts: 0 };
        }
        // Carrega mapa atual de produtos desta empresa para preservar fotos e vetores existentes
        const existingMap = new Map();
        let from = 0;
        const pageSize = 1000;
        while (true) {
            const { data: page, error: readErr } = await supabase
                .from('products')
                .select('sku, name, category, description, image_urls')
                .eq('tenant_id', tenantId)
                .range(from, from + pageSize - 1);
            if (readErr) {
                throw new Error(`Erro ao consultar catálogo no banco: ${readErr.message}`);
            }
            if (!page || page.length === 0)
                break;
            for (const p of page) {
                existingMap.set(p.sku, p);
            }
            if (page.length < pageSize)
                break;
            from += pageSize;
        }
        const nowIso = new Date().toISOString();
        let newProducts = 0;
        let updatedProducts = 0;
        const skusNeedingEmbedding = [];
        const payloads = uniqueRows.map((item) => {
            const prev = existingMap.get(item.sku);
            if (prev) {
                updatedProducts++;
                if (normalizeAccents(prev.name) !== normalizeAccents(item.name)) {
                    skusNeedingEmbedding.push(item.sku);
                }
            }
            else {
                newProducts++;
                skusNeedingEmbedding.push(item.sku);
            }
            const category = item.category ?? prev?.category ?? null;
            const description = item.description ?? prev?.description ?? null;
            const imageUrls = item.image_urls && item.image_urls.length > 0
                ? item.image_urls
                : prev?.image_urls || [];
            return {
                tenant_id: tenantId,
                sku: item.sku,
                name: item.name,
                category,
                description,
                price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
                stock_quantity: Number.isFinite(Number(item.stock_quantity))
                    ? Math.trunc(Number(item.stock_quantity))
                    : 0,
                image_urls: imageUrls,
                active: item.active ?? true,
                search_text: buildProductSearchText({
                    sku: item.sku,
                    name: item.name,
                    category,
                    description,
                }),
                updated_at: nowIso,
            };
        });
        for (let i = 0; i < payloads.length; i += 400) {
            const batch = payloads.slice(i, i + 400);
            const { error } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'tenant_id,sku' });
            if (error) {
                throw new Error(`Falha ao salvar produtos no banco: ${error.message}`);
            }
        }
        // Gera vetores semânticos em segundo plano apenas para itens novos/renomeados (sem travar a importação!)
        if (skusNeedingEmbedding.length > 0) {
            void this.ensureEmbeddingsInBackground(tenantId, skusNeedingEmbedding.slice(0, 80)).catch((err) => logger.debug({ err: err?.message }, 'Indexação vetorial em segundo plano ignorada'));
        }
        return {
            totalProcessed: payloads.length,
            newProducts,
            updatedProducts,
        };
    }
    async ensureEmbeddingsInBackground(tenantId, skus) {
        if (!skus || skus.length === 0)
            return;
        const { data: items } = await supabase
            .from('products')
            .select('id, sku, name, category, description')
            .eq('tenant_id', tenantId)
            .in('sku', skus);
        for (const item of items || []) {
            try {
                const textToEmbed = [
                    `Produto: ${item.name}`,
                    item.category ? `Categoria: ${item.category}` : '',
                    item.description ? `Detalhes: ${item.description}` : '',
                    `Código: ${item.sku}`,
                ]
                    .filter(Boolean)
                    .join(' | ');
                const embedding = await ragService.generateEmbedding(textToEmbed);
                if (!embedding)
                    continue;
                await supabase
                    .from('products')
                    .update({ embedding })
                    .eq('id', item.id)
                    .eq('tenant_id', tenantId);
            }
            catch {
                // Continua silenciosamente caso exceda cota momentânea
            }
        }
    }
}
export const productService = new ProductService();
