import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';
import { getEquivalentPhoneJids } from '../utils/phone.js';

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
  async getMember(rawPhone: string, tenantId: string): Promise<TeamMember | null> {
    try {
      const jidVariants = getEquivalentPhoneJids(rawPhone);
      if (jidVariants.length === 0) return null;

      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .in('phone', jidVariants)
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as TeamMember;
    } catch (err: any) {
      logger.error({ err: err.message, phone: rawPhone }, 'Erro ao buscar membro da equipe');
      return null;
    }
  }

  async setStatus(rawPhone: string, tenantId: string, status: 'active' | 'paused'): Promise<boolean> {
    try {
      const jidVariants = getEquivalentPhoneJids(rawPhone);
      const { error } = await supabase
        .from('team_members')
        .update({ status })
        .in('phone', jidVariants)
        .eq('tenant_id', tenantId);

      if (error) {
        logger.error({ error: error.message, phone: rawPhone, status }, 'Erro ao atualizar status do membro da equipe');
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error({ err: err.message, phone: rawPhone }, 'Exceção ao atualizar status do membro da equipe');
      return false;
    }
  }
}

export const teamService = new TeamService();
