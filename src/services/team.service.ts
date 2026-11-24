import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';

export interface TeamMember {
  id: string;
  tenant_id: string;
  phone: string;
  name: string;
  role: 'admin' | 'collaborator' | string;
  status: 'active' | 'paused' | string;
  created_at?: string;
}

export class TeamService {
  async getMember(phone: string, tenantId: string): Promise<TeamMember | null> {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('phone', phone)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as TeamMember;
    } catch (err: any) {
      logger.error({ err: err.message, phone }, 'Erro ao buscar membro da equipe');
      return null;
    }
  }

  async setStatus(phone: string, tenantId: string, status: 'active' | 'paused'): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ status })
        .eq('phone', phone)
        .eq('tenant_id', tenantId);

      if (error) {
        logger.error({ error: error.message, phone, status }, 'Erro ao atualizar status do membro da equipe');
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error({ err: err.message, phone }, 'Exceção ao atualizar status do membro da equipe');
      return false;
    }
  }
}

export const teamService = new TeamService();
