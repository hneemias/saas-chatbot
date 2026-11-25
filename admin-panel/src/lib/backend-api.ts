function getBackendBaseUrl(): string {
    const raw = process.env.BACKEND_API_URL || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
}

function getAdminHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (process.env.ADMIN_API_KEY) {
        headers["x-api-key"] = process.env.ADMIN_API_KEY;
    }
    return headers;
}

export function getDefaultWebhookUrl(): string {
    if (process.env.BACKEND_PUBLIC_WEBHOOK_URL) {
        return process.env.BACKEND_PUBLIC_WEBHOOK_URL;
    }
    return `${getBackendBaseUrl()}/webhook/evolution`;
}

export async function getBackendHealth(): Promise<{
    online: boolean;
    latency: number;
    url: string;
}> {
    const backendBaseUrl = getBackendBaseUrl();
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`${backendBaseUrl}/health`, {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal: controller.signal,
        });
        clearTimeout(timeout);
        return {
            online: res.ok,
            latency: Date.now() - start,
            url: backendBaseUrl,
        };
    } catch {
        return {
            online: false,
            latency: Date.now() - start,
            url: backendBaseUrl,
        };
    }
}

export async function backendFetchJson<T = any>(
    path: string,
    init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
    const backendBaseUrl = getBackendBaseUrl();
    try {
        const res = await fetch(`${backendBaseUrl}${path}`, {
            ...init,
            headers: {
                ...getAdminHeaders(),
                ...(init?.headers || {}),
            },
            cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                error: json?.error || `Erro HTTP ${res.status} no Backend`,
            };
        }

        return { ok: true, status: res.status, data: json as T };
    } catch {
        return {
            ok: false,
            status: 503,
            error: `Servidor Backend (${backendBaseUrl}) indisponível no momento.`,
        };
    }
}
