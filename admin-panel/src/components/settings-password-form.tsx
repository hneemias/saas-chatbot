"use client";

import { useState, useTransition } from "react";
import { updateAdminPassword } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SettingsPasswordForm() {
    const [isPending, startTransition] = useTransition();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("currentPassword", currentPassword);
        fd.set("newPassword", newPassword);

        startTransition(async () => {
            const res = await updateAdminPassword(fd);
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                setCurrentPassword("");
                setNewPassword("");
                toast.success("Senha atualizada com sucesso!");
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">
                    <Lock className="size-4" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-zinc-900">Alterar Senha</h3>
                    <p className="text-xs text-zinc-500">
                        Use uma senha forte com no mínimo 6 caracteres.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="currentPassword" className="text-xs font-semibold text-zinc-700">
                        Senha Atual
                    </Label>
                    <Input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-xs font-semibold text-zinc-700">
                        Nova Senha
                    </Label>
                    <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                    />
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold px-6 h-10 rounded-xl"
                >
                    {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Atualizar Senha
                </Button>
            </div>
        </form>
    );
}
