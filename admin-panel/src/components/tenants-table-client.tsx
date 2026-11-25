"use client";

import { useState, useMemo } from "react";
import {
    Plus,
    Search,
    CheckCircle2,
    AlertCircle,
    WifiOff,
    Users,
    BookOpen,
    Smartphone,
    Building2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TenantActions } from "@/components/tenant-actions";

export function TenantsTableClient({ tenants }: { tenants: any[] }) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

    const stats = useMemo(() => {
        const total = tenants?.length || 0;
        const active = (tenants || []).filter((t) => t.subscription_status === "active").length;
        const connected = (tenants || []).filter(
            (t) => t.evolution_status === "open" || t.evolution_status === "connected"
        ).length;
        return { total, active, connected };
    }, [tenants]);

    const filteredTenants = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (tenants || []).filter((t) => {
            if (statusFilter !== "all" && t.subscription_status !== statusFilter) {
                return false;
            }
            if (!q) return true;
            return (
                t.name?.toLowerCase().includes(q) ||
                t.evolution_instance_name?.toLowerCase().includes(q) ||
                t.id?.toLowerCase().includes(q)
            );
        });
    }, [tenants, search, statusFilter]);

    const renderEvoBadge = (status: string, error?: string | null) => {
        if (status === "open" || status === "connected") {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    Conectado
                </span>
            );
        }
        if (status === "error") {
            return (
                <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-semibold text-red-700"
                    title={error || "Erro na instância"}
                >
                    <AlertCircle className="size-3" />
                    Falha API
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
                <WifiOff className="size-3 text-zinc-400" />
                Desconectado
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Faixa rápida de indicadores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500 font-medium">Total de Escritórios</p>
                        <p className="text-2xl font-bold text-zinc-950 tabular-nums mt-0.5">
                            {stats.total}
                        </p>
                    </div>
                    <div className="size-9 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">
                        <Building2 className="size-4" />
                    </div>
                </div>
                <div className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500 font-medium">Assinaturas Ativas</p>
                        <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-0.5">
                            {stats.active}
                        </p>
                    </div>
                    <div className="size-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 className="size-4" />
                    </div>
                </div>
                <div className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500 font-medium">WhatsApp Online</p>
                        <p className="text-2xl font-bold text-indigo-600 tabular-nums mt-0.5">
                            {stats.connected}
                        </p>
                    </div>
                    <div className="size-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Smartphone className="size-4" />
                    </div>
                </div>
            </div>

            {/* Card Principal de Listagem */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[260px]">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="block w-full h-9 pl-9 pr-3 border border-zinc-200 rounded-lg bg-zinc-50/50 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-all"
                                placeholder="Buscar por escritório, instância ou UUID..."
                                type="text"
                            />
                        </div>

                        <div className="inline-flex items-center rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
                            {(["all", "active", "inactive"] as const).map((st) => (
                                <button
                                    key={st}
                                    type="button"
                                    onClick={() => setStatusFilter(st)}
                                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                                        statusFilter === st
                                            ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                                            : "text-zinc-500 hover:text-zinc-800"
                                    }`}
                                >
                                    {st === "all" ? "Todos" : st === "active" ? "Ativos" : "Inativos"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Button
                        asChild
                        size="sm"
                        className="h-9 bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                    >
                        <Link href="/tenants/new">
                            <Plus className="mr-1.5 size-3.5" />
                            Provisionar Escritório
                        </Link>
                    </Button>
                </div>

                {filteredTenants.length === 0 ? (
                    <div className="p-14 text-center space-y-2">
                        <Building2 className="size-8 text-zinc-300 mx-auto" />
                        <p className="text-sm font-semibold text-zinc-700">
                            Nenhum escritório encontrado
                        </p>
                        <p className="text-xs text-zinc-400">
                            Ajuste a busca acima ou provisione um novo escritório jurídico.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-100">
                        {filteredTenants.map((tenant: any) => (
                            <div
                                key={tenant.id}
                                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-zinc-50/70 transition-colors"
                            >
                                {/* Identidade do Escritório */}
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <Link
                                        href={`/tenants/${tenant.id}`}
                                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white font-bold text-xs shadow-2xs hover:bg-indigo-600 transition-colors"
                                    >
                                        {tenant.name.substring(0, 2).toUpperCase()}
                                    </Link>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/tenants/${tenant.id}`}
                                                className="text-sm font-bold text-zinc-950 hover:text-indigo-600 transition-colors truncate"
                                            >
                                                {tenant.name}
                                            </Link>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                    tenant.subscription_status === "active"
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : "bg-zinc-100 text-zinc-600"
                                                }`}
                                            >
                                                {tenant.subscription_status === "active"
                                                    ? "Ativo"
                                                    : "Inativo"}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-zinc-500">
                                            <span className="font-mono text-[11px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200/70">
                                                {tenant.evolution_instance_name}
                                            </span>
                                            {renderEvoBadge(
                                                tenant.evolution_status,
                                                tenant.evolution_error
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Atalhos diretos p/ Abas do Escritório + Menu */}
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <Link
                                        href={`/tenants/${tenant.id}?tab=clients`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                                    >
                                        <Users className="size-3.5 text-indigo-600" />
                                        Clientes & Dossiê
                                    </Link>
                                    <Link
                                        href={`/tenants/${tenant.id}?tab=knowledge`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                                    >
                                        <BookOpen className="size-3.5 text-emerald-600" />
                                        Base RAG
                                    </Link>
                                    <Link
                                        href={`/tenants/${tenant.id}?tab=whatsapp`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                                    >
                                        <Smartphone className="size-3.5 text-zinc-500" />
                                        WhatsApp
                                    </Link>

                                    <TenantActions tenant={tenant} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
