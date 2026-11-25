import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';
export class TenantService {
    cache = new Map();
    CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache
    async getByInstanceName(instanceName) {
        const cached = this.cache.get(instanceName);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.bundle;
        }
        try {
            const { data: tenant, error: tErr } = await supabase
                .from('tenants')
                .select('*')
                .eq('evolution_instance_name', instanceName)
                .eq('subscription_status', 'active')
                .single();
            if (tErr || !tenant) {
                logger.warn({ instanceName, error: tErr?.message }, 'Inquilino ativo não encontrado para esta instância');
                return null;
            }
            const { data: config, error: cErr } = await supabase
                .from('tenant_configs')
                .select('*')
                .eq('tenant_id', tenant.id)
                .single();
            if (cErr || !config) {
                logger.warn({ tenantId: tenant.id }, 'Configurações do inquilino não encontradas');
                return null;
            }
            const bundle = {
                tenant: tenant,
                config: config,
            };
            this.cache.set(instanceName, {
                bundle,
                expiresAt: Date.now() + this.CACHE_TTL_MS,
            });
            return bundle;
        }
        catch (err) {
            logger.error({ err: err.message, instanceName }, 'Erro ao buscar dados do inquilino no Supabase');
            return null;
        }
    }
    invalidateCache(instanceName) {
        this.cache.delete(instanceName);
    }
}
export const tenantService = new TenantService();
