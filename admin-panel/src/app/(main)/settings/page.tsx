import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { SettingsPasswordForm } from "@/components/settings-password-form";
import { ShieldCheck } from "lucide-react";

export default async function SettingsPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    const user = await getUser(token);

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                    Minha Conta & Segurança
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Gerencie suas credenciais administrativas de acesso ao console.
                </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs divide-y divide-zinc-100 overflow-hidden">
                <div className="p-6 sm:p-8 space-y-4">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <ShieldCheck className="size-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-zinc-900">
                                Identificação do Administrador
                            </h2>
                            <p className="text-xs text-zinc-500">
                                Sessão administrativa autenticada e protegida.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-zinc-600">
                                Nome Completo
                            </Label>
                            <Input
                                defaultValue={user?.name || ""}
                                disabled
                                className="bg-zinc-50 text-zinc-700"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-zinc-600">
                                E-mail
                            </Label>
                            <Input
                                defaultValue={user?.email || ""}
                                disabled
                                className="bg-zinc-50 text-zinc-700 font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8">
                    <SettingsPasswordForm />
                </div>
            </div>
        </div>
    );
}
