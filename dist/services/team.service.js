import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';
import { getEquivalentPhoneJids } from '../utils/phone.js';
export class TeamService {
    async getMember(rawPhone, tenantId) {
        try {
            const jidVariants = getEquivalentPhoneJids(rawPhone);
            if (jidVariants.length === 0)
                return null;
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
            return data;
        }
        catch (err) {
            logger.error({ err: err.message, phone: rawPhone }, 'Erro ao buscar membro da equipe');
            return null;
        }
    }
    async setStatus(rawPhone, tenantId, status) {
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
        }
        catch (err) {
            logger.error({ err: err.message, phone: rawPhone }, 'Exceção ao atualizar status do membro da equipe');
            return false;
        }
    }
}
export const teamService = new TeamService();
