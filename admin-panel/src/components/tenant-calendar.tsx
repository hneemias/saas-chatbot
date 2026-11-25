"use client";

import { useState, useTransition } from "react";
import { updateCalendarConfig } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantCalendarProps {
    tenantId: string;
    initialConfig?: Record<string, any> | null;
}

const WEEK_DAYS = [
    { day: 1, label: "Seg" },
    { day: 2, label: "Ter" },
    { day: 3, label: "Qua" },
    { day: 4, label: "Qui" },
    { day: 5, label: "Sex" },
    { day: 6, label: "Sáb" },
    { day: 0, label: "Dom" },
];

export function TenantCalendar({ tenantId, initialConfig }: TenantCalendarProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const cfg = initialConfig || {};
    const [enabled, setEnabled] = useState<boolean>(Boolean(cfg.enabled));
    const [calendarId, setCalendarId] = useState<string>(cfg.calendar_id || "primary");
    const [businessStart, setBusinessStart] = useState<string>(cfg.business_start || "09:00");
    const [businessEnd, setBusinessEnd] = useState<string>(cfg.business_end || "18:00");
    const [lunchStart, setLunchStart] = useState<string>(cfg.lunch_start || "12:00");
    const [lunchEnd, setLunchEnd] = useState<string>(cfg.lunch_end || "13:00");
    const [workDays, setWorkDays] = useState<number[]>(cfg.work_days || [1, 2, 3, 4, 5]);
    const [clientId, setClientId] = useState<string>(cfg.client_id || "");
    const [clientSecret, setClientSecret] = useState<string>(cfg.client_secret || "");
    const [refreshToken, setRefreshToken] = useState<string>(cfg.refresh_token || "");

    const toggleDay = (d: number) => {
        setWorkDays((prev) =>
            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await updateCalendarConfig(tenantId, {
                enabled,
                calendar_id: calendarId.trim() || "primary",
                business_start: businessStart,
                business_end: businessEnd,
                lunch_start: lunchStart,
                lunch_end: lunchEnd,
                work_days: workDays,
                client_id: clientId.trim(),
                client_secret: clientSecret.trim(),
                refresh_token: refreshToken.trim(),
            });

            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success("Configurações do Google Calendar salvas!");
                router.refresh();
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="size-5 text-[var(--color-brand-primary)]" />
                        Agenda & Horário de Atendimento
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Defina os dias de expediente e conecte o Google Calendar para consulta de disponibilidade e agendamentos.
                    </p>
                </div>

                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">
                        {enabled ? "Agenda Ativa" : "Agenda Desativada"}
                    </span>
                    <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
            </div>

            <div className="p-6 sm:p-8 space-y-8">
                <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-700">
                        Dias de Atendimento
                    </Label>
                    <div className="flex flex-wrap gap-2">
                        {WEEK_DAYS.map((w) => {
                            const active = workDays.includes(w.day);
                            return (
                                <button
                                    key={w.day}
                                    type="button"
                                    onClick={() => toggleDay(w.day)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                        active
                                            ? "bg-[var(--color-brand-primary)] text-white border-[var(--color-brand-primary)]"
                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    {w.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Início Expediente</Label>
                        <Input
                            type="time"
                            value={businessStart}
                            onChange={(e) => setBusinessStart(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Fim Expediente</Label>
                        <Input
                            type="time"
                            value={businessEnd}
                            onChange={(e) => setBusinessEnd(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Início Almoço</Label>
                        <Input
                            type="time"
                            value={lunchStart}
                            onChange={(e) => setLunchStart(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Fim Almoço</Label>
                        <Input
                            type="time"
                            value={lunchEnd}
                            onChange={(e) => setLunchEnd(e.target.value)}
                        />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Credenciais OAuth2 Google Cloud
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Calendar ID</Label>
                            <Input
                                value={calendarId}
                                onChange={(e) => setCalendarId(e.target.value)}
                                placeholder="primary ou email@gmail.com"
                                className="bg-white font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Google OAuth Client ID</Label>
                            <Input
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder="xxx.apps.googleusercontent.com"
                                className="bg-white font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Google OAuth Client Secret</Label>
                            <Input
                                type="password"
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                placeholder="GOCSPX-..."
                                className="bg-white font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Google OAuth Refresh Token</Label>
                            <Input
                                type="password"
                                value={refreshToken}
                                onChange={(e) => setRefreshToken(e.target.value)}
                                placeholder="1//04..."
                                className="bg-white font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 sm:px-8 py-4 border-t border-zinc-100 bg-zinc-50/70 flex items-center justify-end">
                <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold px-6 h-10 rounded-xl"
                >
                    {isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 size-4" />
                    )}
                    Salvar Agenda
                </Button>
            </div>
        </form>
    );
}
