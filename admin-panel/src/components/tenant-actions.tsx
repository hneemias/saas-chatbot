"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalConfirm } from "@/components/modal-confirm";
import { MoreHorizontal, Settings2, Trash2, Power } from "lucide-react";
import Link from "next/link";
import { deleteTenant, toggleTenantStatus } from "@/app/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantActionsProps {
    tenant: {
        id: string;
        subscription_status: string | null;
        name: string;
    };
}

export function TenantActions({ tenant }: TenantActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const handleConfirmDelete = () => {
        startTransition(async () => {
            const res = await deleteTenant(tenant.id);
            if (res.message === "success") {
                setConfirmDeleteOpen(false);
                toast.success("Empresa excluída com sucesso.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const handleToggleStatus = () => {
        const newStatus =
            tenant.subscription_status === "active" ? "inactive" : "active";
        startTransition(async () => {
            const res = await toggleTenantStatus(
                tenant.id,
                tenant.subscription_status || "active"
            );
            if (res.message === "success") {
                toast.success(
                    `Status alterado para ${newStatus === "active" ? "Ativo" : "Inativo"}.`
                );
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-zinc-100 rounded-lg"
                    >
                        <span className="sr-only">Abrir ações</span>
                        <MoreHorizontal className="h-4 w-4 text-zinc-500" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-52 p-1.5 rounded-xl border border-zinc-200 shadow-lg bg-white"
                >
                    <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                        {tenant.name}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer text-xs">
                        <Link
                            href={`/tenants/${tenant.id}?tab=general`}
                            className="flex items-center gap-2.5 py-2"
                        >
                            <Settings2 className="size-3.5 text-zinc-500" />
                            <span>Configurar Instância</span>
                        </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        onClick={handleToggleStatus}
                        disabled={isPending}
                        className="rounded-lg cursor-pointer text-xs flex items-center gap-2.5 py-2"
                    >
                        <Power
                            className={`size-3.5 ${
                                tenant.subscription_status === "active"
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                            }`}
                        />
                        <span>
                            {tenant.subscription_status === "active"
                                ? "Pausar Assinatura"
                                : "Reativar Assinatura"}
                        </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        onClick={() => setConfirmDeleteOpen(true)}
                        className="rounded-lg cursor-pointer text-xs text-red-600 focus:text-red-700 focus:bg-red-50 flex items-center gap-2.5 py-2"
                    >
                        <Trash2 className="size-3.5" />
                        <span>Excluir Empresa</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ModalConfirm
                isOpen={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={handleConfirmDelete}
                isLoading={isPending}
                title={`Excluir "${tenant.name}"?`}
                description="Esta ação removerá permanentemente a empresa, suas configurações, clientes, catálogo, mensagens e documentos vinculados."
                confirmText="Sim, Excluir"
                variant="destructive"
            />
        </>
    );
}
