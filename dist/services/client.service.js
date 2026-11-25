import { supabase } from '../integrations/supabase.js';
import { logger } from '../utils/logger.js';
import { getEquivalentPhoneJids, normalizeWhatsAppJid } from '../utils/phone.js';
export class ClientService {
    async getOrCreate(rawPhone, tenantId, initialName = 'Desconhecido') {
        const phone = normalizeWhatsAppJid(rawPhone);
        const jidVariants = getEquivalentPhoneJids(phone);
        try {
            const { data: matches } = await supabase
                .from('clients')
                .select('*')
                .eq('tenant_id', tenantId)
                .in('phone', jidVariants)
                .order('created_at', { ascending: true });
            const existing = matches && matches.length > 0 ? matches[0] : null;
            if (existing) {
                const nowIso = new Date().toISOString();
                const updates = {
                    last_interaction_at: nowIso,
                    followup_sent: false,
                };
                // Alinha o JID gravado com o JID real entregue pelo WhatsApp caso estivesse com variação de 9º dígito
                if (existing.phone !== phone && !matches.some((m) => m.phone === phone)) {
                    updates.phone = phone;
                }
                await supabase
                    .from('clients')
                    .update(updates)
                    .eq('id', existing.id)
                    .eq('tenant_id', tenantId);
                return {
                    ...existing,
                    ...updates,
                };
            }
            const nowIso = new Date().toISOString();
            const newClientData = {
                phone,
                tenant_id: tenantId,
                name: initialName,
                status: 'active',
                created_at: nowIso,
                last_interaction_at: nowIso,
                followup_sent: false,
            };
            const { data: created, error: iErr } = await supabase
                .from('clients')
                .insert(newClientData)
                .select('*')
                .single();
            if (iErr) {
                // Proteção contra condição de corrida (duas mensagens simultâneas do mesmo número inédito)
                if (iErr.code === '23505') {
                    const { data: retryExisting } = await supabase
                        .from('clients')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .in('phone', jidVariants)
                        .maybeSingle();
                    if (retryExisting) {
                        return retryExisting;
                    }
                }
                logger.error({ error: iErr.message, phone, tenantId }, 'Falha ao criar novo cliente no Supabase');
                throw new Error(`Erro ao criar cliente: ${iErr.message}`);
            }
            logger.info({ clientId: created.id, phone, tenantId }, 'Novo cliente criado com sucesso');
            return created;
        }
        catch (err) {
            logger.error({ err: err.message, phone, tenantId }, 'Exceção em getOrCreate Client');
            throw err;
        }
    }
    async updateName(rawPhone, tenantId, name) {
        const jidVariants = getEquivalentPhoneJids(rawPhone);
        const { error } = await supabase
            .from('clients')
            .update({ name: name.trim() })
            .in('phone', jidVariants)
            .eq('tenant_id', tenantId);
        if (error) {
            logger.error({ error: error.message, phone: rawPhone, name }, 'Falha ao atualizar nome do cliente');
            return false;
        }
        return true;
    }
    /**
     * Atualiza o status do cliente preservando `previous_status` quando entra em `paused`,
     * sem sobrescrever `previous_status` caso o cliente já esteja pausado.
     */
    async setStatus(rawPhone, tenantId, status) {
        const jidVariants = getEquivalentPhoneJids(rawPhone);
        const updatePayload = {
            status,
            last_interaction_at: new Date().toISOString(),
        };
        if (status === 'paused') {
            const { data: current } = await supabase
                .from('clients')
                .select('status')
                .in('phone', jidVariants)
                .eq('tenant_id', tenantId)
                .limit(1)
                .maybeSingle();
            if (current?.status && current.status !== 'paused') {
                updatePayload.previous_status = current.status;
            }
        }
        const { error } = await supabase
            .from('clients')
            .update(updatePayload)
            .in('phone', jidVariants)
            .eq('tenant_id', tenantId);
        if (error) {
            logger.error({ error: error.message, phone: rawPhone, status }, 'Falha ao atualizar status do cliente');
            return false;
        }
        return true;
    }
}
export const clientService = new ClientService();
