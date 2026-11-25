import { getTenantsWithStatus } from "@/app/actions";
import { TenantsTableClient } from "@/components/tenants-table-client";

export default async function TenantsPage() {
    const tenants = await getTenantsWithStatus();

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                    Empresas & Instâncias
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Gerencie conexões WhatsApp, assistentes de atendimento, catálogo, base de conhecimento e equipe.
                </p>
            </div>

            <TenantsTableClient tenants={tenants} />
        </div>
    );
}
