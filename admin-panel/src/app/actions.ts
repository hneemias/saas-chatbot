"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdminSession } from "@/lib/auth";
import {
    getInstanceStatus,
    getQRCode,
    logoutInstance,
    listInstances,
    getEvoHealth,
    getGroups,
    getWebhookConfig,
    setWebhookConfig,
    getEvolutionBaseUrl,
} from "@/lib/evolution";
import { backendFetchJson, getBackendHealth, getDefaultWebhookUrl } from "@/lib/backend-api";

function convertToKebabCase(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function normalizeBrazilWhatsAppJid(rawPhone: string): string {
    const trimmed = (rawPhone || "").trim();
    if (trimmed.includes("@")) return trimmed;
    let digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
        digits = `55${digits}`;
    }
    return `${digits}@s.whatsapp.net`;
}

// ============================================================================
// 1. GESTÃO DE TENANTS (ESCRITÓRIOS)
// ============================================================================

export async function createTenant(_prevState: any, formData: FormData) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const name = ((formData.get("name") as string) || "").trim();
    const rawInstanceName = ((formData.get("instanceName") as string) || "").trim();
    const apiKey = ((formData.get("apiKey") as string) || "").trim();
    const enableCatalog = formData.get("enableCatalog") === "on";

    if (!name) {
        return { message: "O nome da empresa é obrigatório.", errors: {} };
    }

    const slug = `${convertToKebabCase(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const instanceName = rawInstanceName || `pendente_${slug}`;

    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
            name,
            slug,
            evolution_instance_name: instanceName,
            evolution_api_key: apiKey || null,
            subscription_status: "active",
        })
        .select()
        .single();

    if (tenantError) {
        return { message: "Erro ao criar empresa: " + tenantError.message };
    }

    const { error: configError } = await supabase.from("tenant_configs").insert({
        tenant_id: tenant.id,
        internal_agent_name: "Atlas",
        external_agent_name: "Assistente",
        internal_system_prompt:
            `Você é {{ agent_name }}, o Copiloto Operacional de **{{ tenant_name }}**.\n` +
            `Sua função é apoiar a equipe interna fornecendo análises, resumos e consultas rápidas.\n\n` +
            `### FERRAMENTAS DISPONÍVEIS:\n` +
            `- \`get_daily_summary\`: Resumo de atendimentos por data (formato YYYY-MM-DD).\n` +
            `- \`update_client_status\`: Atualiza status de clientes no CRM.\n` +
            `- \`search_knowledge_base\`: Consulta documentos internos da empresa e pastas/dossiês de clientes.\n\n` +
            `### PAPÉIS E SEGURANÇA:\n` +
            `- "{{ external_agent_name }}" atende o público externo, enquanto você ({{ agent_name }}) atende exclusivamente a equipe interna.\n` +
            `- Nunca invente dados nem aja como "{{ external_agent_name }}".`,
        external_system_prompt:
            `Você é **{{ agent_name }}**, Assistente Virtual de **{{ tenant_name }}**.\n` +
            `Sua função é realizar o atendimento consultivo de clientes, qualificação e agendamentos com clareza, empatia e objetividade.\n\n` +
            `### FERRAMENTAS DISPONÍVEIS (SEMPRE RESPONDA POR TEXTO JUNTO COM A FERRAMENTA):\n` +
            `- \`save_client_name\`: Salve o nome do cliente assim que ele se identificar.\n` +
            `- \`search_knowledge_base\`: Consulte serviços, valores, regras e documentos liberados do cliente.\n` +
            `- \`convert_lead\`: Classifique e encaminhe o atendimento ao concluir a triagem.\n` +
            `- \`notify_team\`: Avise a equipe sobre solicitações pontuais de clientes em andamento.\n` +
            `- \`human_escalation\`: Transfira para atendimento humano em caso de urgência ou pedido explícito.`,
        classifier_rules: {
            enable_product_catalog: enableCatalog,
        },
        temperature: 0.4,
    });

    if (configError) {
        return { message: "Empresa criada, mas erro na configuração inicial: " + configError.message };
    }

    revalidatePath("/tenants");
    revalidatePath("/dashboard");
    return { message: "success" };
}

export async function updateTenant(tenantId: string, _prevState: any, formData: FormData) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const name = ((formData.get("name") as string) || "").trim();
    const rawInstanceName = ((formData.get("instanceName") as string) || "").trim();
    const apiKey = ((formData.get("apiKey") as string) || "").trim();
    const enableCatalog = formData.get("enableCatalog") === "on";

    if (!name) {
        return { message: "O nome da empresa é obrigatório." };
    }

    let instanceNameToSave = rawInstanceName;
    if (!instanceNameToSave) {
        const { data: existingTenant } = await supabase
            .from("tenants")
            .select("evolution_instance_name, slug")
            .eq("id", tenantId)
            .single();

        instanceNameToSave =
            existingTenant?.evolution_instance_name && existingTenant.evolution_instance_name.startsWith("pendente_")
                ? existingTenant.evolution_instance_name
                : `pendente_${existingTenant?.slug || Math.random().toString(36).slice(2, 6)}`;
    }

    const { error } = await supabase
        .from("tenants")
        .update({
            name,
            evolution_instance_name: instanceNameToSave,
            evolution_api_key: apiKey || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

    if (error) {
        return { message: "Erro ao atualizar: " + error.message };
    }

    const { data: currentCfg } = await supabase
        .from("tenant_configs")
        .select("classifier_rules")
        .eq("tenant_id", tenantId)
        .maybeSingle();

    await supabase
        .from("tenant_configs")
        .update({
            classifier_rules: {
                ...(currentCfg?.classifier_rules || {}),
                enable_product_catalog: enableCatalog,
            },
            updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId);

    revalidatePath("/tenants");
    revalidatePath(`/tenants/${tenantId}`);
    return { message: "success" };
}

export async function deleteTenant(tenantId: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await supabase.from("tenants").delete().eq("id", tenantId);

    if (error) {
        return { message: "Erro ao excluir: " + error.message };
    }

    revalidatePath("/tenants");
    revalidatePath("/dashboard");
    return { message: "success" };
}

export async function toggleTenantStatus(tenantId: string, currentStatus: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const newStatus = currentStatus === "active" ? "inactive" : "active";

    const { error } = await supabase
        .from("tenants")
        .update({ subscription_status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", tenantId);

    if (error) {
        return { message: "Erro ao alterar status: " + error.message };
    }

    revalidatePath("/tenants");
    revalidatePath(`/tenants/${tenantId}`);
    return { message: "success" };
}

export async function getEvolutionPanelUrl() {
    await requireAdminSession();
    return getEvolutionBaseUrl();
}

// ============================================================================
// 2. EVOLUTION API & CONFIGURAÇÃO AUTOMÁTICA DE WEBHOOK
// ============================================================================

export async function getEvolutionStatus(instanceName: string, apiKey?: string) {
    await requireAdminSession();
    return await getInstanceStatus(instanceName, apiKey);
}

export async function getEvolutionQR(instanceName: string, apiKey?: string) {
    await requireAdminSession();
    return await getQRCode(instanceName, apiKey);
}

export async function disconnectEvolution(instanceName: string, apiKey?: string) {
    await requireAdminSession();
    const result = await logoutInstance(instanceName, apiKey);
    revalidatePath("/tenants");
    return result;
}

export async function getInstanceWebhookInfo(instanceName: string, apiKey?: string) {
    await requireAdminSession();
    const current = await getWebhookConfig(instanceName, apiKey);
    return {
        ...current,
        recommendedUrl: getDefaultWebhookUrl(),
    };
}

export async function saveInstanceWebhook(
    instanceName: string,
    webhookUrl: string,
    apiKey?: string
) {
    await requireAdminSession();
    const cleanUrl = (webhookUrl || "").trim();
    if (!cleanUrl.startsWith("http")) {
        return { error: "Informe uma URL HTTP/HTTPS válida para o webhook." };
    }
    return await setWebhookConfig(instanceName, cleanUrl, apiKey);
}

export async function getInstancesData() {
    await requireAdminSession();
    const supabase = createAdminClient();

    try {
        const evoInstances = await listInstances();
        const { data: tenants } = await supabase
            .from("tenants")
            .select("evolution_instance_name, name");

        const takenInstances = new Map<string, string>();
        tenants?.forEach((t) => {
            if (t.evolution_instance_name) {
                takenInstances.set(t.evolution_instance_name, t.name);
            }
        });

        const allInstances = Array.isArray(evoInstances)
            ? evoInstances
            : evoInstances?.instances || [];

        return allInstances.map((inst: any) => {
            const name = inst.instanceName || inst.name;
            return {
                name,
                status: inst.status || inst.instanceStatus || inst.connectionStatus || "unknown",
                isTaken: takenInstances.has(name),
                tenantName: takenInstances.get(name) || null,
            };
        });
    } catch {
        return [];
    }
}

export async function getTenantsWithStatus() {
    await requireAdminSession();
    const supabase = createAdminClient();

    try {
        const { data: tenants, error } = await supabase
            .from("tenants")
            .select("*")
            .order("created_at", { ascending: false });

        if (error || !tenants) return [];

        const tenantsWithEvo = await Promise.all(
            tenants.map(async (tenant) => {
                let evoStatus = "disconnected";
                let evoError = null;

                if (tenant.evolution_instance_name) {
                    try {
                        const statusResp = await getInstanceStatus(
                            tenant.evolution_instance_name,
                            tenant.evolution_api_key
                        );
                        if (statusResp && !statusResp.error) {
                            evoStatus = statusResp.instance?.state || "unknown";
                        } else if (statusResp?.error) {
                            evoError = statusResp.error;
                            evoStatus = "error";
                        }
                    } catch {
                        evoStatus = "error";
                    }
                }

                return {
                    ...tenant,
                    evolution_status: evoStatus,
                    evolution_error: evoError,
                };
            })
        );

        return tenantsWithEvo;
    } catch {
        return [];
    }
}

export async function getEvolutionGroups(tenantId: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data: tenant, error } = await supabase
        .from("tenants")
        .select("evolution_instance_name, evolution_api_key")
        .eq("id", tenantId)
        .single();

    if (error || !tenant) {
        return { error: "Empresa não encontrada" };
    }

    return await getGroups(tenant.evolution_instance_name, tenant.evolution_api_key);
}

// ============================================================================
// 3. CONFIGURAÇÃO DE IA & GOOGLE CALENDAR
// ============================================================================

export async function getAIConfig(tenantId: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data } = await supabase
        .from("tenant_configs")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

    return data;
}

export async function updateAIConfig(tenantId: string, updates: Record<string, any>) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await supabase.from("tenant_configs").upsert({
        tenant_id: tenantId,
        external_agent_name: updates.external_agent_name || "Karol",
        external_system_prompt: updates.external_system_prompt ?? "",
        internal_agent_name: updates.internal_agent_name || "Atlas",
        internal_system_prompt: updates.internal_system_prompt ?? "",
        temperature: updates.temperature ?? 0.4,
        notification_group_id: updates.notification_group_id || null,
        updated_at: new Date().toISOString(),
    });

    if (error) {
        return { error: error.message };
    }

    revalidatePath(`/tenants/${tenantId}`);
    return { success: true };
}

export async function updateCalendarConfig(tenantId: string, calendarConfig: Record<string, any>) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("tenant_configs")
        .select("calendar_config")
        .eq("tenant_id", tenantId)
        .maybeSingle();

    const merged = {
        ...(existing?.calendar_config || {}),
        ...calendarConfig,
    };

    const { error } = await supabase
        .from("tenant_configs")
        .update({
            calendar_config: merged,
            updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId);

    if (error) {
        return { error: error.message };
    }

    revalidatePath(`/tenants/${tenantId}`);
    return { success: true };
}

// ============================================================================
// 4. BASE DE CONHECIMENTO RAG (ESCRITÓRIO + DOSSIÊ DO CLIENTE)
// ============================================================================

export async function getKnowledgeDocuments(params: {
    tenantId: string;
    scope?: "all" | "office" | "client";
    clientId?: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    // Tenta via Backend API; se o Backend dev estiver parado, lê direto do Supabase para não travar a visualização
    const qs = new URLSearchParams({
        tenantId: params.tenantId,
        scope: params.scope || "all",
    });
    if (params.clientId) qs.set("clientId", params.clientId);

    const apiRes = await backendFetchJson<{ count: number; data: any[] }>(
        `/api/knowledge?${qs.toString()}`
    );
    if (apiRes.ok && apiRes.data) {
        return { data: apiRes.data.data || [], backendOnline: true };
    }

    let qb = supabase
        .from("knowledge_base")
        .select("id, tenant_id, client_id, doc_title, visible_to_client, content, metadata, created_at, updated_at")
        .eq("tenant_id", params.tenantId)
        .order("updated_at", { ascending: false })
        .limit(200);

    if (params.scope === "office") {
        qb = qb.is("client_id", null);
    } else if (params.scope === "client") {
        qb = params.clientId ? qb.eq("client_id", params.clientId) : qb.not("client_id", "is", null);
    }

    const { data } = await qb;
    return { data: data || [], backendOnline: false };
}

export async function createKnowledgeDocument(payload: {
    tenantId: string;
    clientId?: string | null;
    docTitle: string;
    content: string;
    visibleToClient?: boolean;
    category?: string;
}) {
    await requireAdminSession();

    const apiRes = await backendFetchJson<{
        success: boolean;
        docGroupId: string;
        totalChunks: number;
        visibleToClient: boolean;
        data: any[];
    }>("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
            tenantId: payload.tenantId,
            clientId: payload.clientId || null,
            docTitle: payload.docTitle.trim(),
            content: payload.content.trim(),
            visibleToClient: payload.visibleToClient,
            autoChunk: true,
            metadata: payload.category ? { category: payload.category } : {},
        }),
    });

    if (!apiRes.ok) {
        return { error: apiRes.error || "Falha ao ingerir documento no motor RAG." };
    }

    revalidatePath(`/tenants/${payload.tenantId}`);
    return { success: true, ...apiRes.data };
}

export async function toggleKnowledgeDocumentVisibility(params: {
    tenantId: string;
    docId: string;
    visibleToClient: boolean;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const apiRes = await backendFetchJson(`/api/knowledge/${params.docId}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({
            tenantId: params.tenantId,
            visibleToClient: params.visibleToClient,
            applyToGroup: true,
        }),
    });

    if (!apiRes.ok) {
        // Fallback direto no Supabase caso o servidor Node não esteja rodando no momento do clique
        const { error } = await supabase
            .from("knowledge_base")
            .update({
                visible_to_client: params.visibleToClient,
                updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", params.tenantId)
            .eq("id", params.docId);

        if (error) return { error: error.message };
    }

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function updateKnowledgeDocument(payload: {
    tenantId: string;
    docId: string;
    docTitle?: string;
    content?: string;
    visibleToClient?: boolean;
    category?: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const body: Record<string, any> = {
        tenantId: payload.tenantId,
    };
    if (payload.docTitle !== undefined) body.docTitle = payload.docTitle.trim();
    if (payload.content !== undefined) body.content = payload.content.trim();
    if (payload.visibleToClient !== undefined) body.visibleToClient = payload.visibleToClient;
    if (payload.category !== undefined) body.metadata = { category: payload.category.trim() };

    const apiRes = await backendFetchJson<{ success: boolean; data: any }>(
        `/api/knowledge/${payload.docId}`,
        {
            method: "PUT",
            body: JSON.stringify(body),
        }
    );

    if (!apiRes.ok) {
        // Fallback direto no Supabase caso o backend esteja offline
        const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };
        if (payload.docTitle !== undefined) updates.doc_title = payload.docTitle.trim();
        if (payload.content !== undefined) updates.content = payload.content.trim();
        if (payload.visibleToClient !== undefined) updates.visible_to_client = payload.visibleToClient;

        const { error } = await supabase
            .from("knowledge_base")
            .update(updates)
            .eq("tenant_id", payload.tenantId)
            .eq("id", payload.docId);

        if (error) return { error: error.message };
    }

    revalidatePath(`/tenants/${payload.tenantId}`);
    return { success: true };
}

export async function deleteKnowledgeDocument(params: { tenantId: string; docId: string }) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const apiRes = await backendFetchJson(
        `/api/knowledge/${params.docId}?tenantId=${params.tenantId}`,
        { method: "DELETE" }
    );

    if (!apiRes.ok) {
        const { error } = await supabase
            .from("knowledge_base")
            .delete()
            .eq("tenant_id", params.tenantId)
            .eq("id", params.docId);

        if (error) return { error: error.message };
    }

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function simulateKnowledgeSearch(params: {
    tenantId: string;
    query: string;
    clientId?: string | null;
    mode: "client" | "team";
}) {
    await requireAdminSession();

    const apiRes = await backendFetchJson<{
        mode: string;
        agentName?: string;
        simulatedReply?: string | null;
        highlights?: string[];
        count: number;
        data: Array<{
            id: string;
            scope: "office" | "client";
            docTitle?: string | null;
            visibleToClient: boolean;
            content: string;
            similarity: number;
            updatedAt?: string | null;
        }>;
    }>("/api/knowledge/search", {
        method: "POST",
        body: JSON.stringify({
            tenantId: params.tenantId,
            query: params.query,
            clientId: params.clientId || null,
            mode: params.mode,
            limit: 3,
            simulateReply: true,
        }),
    });

    if (!apiRes.ok) {
        return { error: apiRes.error };
    }

    return {
        success: true,
        agentName: apiRes.data?.agentName || "Assistente",
        simulatedReply: apiRes.data?.simulatedReply || null,
        highlights: apiRes.data?.highlights || [],
        results: apiRes.data?.data || [],
    };
}

// ============================================================================
// 5. CLIENTES, LEADS CRM & HISTÓRICO DE CONVERSA
// ============================================================================

export async function getTenantClientsWithLeads(tenantId: string, ensureClientId?: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const [{ data: clients }, { data: leads }, { data: clientDocs }, extraClientRes] = await Promise.all([
        supabase
            .from("clients")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("last_interaction_at", { ascending: false })
            .limit(200),
        supabase
            .from("leads_control")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        supabase
            .from("knowledge_base")
            .select("id, client_id, visible_to_client, metadata")
            .eq("tenant_id", tenantId)
            .not("client_id", "is", null),
        ensureClientId
            ? supabase
                .from("clients")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("id", ensureClientId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const mergedClients = [...(clients || [])];
    if (
        extraClientRes?.data &&
        !mergedClients.some((c) => c.id === extraClientRes.data.id)
    ) {
        mergedClients.unshift(extraClientRes.data);
    }

    const latestLeadByClient = new Map<string, any>();
    (leads || []).forEach((lead) => {
        if (lead.client_id && !latestLeadByClient.has(lead.client_id)) {
            latestLeadByClient.set(lead.client_id, lead);
        }
    });

    const docStatsByClient = new Map<string, { total: number; shared: number; seenGroups: Set<string> }>();
    (clientDocs || []).forEach((doc) => {
        if (!doc.client_id) return;
        if (!docStatsByClient.has(doc.client_id)) {
            docStatsByClient.set(doc.client_id, { total: 0, shared: 0, seenGroups: new Set() });
        }
        const entry = docStatsByClient.get(doc.client_id)!;
        const groupKey = doc.metadata?.doc_group_id || doc.id;
        if (!entry.seenGroups.has(groupKey)) {
            entry.seenGroups.add(groupKey);
            entry.total += 1;
            if (doc.visible_to_client) entry.shared += 1;
        }
    });

    return mergedClients.map((c) => {
        const lead = latestLeadByClient.get(c.id) || null;
        const docs = docStatsByClient.get(c.id) || { total: 0, shared: 0 };
        return {
            ...c,
            lead,
            docsCount: docs.total,
            sharedDocsCount: docs.shared,
        };
    });
}

export async function setClientAiStatus(params: {
    tenantId: string;
    clientId: string;
    newStatus: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const updatePayload: Record<string, any> = {
        status: params.newStatus,
        last_interaction_at: new Date().toISOString(),
    };

    if (params.newStatus === "paused") {
        const { data: current } = await supabase
            .from("clients")
            .select("status")
            .eq("id", params.clientId)
            .eq("tenant_id", params.tenantId)
            .maybeSingle();

        if (current?.status && current.status !== "paused") {
            updatePayload.previous_status = current.status;
        }
    }

    const { error } = await supabase
        .from("clients")
        .update(updatePayload)
        .eq("id", params.clientId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function updateClientProfile(params: {
    tenantId: string;
    clientId: string;
    name: string;
    status: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const updatePayload: Record<string, any> = {
        name: params.name.trim() || "Desconhecido",
        status: params.status,
    };

    if (params.status === "paused") {
        const { data: current } = await supabase
            .from("clients")
            .select("status")
            .eq("id", params.clientId)
            .eq("tenant_id", params.tenantId)
            .maybeSingle();

        if (current?.status && current.status !== "paused") {
            updatePayload.previous_status = current.status;
        }
    }

    const { error } = await supabase
        .from("clients")
        .update(updatePayload)
        .eq("id", params.clientId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function updateClientMemorySummary(params: {
    tenantId: string;
    clientId: string;
    memorySummary: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data: current, error: readError } = await supabase
        .from("clients")
        .select("metadata")
        .eq("id", params.clientId)
        .eq("tenant_id", params.tenantId)
        .maybeSingle();

    if (readError) return { error: readError.message };

    const nextMetadata: Record<string, any> = {
        ...(current?.metadata && typeof current.metadata === "object" ? current.metadata : {}),
        memory_summary: (params.memorySummary || "").trim(),
        memory_updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("clients")
        .update({
            metadata: nextMetadata,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.clientId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true, metadata: nextMetadata };
}

export async function getClientDrawerDetails(params: {
    tenantId: string;
    clientId: string;
    phone: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const [{ data: messages }, docsRes] = await Promise.all([
        supabase
            .from("messages")
            .select("id, role, content, message_type, created_at")
            .eq("tenant_id", params.tenantId)
            .or(`phone.eq.${params.phone},client_id.eq.${params.clientId}`)
            .order("created_at", { ascending: false })
            .limit(50),
        getKnowledgeDocuments({
            tenantId: params.tenantId,
            scope: "client",
            clientId: params.clientId,
        }),
    ]);

    return {
        messages: (messages || []).reverse(),
        documents: docsRes.data || [],
        backendOnline: docsRes.backendOnline,
    };
}

// ============================================================================
// 6. EQUIPE INTERNA / ADVOGADOS (ACESSO AO ATLAS)
// ============================================================================

export async function getTeamMembers(tenantId: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    if (error) return [];
    return data || [];
}

export async function createTeamMember(params: {
    tenantId: string;
    name: string;
    phone: string;
    role?: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const cleanName = (params.name || "").trim();
    const formattedJid = normalizeBrazilWhatsAppJid(params.phone);

    if (!cleanName || formattedJid.length < 18) {
        return { error: "Informe nome completo e telefone com DDD (ex: 11999998888)." };
    }

    const { error } = await supabase.from("team_members").upsert(
        {
            tenant_id: params.tenantId,
            name: cleanName,
            phone: formattedJid,
            role: params.role || "admin",
            status: "active",
        },
        { onConflict: "phone,tenant_id" }
    );

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function toggleTeamMemberStatus(params: {
    tenantId: string;
    memberId: string;
    currentStatus: string;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const nextStatus = params.currentStatus === "paused" ? "active" : "paused";
    const { error } = await supabase
        .from("team_members")
        .update({ status: nextStatus })
        .eq("id", params.memberId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true, status: nextStatus };
}

export async function deleteTeamMember(params: { tenantId: string; memberId: string }) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", params.memberId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

// ============================================================================
// 6.5 CATÁLOGO DE PRODUTOS, IMPORTAÇÃO DE PLANILHA & FOTOS (SUPABASE STORAGE)
// ============================================================================

function buildAdminProductSearchText(item: {
    sku: string;
    name: string;
    category?: string | null;
    description?: string | null;
}): string {
    const raw = [item.sku, item.name, item.category || "", item.description || ""]
        .filter(Boolean)
        .join(" ");
    const norm = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return `${raw} ${norm}`.trim();
}

export async function getTenantProducts(params: {
    tenantId: string;
    search?: string;
    stockFilter?: "all" | "in_stock" | "out_of_stock" | "with_photo";
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const pageSize = 1000;
    const maxItems = 20000;
    const allRows: any[] = [];
    let from = 0;

    while (allRows.length < maxItems) {
        let qb = supabase
            .from("products")
            .select("id, tenant_id, sku, name, category, description, price, stock_quantity, image_urls, active, updated_at")
            .eq("tenant_id", params.tenantId)
            .order("name", { ascending: true })
            .range(from, from + pageSize - 1);

        if (params.stockFilter === "in_stock") {
            qb = qb.gt("stock_quantity", 0);
        } else if (params.stockFilter === "out_of_stock") {
            qb = qb.lte("stock_quantity", 0);
        }

        if (params.search && params.search.trim() !== "") {
            const term = params.search
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            qb = qb.ilike("search_text", `%${term}%`);
        }

        const { data, error } = await qb;
        if (error) {
            if (/relation .*products.* does not exist|Could not find the table/i.test(error.message)) {
                return { data: [], tableMissing: true };
            }
            return { data: [], error: error.message };
        }

        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    let items = allRows;
    if (params.stockFilter === "with_photo") {
        items = items.filter((p: any) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
    }

    return { data: items, tableMissing: false };
}

export async function bulkImportTenantProducts(payload: {
    tenantId: string;
    items: Array<{
        sku: string;
        name: string;
        category?: string | null;
        description?: string | null;
        price: number;
        stock_quantity: number;
    }>;
}) {
    await requireAdminSession();
    const supabase = createAdminClient();

    // Se o backend estiver ativo, delega para aproveitar também a geração de embeddings em background
    const apiRes = await backendFetchJson<{
        success: boolean;
        totalProcessed: number;
        newProducts: number;
        updatedProducts: number;
    }>("/api/products/bulk-import", {
        method: "POST",
        body: JSON.stringify(payload),
    });

    if (apiRes.ok && apiRes.data) {
        revalidatePath(`/tenants/${payload.tenantId}`);
        return { ...apiRes.data, success: true };
    }

    // Fallback direto no Supabase (preservando image_urls e categorias existentes!)
    const dedup = new Map<string, any>();
    for (const r of payload.items || []) {
        const sku = String(r.sku || "").trim();
        const name = String(r.name || "").trim();
        if (!sku || !name) continue;
        dedup.set(sku, { ...r, sku, name });
    }

    const uniqueItems = Array.from(dedup.values());
    if (uniqueItems.length === 0) {
        return { error: "Nenhum produto válido encontrado na planilha." };
    }

    const existingMap = new Map<string, any>();
    let existingFrom = 0;
    while (true) {
        const { data: existingPage, error: readErr } = await supabase
            .from("products")
            .select("sku, category, description, image_urls")
            .eq("tenant_id", payload.tenantId)
            .range(existingFrom, existingFrom + 999);

        if (readErr) {
            return { error: readErr.message };
        }
        if (!existingPage || existingPage.length === 0) break;
        for (const x of existingPage) {
            existingMap.set(x.sku, x);
        }
        if (existingPage.length < 1000) break;
        existingFrom += 1000;
    }
    const nowIso = new Date().toISOString();
    let newProducts = 0;
    let updatedProducts = 0;

    const rowsToUpsert = uniqueItems.map((item) => {
        const prev = existingMap.get(item.sku);
        if (prev) updatedProducts++;
        else newProducts++;

        const category = item.category ?? prev?.category ?? null;
        const description = item.description ?? prev?.description ?? null;

        return {
            tenant_id: payload.tenantId,
            sku: item.sku,
            name: item.name,
            category,
            description,
            price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
            stock_quantity: Number.isFinite(Number(item.stock_quantity))
                ? Math.trunc(Number(item.stock_quantity))
                : 0,
            image_urls: prev?.image_urls || [],
            active: true,
            search_text: buildAdminProductSearchText({
                sku: item.sku,
                name: item.name,
                category,
                description,
            }),
            updated_at: nowIso,
        };
    });

    for (let i = 0; i < rowsToUpsert.length; i += 400) {
        const batch = rowsToUpsert.slice(i, i + 400);
        const { error: upErr } = await supabase
            .from("products")
            .upsert(batch, { onConflict: "tenant_id,sku" });
        if (upErr) return { error: upErr.message };
    }

    revalidatePath(`/tenants/${payload.tenantId}`);
    return {
        success: true,
        totalProcessed: rowsToUpsert.length,
        newProducts,
        updatedProducts,
    };
}

export async function upsertSingleTenantProduct(payload: {
    tenantId: string;
    sku: string;
    name: string;
    category?: string;
    description?: string;
    price: number;
    stock_quantity: number;
}) {
    return await bulkImportTenantProducts({
        tenantId: payload.tenantId,
        items: [payload],
    });
}

export async function deleteTenantProduct(params: { tenantId: string; productId: string }) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", params.productId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function uploadProductPhotoAction(formData: FormData) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const tenantId = String(formData.get("tenantId") || "");
    const productId = String(formData.get("productId") || "");
    const file = formData.get("file") as File | null;

    if (!tenantId || !productId || !file) {
        return { error: "Dados incompletos para envio da imagem." };
    }

    const { data: prod, error: pErr } = await supabase
        .from("products")
        .select("id, sku, image_urls")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .single();

    if (pErr || !prod) {
        return { error: "Produto não localizado." };
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeSku = String(prod.sku).replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${tenantId}/${safeSku}-${Date.now()}.${ext || "jpg"}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(storagePath, bytes, {
            contentType: file.type || "image/jpeg",
            upsert: true,
        });

    if (upErr) {
        return { error: "Falha ao enviar imagem: " + upErr.message };
    }

    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(storagePath);
    const nextUrls = [
        pub.publicUrl,
        ...(Array.isArray(prod.image_urls) ? prod.image_urls : []),
    ].slice(0, 5);

    const { error: dbErr } = await supabase
        .from("products")
        .update({ image_urls: nextUrls, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("tenant_id", tenantId);

    if (dbErr) return { error: dbErr.message };

    revalidatePath(`/tenants/${tenantId}`);
    return { success: true, imageUrls: nextUrls };
}

export async function clearProductPhotosAction(params: { tenantId: string; productId: string }) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await supabase
        .from("products")
        .update({ image_urls: [], updated_at: new Date().toISOString() })
        .eq("id", params.productId)
        .eq("tenant_id", params.tenantId);

    if (error) return { error: error.message };

    revalidatePath(`/tenants/${params.tenantId}`);
    return { success: true };
}

export async function bulkMatchProductPhotosAction(formData: FormData) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const tenantId = String(formData.get("tenantId") || "");
    const files = formData.getAll("files") as File[];

    if (!tenantId || files.length === 0) {
        return { error: "Selecione ao menos uma foto para vincular." };
    }

    const byNormalizedSku = new Map<string, any>();
    let photoFrom = 0;
    while (true) {
        const { data: pageProducts, error: pErr } = await supabase
            .from("products")
            .select("id, sku, image_urls")
            .eq("tenant_id", tenantId)
            .range(photoFrom, photoFrom + 999);

        if (pErr) {
            return { error: pErr.message || "Erro ao consultar catálogo." };
        }
        if (!pageProducts || pageProducts.length === 0) break;
        for (const p of pageProducts) {
            byNormalizedSku.set(String(p.sku).trim().toLowerCase(), p);
        }
        if (pageProducts.length < 1000) break;
        photoFrom += 1000;
    }

    let matched = 0;
    const unmatched: string[] = [];

    for (const file of files) {
        const baseName = file.name.replace(/\.[^.]+$/, "").trim();
        // Extrai o código do início do arquivo: ex "1050.jpg", "1050_teclado.png" ou "1050-front.webp"
        const candidateSku = baseName.split(/[_\-\s]+/)[0].toLowerCase();
        const prod = byNormalizedSku.get(baseName.toLowerCase()) || byNormalizedSku.get(candidateSku);

        if (!prod) {
            unmatched.push(file.name);
            continue;
        }

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const safeSku = String(prod.sku).replace(/[^a-zA-Z0-9_-]/g, "_");
        const storagePath = `${tenantId}/${safeSku}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}.${ext || "jpg"}`;

        const bytes = Buffer.from(await file.arrayBuffer());
        const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(storagePath, bytes, {
                contentType: file.type || "image/jpeg",
                upsert: true,
            });

        if (upErr) continue;

        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(storagePath);
        const nextUrls = [
            pub.publicUrl,
            ...(Array.isArray(prod.image_urls) ? prod.image_urls : []),
        ].slice(0, 5);

        await supabase
            .from("products")
            .update({ image_urls: nextUrls, updated_at: new Date().toISOString() })
            .eq("id", prod.id)
            .eq("tenant_id", tenantId);

        prod.image_urls = nextUrls;
        matched++;
    }

    revalidatePath(`/tenants/${tenantId}`);
    return { success: true, matched, unmatched };
}

// ============================================================================
// 7. SAÚDE DA INFRAESTRUTURA & MÉTRICAS DO DASHBOARD
// ============================================================================

export async function getInfrastructureHealth() {
    await requireAdminSession();
    const supabase = createAdminClient();

    const supabaseStart = Date.now();
    let supabaseStatus = false;
    try {
        const { error } = await supabase.from("tenants").select("id").limit(1);
        supabaseStatus = !error;
    } catch {
        supabaseStatus = false;
    }
    const supabaseLatency = Date.now() - supabaseStart;

    const evoStart = Date.now();
    const evoStatus = await getEvoHealth();
    const evoLatency = Date.now() - evoStart;

    const backendHealth = await getBackendHealth();

    return {
        supabase: { status: supabaseStatus ? "online" : "offline", latency: supabaseLatency },
        evolution: { status: evoStatus ? "online" : "offline", latency: evoLatency },
        backend: {
            status: backendHealth.online ? "online" : "offline",
            latency: backendHealth.latency,
            url: backendHealth.url,
        },
    };
}

async function calculateGrowth(
    supabase: any,
    table: string,
    days: number = 30,
    tenantId?: string
) {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const previousPeriodStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString();

    let currentQuery = supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte("created_at", currentPeriodStart);
    let previousQuery = supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte("created_at", previousPeriodStart)
        .lt("created_at", currentPeriodStart);

    if (tenantId) {
        currentQuery = currentQuery.eq("tenant_id", tenantId);
        previousQuery = previousQuery.eq("tenant_id", tenantId);
    }

    const [{ count: currentCount }, { count: previousCount }, { count: totalCount }] =
        await Promise.all([
            currentQuery,
            previousQuery,
            tenantId
                ? supabase.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenantId)
                : supabase.from(table).select("*", { count: "exact", head: true }),
        ]);

    const current = currentCount || 0;
    const previous = previousCount || 0;

    let percentage = 0;
    if (previous > 0) {
        percentage = ((current - previous) / previous) * 100;
    } else if (current > 0) {
        percentage = 100;
    }

    return {
        current,
        total: totalCount || 0,
        percentage: parseFloat(percentage.toFixed(1)),
    };
}

function formatDisplayPhone(jid?: string | null): string {
    const digits = (jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    if (!digits) return "Contato sem número";
    return `+${digits}`;
}

function canonicalConversationPhoneKey(jid?: string | null): string {
    const raw = (jid || "").trim();
    if (!raw) return "";
    if (raw.endsWith("@lid") || raw.endsWith("@g.us")) return raw.toLowerCase();
    const digits = raw.split("@")[0].split(":")[0].replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
        return digits.slice(0, 4) + digits.slice(5);
    }
    return digits || raw;
}

async function fetchTenantConversationCards(
    supabase: any,
    tenantId: string,
    tenantName = "",
    messageLimit = 60,
    maxCards = 8
) {
    const { data: recentMsgs } = await supabase
        .from("messages")
        .select("id, tenant_id, client_id, phone, role, content, created_at, clients(id, name, status, tenant_id)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(messageLimit);

    const convMap = new Map<string, any>();

    for (const msg of recentMsgs || []) {
        if (!msg.phone || msg.phone.endsWith("@g.us")) continue;

        const convKey = canonicalConversationPhoneKey(msg.phone);
        if (!convKey) continue;

        const rawClientObj = Array.isArray(msg.clients) ? msg.clients[0] : msg.clients;
        const validClientObj =
            rawClientObj && (!rawClientObj.tenant_id || rawClientObj.tenant_id === tenantId)
                ? rawClientObj
                : null;

        if (!convMap.has(convKey)) {
            const rawName = (validClientObj?.name || "").trim();
            const hasRealName = rawName && rawName.toLowerCase() !== "desconhecido";

            convMap.set(convKey, {
                id: `${tenantId}:${convKey}`,
                tenantId,
                tenantName,
                clientId: validClientObj?.id || null,
                clientName: hasRealName ? rawName : formatDisplayPhone(msg.phone),
                hasRealName: Boolean(hasRealName),
                clientStatus: validClientObj?.status || "active",
                phone: msg.phone,
                lastAt: msg.created_at,
                turns: [
                    {
                        id: msg.id,
                        role: msg.role,
                        content: msg.content || "",
                    },
                ],
            });
        } else {
            const conv = convMap.get(convKey)!;

            if (!conv.clientId && validClientObj?.id) {
                conv.clientId = validClientObj.id;
                conv.clientStatus = validClientObj.status || conv.clientStatus;
            }
            if (!conv.hasRealName && validClientObj?.name) {
                const candidate = validClientObj.name.trim();
                if (candidate && candidate.toLowerCase() !== "desconhecido") {
                    conv.clientName = candidate;
                    conv.hasRealName = true;
                }
            }

            if (conv.turns.length < 2) {
                const newestTurn = conv.turns[0];
                if (msg.role !== newestTurn.role) {
                    conv.turns.unshift({
                        id: msg.id,
                        role: msg.role,
                        content: msg.content || "",
                    });
                }
            }
        }
    }

    return Array.from(convMap.values()).slice(0, maxCards);
}

export async function getDashboardMetrics() {
    await requireAdminSession();
    const supabase = createAdminClient();

    const [tenantsStats, clientsStats, messagesStats, aiMessages, { data: tenantsList }] =
        await Promise.all([
            calculateGrowth(supabase, "tenants"),
            calculateGrowth(supabase, "clients"),
            calculateGrowth(supabase, "messages"),
            supabase
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("role", "assistant"),
            supabase.from("tenants").select("id, name").order("created_at", { ascending: true }),
        ]);

    const totalMsg = messagesStats.total || 0;
    const aiMsg = aiMessages.count || 0;
    const aiRate = totalMsg > 0 ? ((aiMsg / totalMsg) * 100).toFixed(1) : "0.0";

    const perTenantConversations = await Promise.all(
        (tenantsList || []).map((t: { id: string; name: string }) =>
            fetchTenantConversationCards(supabase, t.id, t.name, 60, 8)
        )
    );

    // Ordena os grupos de escritórios pela interação mais recente
    const activeBuckets = perTenantConversations
        .filter((list) => list.length > 0)
        .sort((a, b) => new Date(b[0].lastAt).getTime() - new Date(a[0].lastAt).getTime());

    // Round-Robin Elástico:
    // Fase 1: Pega até 2 conversas de cada escritório intercalando-os;
    // Fase 2: Se ainda faltarem itens para fechar 8 conversas, preenche com os demais escritórios disponíveis.
    const MAX_ITEMS = 8;
    const curatedActivity: any[] = [];
    let round = 0;

    while (curatedActivity.length < MAX_ITEMS) {
        let addedInRound = false;
        for (const bucket of activeBuckets) {
            if (round < bucket.length) {
                curatedActivity.push(bucket[round]);
                addedInRound = true;
                if (curatedActivity.length >= MAX_ITEMS) break;
            }
        }
        if (!addedInRound) break;
        round++;
    }

    return {
        tenants: tenantsStats,
        clients: clientsStats,
        messages: messagesStats,
        aiRate,
        activity: curatedActivity,
    };
}

export async function getTenantMetrics(tenantId: string) {
    await requireAdminSession();
    const supabase = createAdminClient();

    const now = new Date();
    const period1Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const period2Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: p1Msgs }, { data: p2Msgs }] = await Promise.all([
        supabase
            .from("messages")
            .select("client_id")
            .eq("tenant_id", tenantId)
            .gte("created_at", period1Start),
        supabase
            .from("messages")
            .select("client_id")
            .eq("tenant_id", tenantId)
            .gte("created_at", period2Start)
            .lt("created_at", period1Start),
    ]);

    const p1Active = new Set(p1Msgs?.filter((m) => m.client_id).map((m) => m.client_id)).size;
    const p2Active = new Set(p2Msgs?.filter((m) => m.client_id).map((m) => m.client_id)).size;

    const clientGrowth =
        p2Active > 0
            ? (((p1Active - p2Active) / p2Active) * 100).toFixed(1)
            : p1Active > 0
                ? "100"
                : "0";

    const [messages, aiMessages, activity] = await Promise.all([
        calculateGrowth(supabase, "messages", 30, tenantId),
        supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("role", "assistant"),
        fetchTenantConversationCards(supabase, tenantId, "", 80, 8),
    ]);

    const totalMsg = messages.total || 0;
    const aiMsg = aiMessages.count || 0;
    const aiRate = totalMsg > 0 ? ((aiMsg / totalMsg) * 100).toFixed(1) : "0.0";

    return {
        clients: { total: p1Active, percentage: parseFloat(clientGrowth) },
        messages: { total: totalMsg, percentage: messages.percentage },
        aiRate,
        activity,
    };
}

export async function getTenantEvolution(tenantId: string) {
    await requireAdminSession();
    noStore();
    const supabase = createAdminClient();

    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0));
        const label = d.toLocaleString("pt-BR", { month: "short", timeZone: "UTC" }).toUpperCase();

        const start = d.toISOString();
        const endD = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        const end = endD.toISOString();

        months.push({
            name: label.replace(".", ""),
            start,
            end,
        });
    }

    return await Promise.all(
        months.map(async (month) => {
            const [{ data: msgInteractions }, { count: messages }, { count: aiMessages }] =
                await Promise.all([
                    supabase
                        .from("messages")
                        .select("client_id")
                        .eq("tenant_id", tenantId)
                        .gte("created_at", month.start)
                        .lte("created_at", month.end),
                    supabase
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("tenant_id", tenantId)
                        .gte("created_at", month.start)
                        .lte("created_at", month.end),
                    supabase
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("tenant_id", tenantId)
                        .eq("role", "assistant")
                        .gte("created_at", month.start)
                        .lte("created_at", month.end),
                ]);

            const activeClients = new Set(
                msgInteractions?.filter((m) => m.client_id).map((m) => m.client_id)
            ).size;

            const msgCount = messages || 0;
            const aiMsgCount = aiMessages || 0;
            const aiRate = msgCount > 0 ? ((aiMsgCount / msgCount) * 100).toFixed(1) : "0.0";

            return {
                month: month.name,
                clients: activeClients,
                messages: msgCount,
                aiRate: parseFloat(aiRate),
            };
        })
    );
}

// ============================================================================
// 10. ASSISTENTE DE GERAÇÃO & OTIMIZAÇÃO DE PROMPT COM IA
// ============================================================================

export async function generatePromptWithAI(params: {
    tenantId: string;
    agentType: "external" | "internal";
    briefing: string;
    useKnowledgeBase?: boolean;
    currentPrompt?: string;
}): Promise<{ success: boolean; prompt?: string; error?: string }> {
    await requireAdminSession();

    const apiRes = await backendFetchJson<{ success: boolean; prompt: string }>(
        "/api/agents/generate-prompt",
        {
            method: "POST",
            body: JSON.stringify(params),
        }
    );

    if (!apiRes.ok || !apiRes.data?.prompt) {
        return {
            success: false,
            error: apiRes.error || "Falha ao gerar prompt com IA. Verifique se o servidor backend está online.",
        };
    }

    return {
        success: true,
        prompt: apiRes.data.prompt,
    };
}
