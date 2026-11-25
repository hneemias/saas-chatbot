import { createServer } from './server.js';
import { env } from './config/env.js';
import { cronService } from './services/cron.service.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  const app = createServer();

  // Inicializa rotinas de background (Follow-up diário e Reativação de clientes)
  cronService.init();

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `🚀 Servidor SaaS Chatbot iniciado com sucesso na porta ${env.PORT}`
    );
    logger.info(`Webhook pronto em: http://localhost:${env.PORT}/webhook/evolution`);
    logger.info(`Healthcheck em: http://localhost:${env.PORT}/health`);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Falha fatal ao inicializar o servidor');
  process.exit(1);
});
