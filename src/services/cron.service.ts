import cron from 'node-cron';
import { supabase } from '../integrations/supabase.js';
import { evolutionApi } from '../integrations/evolution.js';
import { logger } from '../utils/logger.js';

export class CronService {
  /**
   * Executa a rotina de reativação de clientes pausados após 12 horas de inatividade
   */
  async runAutoReactivation(): Promise<void> {
    logger.info('Iniciando rotina de reativação automática de clientes pausados...');

    try {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      // Busca clientes pausados há mais de 12 horas pertencentes a inquilinos ativos
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, phone, tenant_id, previous_status, tenants!inner(subscription_status)')
        .eq('status', 'paused')
        .lt('last_interaction_at', twelveHoursAgo)
        .eq('tenants.subscription_status', 'active');

      if (error) {
        logger.error({ error: error.message }, 'Erro ao buscar clientes pausados para reativação');
        return;
      }

      if (!clients || clients.length === 0) {
        logger.info('Nenhum cliente pausado para reativação no momento');
        return;
      }

      for (const client of clients) {
        const newStatus = client.previous_status || 'active';
        await supabase
          .from('clients')
          .update({ status: newStatus })
          .eq('id', client.id);

        logger.info({ clientId: client.id, phone: client.phone, newStatus }, 'Cliente reativado automaticamente');
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Exceção na rotina de reativação automática');
    }
  }

  /**
   * Executa a rotina de follow-up diário para clientes ativos sem interação há mais de 24h
   */
  async runDailyFollowup(): Promise<void> {
    logger.info('Iniciando rotina de Daily Follow-up...');

    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Busca até 10 clientes para não sobrecarregar disparos
      const { data: clients, error } = await supabase
        .from('clients')
        .select(`
          id, 
          phone, 
          name, 
          tenant_id, 
          tenants!inner(
            evolution_instance_name, 
            evolution_api_key, 
            subscription_status
          )
        `)
        .eq('status', 'active')
        .eq('followup_sent', false)
        .lt('last_interaction_at', twentyFourHoursAgo)
        .eq('tenants.subscription_status', 'active')
        .limit(10);

      if (error) {
        logger.error({ error: error.message }, 'Erro ao buscar clientes para follow-up');
        return;
      }

      if (!clients || clients.length === 0) {
        logger.info('Nenhum cliente pendente de follow-up hoje');
        return;
      }

      for (const client of clients) {
        const tenantData: any = client.tenants;
        const instanceName = tenantData.evolution_instance_name;
        const apiKey = tenantData.evolution_api_key;

        const followupMsg = 'Olá! Notei que não concluímos nosso atendimento ontem. Ainda tem interesse em agendar ou ficou alguma dúvida? Estou à disposição!';

        try {
          await evolutionApi.sendTextMessage({
            instanceName,
            remoteJid: client.phone,
            text: followupMsg,
            apiKey,
          });

          // Marca que o follow-up foi enviado
          await supabase
            .from('clients')
            .update({ followup_sent: true })
            .eq('id', client.id);

          logger.info({ clientId: client.id, phone: client.phone }, 'Follow-up diário enviado');
        } catch (err: any) {
          logger.error({ err: err.message, clientId: client.id }, 'Falha ao enviar mensagem de follow-up');
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Exceção na rotina de daily follow-up');
    }
  }

  /**
   * Inicializa agendamentos de background
   */
  init(): void {
    // 1. Reativação automática: roda no minuto 0 de cada hora
    cron.schedule('0 * * * *', () => {
      this.runAutoReactivation().catch((err) =>
        logger.error({ err: err.message }, 'Falha no cron de reativação')
      );
    });

    // 2. Daily Follow-up: roda todos os dias às 10:00 da manhã (horário do servidor)
    cron.schedule('0 10 * * *', () => {
      this.runDailyFollowup().catch((err) =>
        logger.error({ err: err.message }, 'Falha no cron de follow-up')
      );
    });

    logger.info('Rotinas automáticas de background (Follow-up e Reativação) inicializadas');
  }
}

export const cronService = new CronService();
