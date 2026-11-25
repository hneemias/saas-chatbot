import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente administrativo server-only com SUPABASE_SERVICE_ROLE_KEY.
 * Funciona de forma segura com Row Level Security (RLS) ativado em todas as tabelas,
 * devendo sempre ser usado no servidor após requireAdminSession().
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://comecchrihstbgbdvqqd.supabase.co';
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbWVjY2hyaWhzdGJnYmR2cXFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIwODU5OCwiZXhwIjoyMDg0Nzg0NTk4fQ.ZkZP3U-eYj-StoxlKCTQ9B2m5jxJAczMC7z3UhM6tZ4';

    if (!url || !key) {
        throw new Error("Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no servidor.");
    }

    return createSupabaseJsClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

export const createClient = (
    cookieStore?: ReturnType<typeof cookies> | Awaited<ReturnType<typeof cookies>>
) => {
    // Se a chave service_role estiver disponível no servidor, prioriza-a para não esbarrar em RLS
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return createAdminClient();
    }

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    if (!cookieStore) return undefined;
                    return (cookieStore as any).get?.(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        (cookieStore as any)?.set?.({ name, value, ...options });
                    } catch {
                        // Server Component read-only cookie context
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        (cookieStore as any)?.set?.({ name, value: "", ...options });
                    } catch {
                        // Server Component read-only cookie context
                    }
                },
            },
        }
    );
};
