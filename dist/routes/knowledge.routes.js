import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { ragService } from '../services/rag.service.js';
import { compileSystemPrompt } from '../utils/prompt-compiler.js';
import { logger } from '../utils/logger.js';
export const knowledgeRouter = Router();
/**
 * Middleware de proteção para o Admin Panel.
 * Se ADMIN_API_KEY estiver configurada no .env, exige o header `x-api-key` ou `Authorization: Bearer <key>`.
 */
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
        res.status(401).json({
            error: 'Não autorizado. Informe o header x-api-key válido.',
        });
        return;
    }
    next();
}
knowledgeRouter.use(requireAdminAuth);
const listQuerySchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    scope: z.enum(['all', 'office', 'client']).optional().default('all'),
    clientId: z.string().uuid('clientId inválido').optional(),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 100, 1), 500) : 100)),
});
const createDocumentSchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    clientId: z.string().uuid('clientId inválido').nullable().optional(),
    docTitle: z.string().min(1).max(255).optional(),
    content: z.string().min(1, 'O conteúdo do documento é obrigatório'),
    visibleToClient: z.boolean().optional(),
    autoChunk: z.boolean().optional().default(true),
    metadata: z.record(z.any()).optional(),
});
const toggleVisibilitySchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    visibleToClient: z.boolean(),
    applyToGroup: z.boolean().optional().default(true),
});
const updateDocumentSchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    docTitle: z.string().min(1).max(255).optional(),
    content: z.string().min(1).optional(),
    visibleToClient: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
});
const searchPreviewSchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    query: z.string().min(1, 'Informe a pergunta ou termo de busca'),
    clientId: z.string().uuid('clientId inválido').nullable().optional(),
    mode: z.enum(['client', 'team']).optional().default('client'),
    limit: z.number().int().min(1).max(15).optional().default(3),
    simulateReply: z.boolean().optional().default(true),
});
/**
 * GET /api/knowledge
 * Lista documentos do escritório (`scope=office`), de clientes (`scope=client`) ou ambos (`scope=all`).
 */
knowledgeRouter.get('/', async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() });
        return;
    }
    try {
        const items = await ragService.listDocuments(parsed.data);
        res.json({ count: items.length, data: items });
    }
    catch (err) {
        logger.error({ err: err.message }, 'Erro em GET /api/knowledge');
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/knowledge
 * Cadastra documento institucional (sem clientId) ou no dossiê de um cliente (com clientId),
 * fatiando textos longos automaticamente e gerando embeddings via Gemini.
 */
knowledgeRouter.post('/', async (req, res) => {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
        return;
    }
    try {
        const result = await ragService.ingestDocument(parsed.data);
        res.status(201).json({
            success: true,
            docGroupId: result.docGroupId,
            totalChunks: result.totalChunks,
            visibleToClient: result.visibleToClient,
            data: result.records,
        });
    }
    catch (err) {
        logger.error({ err: err.message }, 'Erro em POST /api/knowledge');
        res.status(400).json({ error: err.message });
    }
});
/**
 * POST /api/knowledge/search
 * Endpoint de simulação para o Admin Panel testar o que a Karol (`mode=client`) ou o Atlas (`mode=team`) enxergam.
 */
knowledgeRouter.post('/search', async (req, res) => {
    const parsed = searchPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
        return;
    }
    try {
        const { tenantId, query, clientId, mode, limit, simulateReply } = parsed.data;
        const hits = await ragService.searchKnowledgeBase({
            tenantId,
            query,
            clientId: clientId || null,
            onlyVisibleToClient: mode === 'client',
            limit,
        });
        let simulatedReply = null;
        let agentName = mode === 'client' ? 'Assistente' : 'Copiloto';
        let highlights = [];
        if (simulateReply) {
            try {
                const [{ data: tenant }, { data: cfg }] = await Promise.all([
                    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
                    supabase
                        .from('tenant_configs')
                        .select('external_agent_name, external_system_prompt, internal_agent_name, internal_system_prompt')
                        .eq('tenant_id', tenantId)
                        .maybeSingle(),
                ]);
                const extName = cfg?.external_agent_name || 'Assistente';
                const intName = cfg?.internal_agent_name || 'Copiloto';
                agentName = mode === 'client' ? extName : intName;
                const basePrompt = mode === 'client'
                    ? cfg?.external_system_prompt || ''
                    : cfg?.internal_system_prompt || '';
                const compiled = compileSystemPrompt(basePrompt, {
                    mode: mode === 'client' ? 'external' : 'internal',
                    tenantName: tenant?.name || 'Empresa',
                    agentName,
                    externalAgentName: extName,
                    internalAgentName: intName,
                    clientName: 'Cliente Teste',
                    clientStatus: 'active',
                    adminName: 'Gestor',
                    adminRole: 'admin',
                    nativeMultiTurnHistory: true,
                });
                const passagesContext = hits.length > 0
                    ? hits
                        .map((h, i) => `[Trecho ${i + 1} - ${h.docTitle || 'Base'}]:\n${h.content}`)
                        .join('\n\n---\n\n')
                    : 'Nenhum trecho específico retornado da base de conhecimento.';
                const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
                const simPrompt = `[SIMULAÇÃO DE TESTE NO PAINEL]\n` +
                    `Pergunta recebida: "${query}"\n\n` +
                    `Trechos recuperados da Base de Conhecimento:\n${passagesContext}\n\n` +
                    `Retorne EXCLUSIVAMENTE um objeto JSON válido com duas propriedades:\n` +
                    `1. "reply": string com a resposta exata e natural que você enviaria agora no WhatsApp seguindo suas instruções e os trechos acima.\n` +
                    `2. "highlights": array com até 4 frases ou trechos CURTOS copiados literalmente (palavra por palavra) dos Trechos recuperados acima que mais fundamentaram sua resposta.`;
                const candidateModels = Array.from(new Set([env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(Boolean)));
                let simRes = null;
                let lastSimErr = null;
                for (const modelName of candidateModels) {
                    try {
                        const model = genAI.getGenerativeModel({
                            model: modelName,
                            systemInstruction: compiled,
                            generationConfig: {
                                temperature: 0.25,
                                maxOutputTokens: 700,
                                responseMimeType: 'application/json',
                            },
                        }, { timeout: 9000 });
                        simRes = await model.generateContent(simPrompt);
                        break;
                    }
                    catch (modelErr) {
                        lastSimErr = modelErr;
                        logger.warn({ model: modelName, err: modelErr?.message }, 'Modelo primário lento ou indisponível na simulação; tentando fallback imediato');
                    }
                }
                if (!simRes && lastSimErr) {
                    throw lastSimErr;
                }
                const rawJson = JSON.parse(simRes?.response.text() || '{}');
                if (typeof rawJson.reply === 'string') {
                    simulatedReply = rawJson.reply.trim();
                }
                if (Array.isArray(rawJson.highlights)) {
                    highlights = rawJson.highlights
                        .map((s) => String(s || '').trim())
                        .filter((s) => s.length >= 8);
                }
            }
            catch (simErr) {
                logger.warn({ err: simErr?.message }, 'Aviso ao gerar resposta simulada no teste de consulta');
            }
        }
        res.json({
            mode,
            agentName,
            simulatedReply,
            highlights,
            count: hits.length,
            data: hits,
        });
    }
    catch (err) {
        logger.error({ err: err.message }, 'Erro em POST /api/knowledge/search');
        res.status(500).json({ error: err.message });
    }
});
/**
 * PATCH /api/knowledge/:id/visibility
 * Liga/desliga o switch "Liberar documento para o cliente via IA (Karol)".
 */
knowledgeRouter.patch('/:id/visibility', async (req, res) => {
    const id = String(req.params.id || '');
    const parsed = toggleVisibilitySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
        return;
    }
    try {
        const updated = await ragService.setDocumentVisibility({
            id,
            ...parsed.data,
        });
        if (updated.length === 0) {
            res.status(404).json({ error: 'Documento não encontrado para este tenantId.' });
            return;
        }
        res.json({
            success: true,
            updatedChunks: updated.length,
            visibleToClient: parsed.data.visibleToClient,
            data: updated,
        });
    }
    catch (err) {
        logger.error({ err: err.message, id }, 'Erro em PATCH /api/knowledge/:id/visibility');
        res.status(400).json({ error: err.message });
    }
});
/**
 * PUT /api/knowledge/:id
 * Edita título, conteúdo ou metadados de um bloco e regera o embedding automaticamente.
 */
knowledgeRouter.put('/:id', async (req, res) => {
    const id = String(req.params.id || '');
    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
        return;
    }
    try {
        const updated = await ragService.updateDocument({
            id,
            ...parsed.data,
        });
        if (!updated) {
            res.status(404).json({ error: 'Documento não encontrado para este tenantId.' });
            return;
        }
        res.json({ success: true, data: updated });
    }
    catch (err) {
        logger.error({ err: err.message, id }, 'Erro em PUT /api/knowledge/:id');
        res.status(400).json({ error: err.message });
    }
});
/**
 * DELETE /api/knowledge/:id?tenantId=...&deleteGroup=true
 * Remove o documento (e por padrão todos os chunks irmãos do mesmo upload).
 */
knowledgeRouter.delete('/:id', async (req, res) => {
    const id = String(req.params.id || '');
    const tenantId = String(req.query.tenantId || req.body?.tenantId || '');
    if (!z.string().uuid().safeParse(tenantId).success) {
        res.status(400).json({ error: 'Informe um tenantId (UUID) válido na query ou body.' });
        return;
    }
    const deleteGroup = req.query.deleteGroup !== 'false';
    try {
        const result = await ragService.deleteDocument({ tenantId, id, deleteGroup });
        if (result.deletedCount === 0) {
            res.status(404).json({ error: 'Documento não encontrado para este tenantId.' });
            return;
        }
        res.json({ success: true, deletedCount: result.deletedCount });
    }
    catch (err) {
        logger.error({ err: err.message, id }, 'Erro em DELETE /api/knowledge/:id');
        res.status(500).json({ error: err.message });
    }
});
