"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Building2,
    PlusCircle,
    Settings,
    LogOut,
    Bot,
    Sparkles,
} from "lucide-react";
import { logout } from "@/app/login/actions";

interface SidebarProps {
    user?: {
        name?: string;
        email?: string;
        role?: string;
        user_metadata?: {
            full_name?: string;
            role?: string;
        };
    } | null;
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();

    const mainNav = [
        { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
        { href: "/tenants", label: "Empresas", icon: Building2 },
        { href: "/tenants/new", label: "Nova Empresa", icon: PlusCircle },
    ];

    const systemNav = [
        { href: "/settings", label: "Minha Conta & Senha", icon: Settings },
    ];

    const userDisplayName =
        user?.name ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Administrador";

    const userEmail = user?.email || "Console Administrativo";
    const userInitials = userDisplayName
        .split(" ")
        .filter(Boolean)
        .map((n: string) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

    const isRouteActive = (href: string) => {
        if (href === "/tenants") {
            return (
                pathname === "/tenants" ||
                (pathname?.startsWith("/tenants/") && pathname !== "/tenants/new")
            );
        }
        return pathname === href;
    };

    return (
        <aside className="hidden lg:flex h-full w-[252px] shrink-0 flex-col justify-between bg-zinc-950 text-zinc-300 border-r border-zinc-900 select-none">
            {/* Brand Header */}
            <div>
                <div className="flex h-16 items-center justify-between px-5 border-b border-zinc-900">
                    <Link href="/dashboard" className="flex items-center gap-2.5 group">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/25 group-hover:scale-105 transition-transform">
                            <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight text-white leading-none">
                                AtendeAI
                            </span>
                            <span className="text-[10px] font-medium text-zinc-500 mt-1 leading-none">
                                Multi-Empresa v2.0
                            </span>
                        </div>
                    </Link>
                </div>

                {/* Navigation */}
                <div className="px-3 py-5 space-y-6">
                    <div className="space-y-1">
                        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                            Operação
                        </p>
                        {mainNav.map((item) => {
                            const active = isRouteActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                                        active
                                            ? "bg-zinc-900 text-white shadow-xs ring-1 ring-zinc-800"
                                            : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100"
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            "size-4 transition-colors",
                                            active ? "text-indigo-400" : "text-zinc-500"
                                        )}
                                    />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>

                    <div className="space-y-1">
                        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                            Sistema
                        </p>
                        {systemNav.map((item) => {
                            const active = isRouteActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                                        active
                                            ? "bg-zinc-900 text-white shadow-xs ring-1 ring-zinc-800"
                                            : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100"
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            "size-4 transition-colors",
                                            active ? "text-indigo-400" : "text-zinc-500"
                                        )}
                                    />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom Card & User */}
            <div className="p-3 space-y-3">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                        <Sparkles className="size-3.5 text-indigo-400" />
                        <span>Atendimento Inteligente</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Base de conhecimento, catálogo e dossiês isolados por empresa.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-900 bg-zinc-900/70 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/30 text-xs font-bold">
                        {userInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-100">
                            {userDisplayName}
                        </p>
                        <p className="truncate text-[10px] text-zinc-500">
                            {userEmail}
                        </p>
                    </div>
                    <form action={logout}>
                        <button
                            type="submit"
                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                            title="Encerrar sessão"
                        >
                            <LogOut className="size-4" />
                        </button>
                    </form>
                </div>
            </div>
        </aside>
    );
}
