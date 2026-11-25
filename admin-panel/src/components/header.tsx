"use client";

import {
    ChevronRight,
    Plus,
    Menu,
    LayoutDashboard,
    Building2,
    Settings,
    Scale,
    LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { logout } from "@/app/login/actions";

interface HeaderProps {
    user?: {
        name?: string;
        email?: string;
    } | null;
}

export function Header({ user }: HeaderProps) {
    const pathname = usePathname();
    const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);

    const pathSegments = pathname.split("/").filter(Boolean);

    const getSegmentLabel = (segment: string) => {
        const labels: Record<string, string> = {
            dashboard: "Visão Geral",
            tenants: "Escritórios",
            settings: "Configurações",
            new: "Novo Escritório",
        };

        const isUUID =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                segment
            );
        if (isUUID) return dynamicTitle || "Escritório";

        return labels[segment] || segment;
    };

    useEffect(() => {
        const handleTitleChange = (e: any) => {
            setDynamicTitle(e.detail);
        };
        window.addEventListener("app-title-change", handleTitleChange);
        return () => window.removeEventListener("app-title-change", handleTitleChange);
    }, []);

    return (
        <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/85 backdrop-blur-md px-5 sm:px-8 z-20">
            <div className="flex items-center gap-3 min-w-0">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-600 hover:bg-zinc-100"
                    aria-label="Abrir menu"
                >
                    <Menu className="size-5" />
                </button>

                {/* Breadcrumb Limpo */}
                <nav className="flex items-center gap-1.5 text-xs sm:text-[13px] text-zinc-500 truncate">
                    <Link
                        href="/dashboard"
                        className="font-medium hover:text-zinc-900 transition-colors"
                    >
                        Console
                    </Link>
                    {pathSegments.map((segment, index) => {
                        const isLast = index === pathSegments.length - 1;
                        const label = getSegmentLabel(segment);
                        const href = "/" + pathSegments.slice(0, index + 1).join("/");

                        return (
                            <div key={href} className="flex items-center gap-1.5 min-w-0">
                                <ChevronRight className="size-3.5 text-zinc-300 shrink-0" />
                                {isLast ? (
                                    <span className="font-semibold text-zinc-900 truncate">
                                        {label}
                                    </span>
                                ) : (
                                    <Link
                                        href={href}
                                        className="hover:text-zinc-900 transition-colors truncate"
                                    >
                                        {label}
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </nav>
            </div>

            {/* Ações Reais */}
            <div className="flex items-center gap-2.5 shrink-0">
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex h-9 text-xs font-medium border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                    <Link href="/tenants">Escritórios</Link>
                </Button>
                <Button
                    asChild
                    size="sm"
                    className="h-9 bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                >
                    <Link href="/tenants/new">
                        <Plus className="mr-1.5 size-3.5" />
                        Novo Escritório
                    </Link>
                </Button>
            </div>

            {/* Menu Mobile */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetContent side="left" className="w-72 bg-zinc-950 text-white border-zinc-800 p-5">
                    <SheetHeader className="p-0 pb-4 border-b border-zinc-800">
                        <SheetTitle className="flex items-center gap-2.5 text-white text-base">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                                <Scale className="size-4" />
                            </div>
                            JurisAI Console
                        </SheetTitle>
                    </SheetHeader>

                    <div className="py-4 space-y-1">
                        {[
                            { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
                            { href: "/tenants", label: "Escritórios", icon: Building2 },
                            { href: "/settings", label: "Configurações", icon: Settings },
                        ].map((it) => (
                            <Link
                                key={it.href}
                                href={it.href}
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white"
                            >
                                <it.icon className="size-4 text-indigo-400" />
                                {it.label}
                            </Link>
                        ))}
                    </div>

                    <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center justify-between">
                        <span className="text-xs text-zinc-400 truncate">
                            {user?.email || "Administrador"}
                        </span>
                        <form action={logout}>
                            <button
                                type="submit"
                                className="p-2 text-zinc-400 hover:text-red-400"
                                title="Sair"
                            >
                                <LogOut className="size-4" />
                            </button>
                        </form>
                    </div>
                </SheetContent>
            </Sheet>
        </header>
    );
}
