import express, { Express } from 'express';
import cors from 'cors';
import { webhookRouter } from './routes/webhook.routes.js';
import { logger } from './utils/logger.js';

export function createServer(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Healthcheck
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'saas-advocacia-backend',
      timestamp: new Date().toISOString(),
    });
  });

  // Rotas da Evolution API
  app.use('/webhook', webhookRouter);

  return app;
}
