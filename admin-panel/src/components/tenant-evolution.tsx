"use client";

import { BarChart3, Users, MessageSquare, Sparkles } from "lucide-react";

interface EvolutionData {
    month: string;
    clients: number;
    messages: number;
    aiRate: number;
}

export function TenantEvolution({ data }: { data: EvolutionData[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="p-12 text-center text-zinc-500">
                <BarChart3 className="size-10 mx-auto opacity-20 mb-2" />
                <p className="text-sm font-medium">
                    Sem dados históricos suficientes para esta empresa.
                </p>
            </div>
        );
    }

    const maxClients = Math.max(...data.map((d) => d.clients), 1);
    const maxMessages = Math.max(...data.map((d) => d.messages), 1);

    const panels = [
        {
            title: "Clientes Ativos por Mês",
            subtitle: "Contatos únicos que interagiram no período",
            icon: Users,
            barColor: "bg-indigo-600",
            badgeColor: "bg-indigo-50 text-indigo-700",
            getValue: (d: EvolutionData) => d.clients,
            format: (v: number) => v.toString(),
            max: maxClients,
        },
        {
            title: "Volume Mensal de Mensagens",
            subtitle: "Total de mensagens trocadas (clientes + IA + equipe)",
            icon: MessageSquare,
            barColor: "bg-emerald-600",
            badgeColor: "bg-emerald-50 text-emerald-700",
            getValue: (d: EvolutionData) => d.messages,
            format: (v: number) => v.toLocaleString("pt-BR"),
            max: maxMessages,
        },
        {
            title: "Taxa de Automação IA (%)",
            subtitle: "Proporção de respostas conduzidas automaticamente",
            icon: Sparkles,
            barColor: "bg-zinc-900",
            badgeColor: "bg-zinc-100 text-zinc-800",
            getValue: (d: EvolutionData) => d.aiRate,
            format: (v: number) => `${v}%`,
            max: 100,
        },
    ];

    return (
        <div className="p-6 sm:p-8 space-y-6">
            <div>
                <h3 className="text-base font-bold text-zinc-950">
                    Evolução Histórica (Últimos 6 Meses)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                    Comparativo mensal consolidado de atendimentos, volume e eficiência dos agentes.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {panels.map((panel) => (
                    <div
                        key={panel.title}
                        className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 flex flex-col justify-between space-y-6"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="text-xs font-bold text-zinc-900">
                                    {panel.title}
                                </h4>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {panel.subtitle}
                                </p>
                            </div>
                            <div
                                className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${panel.badgeColor}`}
                            >
                                <panel.icon className="size-4" />
                            </div>
                        </div>

                        <div className="h-44 flex items-end justify-between gap-2 pt-4">
                            {data.map((d) => {
                                const val = panel.getValue(d);
                                const heightPct = Math.max(
                                    (val / panel.max) * 100,
                                    val > 0 ? 10 : 3
                                );

                                return (
                                    <div
                                        key={d.month}
                                        className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                                    >
                                        <span className="text-[10px] font-mono font-semibold text-zinc-700 tabular-nums">
                                            {panel.format(val)}
                                        </span>
                                        <div className="w-full max-w-[32px] bg-zinc-200/70 rounded-t-md h-28 flex items-end overflow-hidden">
                                            <div
                                                className={`w-full rounded-t-md transition-all duration-500 ${
                                                    val > 0 ? panel.barColor : "bg-zinc-300"
                                                }`}
                                                style={{ height: `${heightPct}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-semibold uppercase text-zinc-400">
                                            {d.month}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
