import {
    Users,
    MessageSquare,
    Sparkles,
    ArrowUpRight,
    BookOpen,
    ShieldCheck,
    ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface TenantMetricsProps {
    tenantId: string;
    metrics: {
        clients: { total: number; percentage: number };
        messages: { total: number; percentage: number };
        aiRate: string;
        activity: any[];
    };
}

export function TenantMetrics({ metrics }: TenantMetricsProps) {
    return (
        <div className="p-6 sm:p-8 space-y-8">
            {/* KPIs do Escritório */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">
                            Clientes Ativos (30 dias)
                        </span>
                        <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Users className="size-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold text-zinc-950 tabular-nums">
                            {metrics.clients.total}
                        </span>
                        <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                metrics.clients.percentage >= 0
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                            }`}
                        >
                            {metrics.clients.percentage > 0 ? "+" : ""}
                            {metrics.clients.percentage}%
                        </span>
                    </div>
                </div>

                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">
                            Total de Mensagens
                        </span>
                        <div className="size-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                            <MessageSquare className="size-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold text-zinc-950 tabular-nums">
                            {metrics.messages.total.toLocaleString("pt-BR")}
                        </span>
                        <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                metrics.messages.percentage >= 0
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                            }`}
                        >
                            {metrics.messages.percentage > 0 ? "+" : ""}
                            {metrics.messages.percentage}%
                        </span>
                    </div>
                </div>

                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">
                            Índice de Automação IA
                        </span>
                        <div className="size-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Sparkles className="size-4" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <span className="text-3xl font-bold text-zinc-950 tabular-nums">
                            {metrics.aiRate}%
                        </span>
                        <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{
                                    width: `${Math.min(parseFloat(metrics.aiRate) || 0, 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Atalhos Rápidos de Operação */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link
                    href={`?tab=clients`}
                    className="group rounded-xl border border-zinc-200/80 p-4 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <Users className="size-4 text-indigo-600" />
                        <div>
                            <p className="text-xs font-bold text-zinc-900">
                                Clientes & Dossiês
                            </p>
                            <p className="text-[11px] text-zinc-500">
                                Atendimentos, documentos e memória
                            </p>
                        </div>
                    </div>
                    <ArrowUpRight className="size-4 text-zinc-400 group-hover:text-indigo-600" />
                </Link>

                <Link
                    href={`?tab=knowledge`}
                    className="group rounded-xl border border-zinc-200/80 p-4 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <BookOpen className="size-4 text-emerald-600" />
                        <div>
                            <p className="text-xs font-bold text-zinc-900">
                                Base de Conhecimento
                            </p>
                            <p className="text-[11px] text-zinc-500">
                                Honorários, regras e dúvidas frequentes
                            </p>
                        </div>
                    </div>
                    <ArrowUpRight className="size-4 text-zinc-400 group-hover:text-indigo-600" />
                </Link>

                <Link
                    href={`?tab=team`}
                    className="group rounded-xl border border-zinc-200/80 p-4 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="size-4 text-violet-600" />
                        <div>
                            <p className="text-xs font-bold text-zinc-900">
                                Equipe Interna
                            </p>
                            <p className="text-[11px] text-zinc-500">
                                Acesso de sócios, resumos e voz
                            </p>
                        </div>
                    </div>
                    <ArrowUpRight className="size-4 text-zinc-400 group-hover:text-indigo-600" />
                </Link>
            </div>

            {/* Conversas Recentes */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
                    <div>
                        <h3 className="text-sm font-bold text-zinc-900">
                            Conversas Recentes
                        </h3>
                        <p className="text-xs text-zinc-500">
                            Últimos atendimentos deste escritório. Clique para abrir a conversa do cliente.
                        </p>
                    </div>
                    <Link
                        href={`?tab=clients`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                        Ver todos os clientes
                        <ArrowUpRight className="size-3.5" />
                    </Link>
                </div>

                {metrics.activity.length > 0 ? (
                    <div className="divide-y divide-zinc-100">
                        {metrics.activity.map((conv: any) => {
                            const cleanPhone = (conv.phone || "").replace(
                                /@(s\.whatsapp\.net|lid|g\.us)$/i,
                                ""
                            );
                            const href = conv.clientId
                                ? `?tab=clients&clientId=${conv.clientId}&view=chat`
                                : `?tab=clients&q=${encodeURIComponent(cleanPhone)}`;

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

                            const initials = (conv.clientName || "CL")
                                .replace(/^\+/, "")
                                .substring(0, 2)
                                .toUpperCase();

                            return (
                                <Link
                                    key={conv.id}
                                    href={href}
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
                    <div className="p-10 text-center text-xs text-zinc-400">
                        Nenhuma conversa registrada neste escritório até o momento.
                    </div>
                )}
            </div>
        </div>
    );
}
