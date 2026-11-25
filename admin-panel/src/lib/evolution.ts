function getEvoConfig() {
    const rawBaseUrl = process.env.EVOLUTION_API_URL;
    const baseUrl = rawBaseUrl?.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
    const globalApiKey = process.env.EVOLUTION_API_KEY;
    return { baseUrl, globalApiKey };
}

export function getEvolutionBaseUrl(): string | null {
    return getEvoConfig().baseUrl || null;
}

export async function getInstanceStatus(instanceName: string, apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;

    if (!baseUrl) {
        return { instance: { state: "error" }, error: "EVOLUTION_API_URL não configurada" };
    }

    const fullUrl = `${baseUrl}/instance/connectionState/${instanceName}`;

    try {
        const response = await fetch(fullUrl, {
            headers: { apikey: key || "" },
            cache: "no-store",
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }

        return { instance: { state: "error" }, status: response.status };
    } catch {
        return { instance: { state: "error" } };
    }
}

export async function getQRCode(instanceName: string, apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;

    if (!baseUrl) {
        return { error: "EVOLUTION_API_URL não configurada" };
    }

    const fullUrl = `${baseUrl}/instance/connect/${instanceName}`;

    try {
        const response = await fetch(fullUrl, {
            headers: { apikey: key || "" },
            cache: "no-store",
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }

        return { error: `API Error ${response.status}` };
    } catch {
        return { error: "Falha ao conectar na Evolution API" };
    }
}

export async function logoutInstance(instanceName: string, apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;

    if (!baseUrl) {
        return { error: "EVOLUTION_API_URL não configurada" };
    }

    const fullUrl = `${baseUrl}/instance/logout/${instanceName}`;

    try {
        const response = await fetch(fullUrl, {
            method: "DELETE",
            headers: { apikey: key || "" },
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }

        return { success: response.ok, status: response.status };
    } catch {
        return { error: "Falha ao desconectar instância" };
    }
}

export async function listInstances(apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;

    if (!baseUrl) {
        return { error: "EVOLUTION_API_URL não configurada" };
    }

    const fullUrl = `${baseUrl}/instance/fetchInstances`;

    try {
        const response = await fetch(fullUrl, {
            headers: { apikey: key || "" },
            cache: "no-store",
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }

        return { error: `API Error ${response.status}`, status: response.status };
    } catch {
        return { error: "Falha ao listar instâncias" };
    }
}

export async function getEvoHealth() {
    const { baseUrl, globalApiKey } = getEvoConfig();
    if (!baseUrl) return false;
    try {
        const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
            headers: { apikey: globalApiKey || "" },
            cache: "no-store",
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function getGroups(instanceName: string, apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;

    if (!baseUrl) {
        return { error: "EVOLUTION_API_URL não configurada" };
    }

    const endpoints = [
        `/group/fetchAllGroups/${instanceName}?getParticipants=false`,
        `/group/fetchAll/${instanceName}?getParticipants=false`,
    ];

    let lastError: any = null;

    for (const endpoint of endpoints) {
        const fullUrl = `${baseUrl}${endpoint}`;
        try {
            const response = await fetch(fullUrl, {
                headers: { apikey: key || "" },
                cache: "no-store",
            });

            if (response.status === 404) {
                lastError = { status: 404, message: "Endpoint não encontrado" };
                continue;
            }

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return await response.json();
            }

            return { error: `API Error ${response.status}`, status: response.status };
        } catch (error: any) {
            lastError = error;
        }
    }

    return {
        error:
            lastError?.message ||
            "Não foi possível consultar grupos na Evolution API.",
        status: 404,
    };
}

export async function getWebhookConfig(instanceName: string, apiKey?: string) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;
    if (!baseUrl) return { error: "EVOLUTION_API_URL não configurada" };

    try {
        const res = await fetch(`${baseUrl}/webhook/find/${instanceName}`, {
            headers: { apikey: key || "" },
            cache: "no-store",
        });
        if (!res.ok) return { enabled: false, url: "" };
        const data = await res.json();
        const webhook = data?.webhook || data;
        return {
            enabled: Boolean(webhook?.enabled ?? webhook?.url),
            url: webhook?.url || "",
            events: webhook?.events || [],
        };
    } catch {
        return { enabled: false, url: "" };
    }
}

export async function setWebhookConfig(
    instanceName: string,
    webhookUrl: string,
    apiKey?: string
) {
    const { baseUrl, globalApiKey } = getEvoConfig();
    const key = apiKey || globalApiKey;
    if (!baseUrl) return { error: "EVOLUTION_API_URL não configurada" };

    // Evolution API v2 aceita objeto { webhook: { enabled, url, ... } } e v1 aceita plano
    const payloads = [
        {
            webhook: {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: false,
                webhookBase64: true,
                events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
            },
        },
        {
            enabled: true,
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: true,
            events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
        },
    ];

    let lastErr = "Falha ao configurar webhook na Evolution API.";
    for (const body of payloads) {
        try {
            const res = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: key || "",
                },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const json = await res.json().catch(() => ({}));
                return { success: true, data: json };
            }
            lastErr = `HTTP ${res.status}: ${await res.text()}`;
        } catch (err: any) {
            lastErr = err.message;
        }
    }

    return { error: lastErr };
}
