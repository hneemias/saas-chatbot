import {
    ArrowUpRight,
    Building2,
    MessageSquare,
    Users,
    Sparkles,
    Database,
    Globe,
    Cpu,
    CheckCircle2,
    AlertTriangle,
    ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { getInfrastructureHealth, getDashboardMetrics } from "@/app/actions";

export default async function DashboardPage() {
    const [metrics, health] = await Promise.all([
        getDashboardMetrics(),
        getInfrastructureHealth(),
    ]);

    const tenantsCount = metrics.tenants.total || 0;
    const clientsCount = metrics.clients.total || 0;
    const mCount = metrics.messages.total || 0;
    const responseRate = metrics.aiRate || "0.0";

    const allHealthy =
        health.supabase.status === "online" &&
        health.evolution.status === "online" &&
        health.backend.status === "online";

    const kpis = [
        {
            label: "Escritórios Provisionados",
            value: tenantsCount.toLocaleString("pt-BR"),
            trend: metrics.tenants.percentage,
            sub: "ativos na plataforma",
            icon: Building2,
            accent: "bg-indigo-50 text-indigo-600 ring-indigo-600/15",
        },
        {
            label: "Clientes Atendidos",
            value: clientsCount.toLocaleString("pt-BR"),
            trend: metrics.clients.percentage,
            sub: "leads e clientes únicos",
            icon: Users,
            accent: "bg-emerald-50 text-emerald-600 ring-emerald-600/15",
        },
        {
            label: "Mensagens Processadas",
            value: mCount.toLocaleString("pt-BR"),
            trend: metrics.messages.percentage,
            sub: "volume histórico total",
            icon: MessageSquare,
            accent: "bg-sky-50 text-sky-600 ring-sky-600/15",
        },
        {
            label: "Índice de Automação IA",
            value: `${responseRate}%`,
            trend: null,
            sub: "atendimentos respondidos pela IA",
            icon: Sparkles,
            accent: "bg-violet-50 text-violet-600 ring-violet-600/15",
        },
    ];

    const services = [
        {
            name: "Banco de Dados",
            desc: "Armazenamento e busca inteligente",
            status: health.supabase.status,
            latency: health.supabase.latency,
            icon: Database,
        },
        {
            name: "WhatsApp Gateway",
            desc: "Conexão de instâncias e mídia",
            status: health.evolution.status,
            latency: health.evolution.latency,
            icon: Globe,
        },
        {
            name: "Motor de IA",
            desc: "Atendimento, voz e conhecimento",
            status: health.backend.status,
            latency: health.backend.latency,
            icon: Cpu,
        },
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-8">
            {/* Cabeçalho */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                        Visão Geral da Operação
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Monitoramento em tempo real dos escritórios, agentes de IA e infraestrutura.
                    </p>
                </div>

                <div
                    className={`inline-flex items-center gap-2 self-start sm:self-auto rounded-full px-3.5 py-1.5 text-xs font-semibold border ${
                        allHealthy
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-800"
                            : "bg-amber-50/80 border-amber-200 text-amber-800"
                    }`}
                >
                    {allHealthy ? (
                        <>
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                            Todos os serviços online
                        </>
                    ) : (
                        <>
                            <AlertTriangle className="size-3.5 text-amber-600" />
                            Verifique serviços offline abaixo
                        </>
                    )}
                </div>
            </div>

            {/* Cards de KPI */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => (
                    <div
                        key={kpi.label}
                        className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs hover:border-zinc-300 transition-all flex flex-col justify-between gap-4"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-500">
                                {kpi.label}
                            </span>
                            <div
                                className={`flex size-8 items-center justify-center rounded-lg ring-1 ${kpi.accent}`}
                            >
                                <kpi.icon className="size-4" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-3xl font-bold tracking-tight text-zinc-950 tabular-nums">
                                    {kpi.value}
                                </span>
                                {kpi.trend !== null && (
                                    <span
                                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                                            kpi.trend >= 0
                                                ? "bg-emerald-50 text-emerald-700"
                                                : "bg-red-50 text-red-700"
                                        }`}
                                    >
                                        {kpi.trend > 0 ? "+" : ""}
                                        {kpi.trend}% (30d)
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-400">{kpi.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Grid Principal: Atividade Recente + Infraestrutura */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Feed de Atividade (8 colunas) */}
                <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs overflow-hidden">
                    <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
                        <div>
                            <h2 className="text-sm font-bold text-zinc-900">
                                Conversas Recentes
                            </h2>
                            <p className="text-xs text-zinc-500">
                                Atendimentos ativos nos escritórios. Clique para abrir a conversa do cliente.
                            </p>
                        </div>
                        <Link
                            href="/tenants"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                            Ver escritórios
                            <ArrowUpRight className="size-3.5" />
                        </Link>
                    </div>

                    {metrics.activity && metrics.activity.length > 0 ? (
                        <div className="divide-y divide-zinc-100">
                            {metrics.activity.map((conv: any) => {
                                const cleanPhone = (conv.phone || "").replace(
                                    /@(s\.whatsapp\.net|lid|g\.us)$/i,
                                    ""
                                );
                                const targetHref = conv.clientId
                                    ? `/tenants/${conv.tenantId}?tab=clients&clientId=${conv.clientId}&view=chat`
                                    : `/tenants/${conv.tenantId}?tab=clients&q=${encodeURIComponent(cleanPhone)}`;

                                const statusInfo =
                                    conv.clientStatus === "paused"
                                        ? {
                                              label: "Atendimento Humano",
                                              cls: "bg-amber-50 text-amber-700 border-amber-200/80",
                                          }
                                        : conv.clientStatus === "triagem_concluida"
                                          ? {
                                                label: "Triagem Concluída",
                                                cls: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
                                            }
                                          : conv.clientStatus === "converted"
                                            ? {
                                                  label: "Cliente Fechado",
                                                  cls: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                                              }
                                            : {
                                                  label: "IA Ativa",
                                                  cls: "bg-zinc-100 text-zinc-600 border-zinc-200/80",
                                              };

                                const initials = conv.clientName
                                    .replace(/^\+/, "")
                                    .substring(0, 2)
                                    .toUpperCase();

                                return (
                                    <Link
                                        key={conv.id}
                                        href={targetHref}
                                        className="flex items-start gap-3.5 px-6 py-4 hover:bg-zinc-50/80 transition-colors group"
                                    >
                                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white text-[11px] font-bold shadow-2xs">
                                            {initials}
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-xs font-bold text-zinc-950 truncate group-hover:text-indigo-600 transition-colors">
                                                    {conv.clientName}
                                                </span>

                                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 truncate max-w-[190px]">
                                                        <Building2 className="size-3 shrink-0" />
                                                        <span className="truncate">{conv.tenantName}</span>
                                                    </span>
                                                    <span
                                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.cls}`}
                                                    >
                                                        {statusInfo.label}
                                                    </span>
                                                    <span className="text-[11px] font-mono text-zinc-400 tabular-nums pl-1">
                                                        {new Date(conv.lastAt).toLocaleString("pt-BR", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-1 rounded-xl bg-zinc-50/80 border border-zinc-100 px-3 py-2">
                                                {(conv.turns || []).map((turn: any, idx: number) => {
                                                    const isAI = turn.role === "assistant";
                                                    const isTeam = turn.role === "admin";
                                                    return (
                                                        <p
                                                            key={turn.id || idx}
                                                            className="text-xs text-zinc-600 line-clamp-1"
                                                        >
                                                            <span
                                                                className={`font-semibold mr-1.5 ${
                                                                    isAI
                                                                        ? "text-indigo-600"
                                                                        : isTeam
                                                                          ? "text-amber-700"
                                                                          : "text-zinc-900"
                                                                }`}
                                                            >
                                                                {isAI
                                                                    ? "Assistente:"
                                                                    : isTeam
                                                                      ? "Equipe:"
                                                                      : "Cliente:"}
                                                            </span>
                                                            {turn.content}
                                                        </p>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <ChevronRight className="size-4 text-zinc-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 mt-2.5 shrink-0 transition-all" />
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-12 text-center space-y-2">
                            <MessageSquare className="size-8 text-zinc-300 mx-auto" />
                            <p className="text-sm font-medium text-zinc-600">
                                Nenhuma mensagem registrada ainda
                            </p>
                            <p className="text-xs text-zinc-400">
                                As conversas aparecerão aqui automaticamente assim que as instâncias receberem mensagens.
                            </p>
                        </div>
                    )}
                </div>

                {/* Coluna Direita: Infraestrutura (4 colunas) */}
                <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-5">
                        <div>
                            <h2 className="text-sm font-bold text-zinc-900">
                                Saúde dos Motores
                            </h2>
                            <p className="text-xs text-zinc-500">
                                Latência e disponibilidade verificadas agora.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {services.map((svc) => {
                                const online = svc.status === "online";
                                return (
                                    <div
                                        key={svc.name}
                                        className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                                                    online
                                                        ? "bg-white text-zinc-800 shadow-2xs ring-1 ring-zinc-200/80"
                                                        : "bg-red-50 text-red-600 ring-1 ring-red-200"
                                                }`}
                                            >
                                                <svc.icon className="size-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-zinc-900 truncate">
                                                    {svc.name}
                                                </p>
                                                <p className="text-[11px] text-zinc-500 truncate">
                                                    {svc.desc}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right shrink-0">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                                    online
                                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                                        : "bg-red-50 text-red-700 border border-red-200"
                                                }`}
                                            >
                                                <CheckCircle2 className="size-2.5" />
                                                {online ? "Online" : "Offline"}
                                            </span>
                                            <p className="text-[10px] font-mono text-zinc-400 mt-1 tabular-nums">
                                                {svc.latency}ms
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
