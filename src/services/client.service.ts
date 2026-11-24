import { supabase } from '../integrations/supabase.js';
import { Client } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class ClientService {
  async getOrCreate(phone: string, tenantId: string, initialName = 'Desconhecido'): Promise<Client> {
    try {
      // 1. Tenta buscar cliente existente
      const { data: existing, error: sErr } = await supabase
        .from('clients')
        .select('*')
        .eq('phone', phone)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        // Atualiza last_interaction_at
        await supabase
          .from('clients')
          .update({
            last_interaction_at: new Date().toISOString(),
            followup_sent: false,
          })
          .eq('id', existing.id);

        return existing as Client;
      }

      // 2. Se não existir, cria o novo cliente de forma atômica
      const newClientData = {
        phone,
        tenant_id: tenantId,
        name: initialName,
        status: 'active',
        created_at: new Date().toISOString(),
        last_interaction_at: new Date().toISOString(),
        followup_sent: false,
      };

      const { data: created, error: iErr } = await supabase
        .from('clients')
        .insert(newClientData)
        .select('*')
        .single();

      if (iErr || !created) {
        logger.error({ error: iErr?.message, phone, tenantId }, 'Falha ao criar novo cliente no Supabase');
        throw new Error(`Erro ao criar cliente: ${iErr?.message}`);
      }

      logger.info({ clientId: created.id, phone, tenantId }, 'Novo cliente criado com sucesso');
      return created as Client;
    } catch (err: any) {
      logger.error({ err: err.message, phone, tenantId }, 'Exceção em getOrCreate Client');
      throw err;
    }
  }

  async updateName(phone: string, tenantId: string, name: string): Promise<boolean> {
    const { error } = await supabase
      .from('clients')
      .update({ name })
      .eq('phone', phone)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error({ error: error.message, phone, name }, 'Falha ao atualizar nome do cliente');
      return false;
    }
    return true;
  }

  async setStatus(phone: string, tenantId: string, status: string): Promise<boolean> {
    const { error } = await supabase
      .from('clients')
      .update({ status })
      .eq('phone', phone)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error({ error: error.message, phone, status }, 'Falha ao atualizar status do cliente');
      return false;
    }
    return true;
  }
}

export const clientService = new ClientService();
