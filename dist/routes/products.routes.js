import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { productService } from '../services/product.service.js';
import { logger } from '../utils/logger.js';
export const productsRouter = Router();
function requireAdminAuth(req, res, next) {
    if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.trim() === '') {
        next();
        return;
    }
    const headerKey = req.header('x-api-key');
    const bearerHeader = req.header('authorization');
    const bearerToken = bearerHeader?.startsWith('Bearer ')
        ? bearerHeader.slice('Bearer '.length).trim()
        : undefined;
    const provided = headerKey || bearerToken;
    if (!provided || provided !== env.ADMIN_API_KEY) {
        res.status(401).json({ error: 'Não autorizado.' });
        return;
    }
    next();
}
productsRouter.use(requireAdminAuth);
const bulkImportSchema = z.object({
    tenantId: z.string().uuid(),
    items: z
        .array(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        category: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        price: z.number(),
        stock_quantity: z.number(),
        image_urls: z.array(z.string()).optional(),
        active: z.boolean().optional(),
    }))
        .min(1)
        .max(10000),
});
productsRouter.post('/bulk-import', async (req, res) => {
    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Dados inválidos na importação.', details: parsed.error.flatten() });
        return;
    }
    try {
        const stats = await productService.bulkUpsertProducts(parsed.data.tenantId, parsed.data.items);
        res.json({ success: true, ...stats });
    }
    catch (err) {
        logger.error({ err: err.message }, 'Erro em POST /api/products/bulk-import');
        res.status(400).json({ error: err.message });
    }
});
productsRouter.post('/search', async (req, res) => {
    const schema = z.object({
        tenantId: z.string().uuid(),
        query: z.string().optional().default(''),
        onlyInStock: z.boolean().optional().default(true),
        maxPrice: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Parâmetros inválidos.' });
        return;
    }
    try {
        const data = await productService.searchProducts(parsed.data);
        res.json({ count: data.length, data });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
