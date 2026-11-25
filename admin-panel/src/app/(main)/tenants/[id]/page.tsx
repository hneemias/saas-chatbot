import { createAdminClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { TenantForm } from "@/components/tenant-form";
import {
    ExternalLink,
    MessageSquare,
    Settings2,
    Sparkles,
    LayoutDashboard,
    BarChart3,
    BookOpen,
    Users,
    ShieldCheck,
    Calendar,
    ArrowLeft,
    Package,
} from "lucide-react";
import { WhatsAppConnection } from "@/components/whatsapp-connection";
import { AIConfigForm } from "@/components/ai-config-form";
import { TenantMetrics } from "@/components/tenant-metrics";
import { TenantEvolution } from "@/components/tenant-evolution";
import { TenantKnowledge } from "@/components/tenant-knowledge";
import { TenantClients } from "@/components/tenant-clients";
import { TenantTeam } from "@/components/tenant-team";
import { TenantCalendar } from "@/components/tenant-calendar";
import { TenantCatalog } from "@/components/tenant-catalog";
import { PageTitle } from "@/components/page-title";
import Link from "next/link";
import {
    getAIConfig,
    getTenantMetrics,
    getTenantEvolution,
    getKnowledgeDocuments,
    getTenantClientsWithLeads,
    getTeamMembers,
    getEvolutionPanelUrl,
    getTenantProducts,
} from "@/app/actions";

export default async function TenantDetailsPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string; clientId?: string; view?: string; q?: string }>;
}) {
    const { id } = await params;
    const { tab = "metrics", clientId, view, q } = await searchParams;
    const supabase = createAdminClient();

    const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();

    if (!tenant) {
        return notFound();
    }

    const evoBaseUrl = await getEvolutionPanelUrl();

    const [
        aiConfig,
        metrics,
        evolution,
        knowledgeRes,
        clientsList,
        teamList,
        catalogRes,
    ] = await Promise.all([
        getAIConfig(id),
        tab === "metrics" ? getTenantMetrics(id) : Promise.resolve(null),
        tab === "stats" ? getTenantEvolution(id) : Promise.resolve(null),
        tab === "knowledge"
            ? getKnowledgeDocuments({ tenantId: id, scope: "office" })
            : Promise.resolve(null),
        tab === "clients" ? getTenantClientsWithLeads(id, clientId) : Promise.resolve(null),
        tab === "team" ? getTeamMembers(id) : Promise.resolve(null),
        tab === "catalog" ? getTenantProducts({ tenantId: id }) : Promise.resolve(null),
    ]);

    const catalogEnabled = Boolean(aiConfig?.classifier_rules?.enable_product_catalog);

    const navTabs = [
        { id: "metrics", label: "Resumo", icon: LayoutDashboard },
        { id: "clients", label: "Clientes", icon: Users },
        ...(catalogEnabled ? [{ id: "catalog", label: "Catálogo", icon: Package }] : []),
        { id: "knowledge", label: "Conhecimento", icon: BookOpen },
        { id: "team", label: "Equipe", icon: ShieldCheck },
        { id: "ai", label: "Agentes IA", icon: Sparkles },
        { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
        { id: "calendar", label: "Agenda", icon: Calendar },
        { id: "stats", label: "Desempenho", icon: BarChart3 },
        { id: "general", label: "Instância", icon: Settings2 },
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-12">
            <PageTitle title={tenant.name} />

            {/* Banner Superior do Workspace */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <Link
                            href="/tenants"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                        >
                            <ArrowLeft className="size-3.5" />
                            Todas as Empresas
                        </Link>

                        <div className="flex items-center gap-3.5">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white font-bold text-sm shadow-xs">
                                {tenant.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">
                                        {tenant.name}
                                    </h1>
                                    <span
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                            tenant.subscription_status === "active"
                                                ? "bg-emerald-50 border-emerald-200/80 text-emerald-700"
                                                : "bg-zinc-100 border-zinc-200 text-zinc-600"
                                        }`}
                                    >
                                        <span
                                            className={`size-1.5 rounded-full ${
                                                tenant.subscription_status === "active"
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-400"
                                            }`}
                                        />
                                        {tenant.subscription_status === "active"
                                            ? "Assinatura Ativa"
                                            : "Inativo"}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    Instância WhatsApp:{" "}
                                    {tenant.evolution_instance_name?.startsWith("pendente_") ? (
                                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-medium text-[11px]">
                                            Pendente de vinculação
                                        </span>
                                    ) : (
                                        <span className="text-zinc-800 font-semibold font-mono">
                                            {tenant.evolution_instance_name}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {evoBaseUrl && (
                        <a
                            href={evoBaseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition-all self-start sm:self-center"
                        >
                            <span>Painel Evolution API</span>
                            <ExternalLink className="size-3.5 text-zinc-400" />
                        </a>
                    )}
                </div>

                {/* Abas Horizontais Responsivas */}
                <div className="border-t border-zinc-100 px-4 sm:px-6 overflow-x-auto">
                    <nav className="flex items-center gap-1 min-w-max">
                        {navTabs.map((item) => {
                            const isActive = tab === item.id;
                            return (
                                <Link
                                    key={item.id}
                                    href={`?tab=${item.id}`}
                                    className={`relative flex items-center gap-2 px-3.5 py-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                                        isActive
                                            ? "text-indigo-600"
                                            : "text-zinc-500 hover:text-zinc-900"
                                    }`}
                                >
                                    <item.icon
                                        className={`size-3.5 ${
                                            isActive ? "text-indigo-600" : "text-zinc-400"
                                        }`}
                                    />
                                    {item.label}
                                    {isActive && (
                                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-indigo-600" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Conteúdo em Largura Total */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs relative overflow-hidden">
                {tab === "metrics" && metrics ? (
                    <TenantMetrics tenantId={tenant.id} metrics={metrics} />
                ) : tab === "clients" ? (
                    <TenantClients
                        tenantId={tenant.id}
                        clients={clientsList || []}
                        initialClientId={clientId}
                        initialDrawerTab={view === "chat" ? "chat" : "dossier"}
                        initialSearch={q}
                    />
                ) : tab === "catalog" && catalogEnabled ? (
                    <TenantCatalog
                        tenantId={tenant.id}
                        initialProducts={catalogRes?.data || []}
                        tableMissing={Boolean((catalogRes as any)?.tableMissing)}
                    />
                ) : tab === "knowledge" ? (
                    <TenantKnowledge
                        tenantId={tenant.id}
                        initialDocuments={knowledgeRes?.data || []}
                        backendOnline={Boolean(knowledgeRes?.backendOnline)}
                    />
                ) : tab === "team" ? (
                    <TenantTeam tenantId={tenant.id} members={teamList || []} />
                ) : tab === "whatsapp" ? (
                    <WhatsAppConnection
                        instanceName={tenant.evolution_instance_name}
                        apiKey={tenant.evolution_api_key}
                    />
                ) : tab === "ai" ? (
                    <AIConfigForm tenantId={tenant.id} initialData={aiConfig} />
                ) : tab === "calendar" ? (
                    <TenantCalendar
                        tenantId={tenant.id}
                        initialConfig={aiConfig?.calendar_config}
                    />
                ) : tab === "stats" && evolution ? (
                    <TenantEvolution data={evolution} />
                ) : (
                    <TenantForm
                        tenantId={tenant.id}
                        initialData={{
                            name: tenant.name,
                            evolution_instance_name: tenant.evolution_instance_name,
                            evolution_api_key: tenant.evolution_api_key,
                            enable_product_catalog: catalogEnabled,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
