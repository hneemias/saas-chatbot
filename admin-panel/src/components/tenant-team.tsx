"use client";

import { useState, useTransition } from "react";
import {
    createTeamMember,
    toggleTeamMemberStatus,
    deleteTeamMember,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, UserPlus, Trash2, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantTeamProps {
    tenantId: string;
    members: any[];
}

export function TenantTeam({ tenantId, members }: TenantTeamProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await createTeamMember({
                tenantId,
                name,
                phone,
                role: "admin",
            });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success("Membro da equipe autorizado com sucesso!");
                setName("");
                setPhone("");
                router.refresh();
            }
        });
    };

    const handleToggle = (member: any) => {
        startTransition(async () => {
            const res = await toggleTeamMemberStatus({
                tenantId,
                memberId: member.id,
                currentStatus: member.status,
            });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success(
                    (res as any).status === "active"
                        ? `Assistente interno reativado para ${member.name}.`
                        : `Modo silêncio ativado para ${member.name}.`
                );
                router.refresh();
            }
        });
    };

    const handleDelete = (member: any) => {
        startTransition(async () => {
            const res = await deleteTeamMember({ tenantId, memberId: member.id });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success(`${member.name} removido da equipe interna.`);
                router.refresh();
            }
        });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="size-5 text-[var(--color-brand-primary)]" />
                    Equipe Interna
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                    Números autorizados a consultar o copiloto interno, receber resumos diários e respostas por voz no WhatsApp.
                </p>
            </div>

            <div className="p-8 space-y-8">
                <form
                    onSubmit={handleAdd}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
                >
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-700">
                            Nome do Integrante / Gestor
                        </Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: João Silva"
                            className="bg-white"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-700">
                            WhatsApp (com DDD)
                        </Label>
                        <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Ex: 5511999998888"
                            className="bg-white font-mono"
                            required
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={isPending}
                        className="bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white font-bold h-10"
                    >
                        {isPending ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <UserPlus className="mr-2 size-4" />
                        )}
                        Autorizar Membro
                    </Button>
                </form>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Membros Autorizados ({members.length})
                    </h4>

                    {members.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500 text-sm">
                            Nenhum integrante ou gestor cadastrado nesta empresa ainda.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                            {members.map((m) => (
                                <div
                                    key={m.id}
                                    className="p-4 px-6 flex flex-wrap items-center justify-between gap-4"
                                >
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-900 text-sm">
                                                {m.name}
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                                <Mic className="size-3" /> Acesso Interno & Voz
                                            </span>
                                            {m.status === "paused" && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                                                    Silenciado (!shhh)
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs font-mono text-slate-500">
                                            {m.phone}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <span>{m.status === "paused" ? "Pausado" : "Ativo"}</span>
                                            <Switch
                                                checked={m.status !== "paused"}
                                                onCheckedChange={() => handleToggle(m)}
                                                disabled={isPending}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={isPending}
                                            onClick={() => handleDelete(m)}
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
