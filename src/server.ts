import express, { Express } from 'express';
import cors from 'cors';
import { webhookRouter } from './routes/webhook.routes.js';
import { knowledgeRouter } from './routes/knowledge.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { agentsRouter } from './routes/agents.routes.js';
import { logger } from './utils/logger.js';

export function createServer(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Healthcheck (raiz e /api)
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      service: 'saas-chatbot-backend',
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/api', healthHandler);

  // Rotas da Evolution API (suporta /webhook e /api/webhook)
  app.use('/webhook', webhookRouter);
  app.use('/api/webhook', webhookRouter);

  // Rotas REST de Base de Conhecimento, Catálogo e Agentes para o Admin Panel
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/agents', agentsRouter);

  return app;
}
