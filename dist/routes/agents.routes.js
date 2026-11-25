import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { promptGeneratorService } from '../services/prompt-generator.service.js';
import { logger } from '../utils/logger.js';
export const agentsRouter = Router();
function requireAdminAuth(req, res, next) {
    if (!env.ADMIN_API_KEY) {
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
        res.status(401).json({ error: 'Não autorizado. Informe o header x-api-key válido.' });
        return;
    }
    next();
}
agentsRouter.use(requireAdminAuth);
const generatePromptSchema = z.object({
    tenantId: z.string().uuid('tenantId inválido'),
    agentType: z.enum(['external', 'internal']).default('external'),
    briefing: z.string().min(5, 'Informe ao menos algumas palavras sobre a empresa no briefing'),
    useKnowledgeBase: z.boolean().optional().default(true),
    currentPrompt: z.string().optional(),
});
agentsRouter.post('/generate-prompt', async (req, res) => {
    const parsed = generatePromptSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        return;
    }
    try {
        const prompt = await promptGeneratorService.generatePrompt(parsed.data);
        res.json({ success: true, prompt });
    }
    catch (err) {
        logger.error({ err: err.message }, 'Erro ao gerar prompt com IA');
        res.status(500).json({ error: err.message || 'Falha ao gerar prompt com IA.' });
    }
});
