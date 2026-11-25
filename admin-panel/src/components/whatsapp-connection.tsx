"use client";

import { useState, useEffect } from "react";
import {
    getEvolutionStatus,
    getEvolutionQR,
    disconnectEvolution,
    getInstanceWebhookInfo,
    saveInstanceWebhook,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Loader2,
    QrCode,
    RefreshCw,
    LogOut,
    CheckCircle2,
    Webhook,
    Save,
} from "lucide-react";
import { toast } from "sonner";
import { ModalConfirm } from "@/components/modal-confirm";

interface WhatsAppConnectionProps {
    instanceName: string;
    apiKey?: string;
}

export function WhatsAppConnection({ instanceName, apiKey }: WhatsAppConnectionProps) {
    const [status, setStatus] = useState<string | null>(null);
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const [webhookUrl, setWebhookUrl] = useState("");
    const [currentWebhookUrl, setCurrentWebhookUrl] = useState("");
    const [savingWebhook, setSavingWebhook] = useState(false);

    const checkStatus = async () => {
        try {
            const [data, wh] = await Promise.all([
                getEvolutionStatus(instanceName, apiKey),
                getInstanceWebhookInfo(instanceName, apiKey),
            ]);
            setStatus(data.instance?.state || "error");
            if (data.instance?.state === "open") {
                setQrBase64(null);
            }
            const activeUrl = (wh as any)?.url || "";
            const recommended = (wh as any)?.recommendedUrl || "http://localhost:3000/webhook/evolution";
            setCurrentWebhookUrl(activeUrl);
            setWebhookUrl((prev) => prev || activeUrl || recommended);
        } catch {
            setStatus("error");
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        setActionLoading(true);
        try {
            const data = await getEvolutionQR(instanceName, apiKey);
            const qrCode = data.qrcode?.base64 || data.base64 || data.code?.base64 || data.code;

            if (qrCode && typeof qrCode === "string" && qrCode.startsWith("data:image")) {
                setQrBase64(qrCode);
                toast.success("QR Code gerado com sucesso!");
            } else if (data.instance?.state === "open" || data.state === "open") {
                setStatus("open");
                toast.success("Instância já está conectada.");
            } else {
                toast.error("Não foi possível gerar o QR Code. Verifique se a instância existe na Evolution API.");
            }
        } catch {
            toast.error("Erro ao conectar na Evolution API.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setActionLoading(true);
        try {
            await disconnectEvolution(instanceName, apiKey);
            setStatus("close");
            setQrBase64(null);
            setShowConfirmModal(false);
            toast.success("Desconectado com sucesso.");
        } catch {
            toast.error("Erro ao desconectar.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveWebhook = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingWebhook(true);
        try {
            const res = await saveInstanceWebhook(instanceName, webhookUrl, apiKey);
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                setCurrentWebhookUrl(webhookUrl.trim());
                toast.success("Webhook MESSAGES_UPSERT configurado na Evolution API!");
            }
        } finally {
            setSavingWebhook(false);
        }
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 12000);
        return () => clearInterval(interval);
    }, [instanceName]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                <p className="text-sm text-slate-500">Verificando status da instância e webhook...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900">Conexão WhatsApp & Webhook</h3>
                    <div className="flex items-center gap-2">
                        {status === "open" ? (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-50 border border-emerald-200 text-emerald-700">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Conectado
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-slate-100 border border-slate-200 text-slate-600">
                                <span className="size-1.5 rounded-full bg-slate-400"></span>
                                Desconectado
                            </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tight">
                            Instância: {instanceName}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={checkStatus}
                        disabled={actionLoading}
                        className="h-9 px-4 text-xs font-semibold"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-2 ${actionLoading ? "animate-spin" : ""}`} />
                        Atualizar
                    </Button>
                    {status === "open" && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowConfirmModal(true)}
                            disabled={actionLoading}
                            className="h-9 px-4 text-xs font-semibold bg-red-600 hover:bg-red-700"
                        >
                            <LogOut className="h-3.5 w-3.5 mr-2" />
                            Desconectar
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-8 space-y-8 flex-1 overflow-auto">
                {status !== "open" ? (
                    <div className="max-w-2xl mx-auto flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 space-y-6">
                        {!qrBase64 ? (
                            <div className="text-center space-y-5 max-w-sm">
                                <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-slate-100">
                                    <QrCode className="h-8 w-8 text-[var(--color-brand-primary)]" />
                                </div>
                                <div className="space-y-2">
                                    <p className="font-bold text-slate-900 text-xl tracking-tight">
                                        Vincular Aparelho WhatsApp
                                    </p>
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Conecte o WhatsApp do escritório na Evolution API para ativar a Karol e o Atlas.
                                    </p>
                                </div>
                                <Button
                                    onClick={handleConnect}
                                    disabled={actionLoading}
                                    className="w-full bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white h-11 font-bold"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <QrCode className="mr-2 h-4 w-4" />
                                    )}
                                    Gerar QR Code de Conexão
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center space-y-6">
                                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 inline-block">
                                    <img
                                        src={qrBase64}
                                        alt="Evolution QR Code"
                                        className="w-64 h-64"
                                    />
                                </div>
                                <div className="space-y-2 max-w-xs mx-auto">
                                    <p className="font-bold text-slate-900 text-lg">Escaneie o Código</p>
                                    <p className="text-xs text-slate-500">
                                        WhatsApp {">"} Aparelhos Conectados {">"} Conectar Aparelho.
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setQrBase64(null)}
                                    className="text-slate-500 text-xs"
                                >
                                    Limpar QR Code
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-start gap-4">
                        <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center border border-emerald-200 shrink-0">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-bold text-emerald-900 text-base">
                                WhatsApp Conectado e Ativo
                            </h4>
                            <p className="text-sm text-emerald-700/90">
                                A instância <span className="font-mono font-semibold">{instanceName}</span> está online e atendendo normalmente.
                            </p>
                        </div>
                    </div>
                )}

                {/* Configuração do Webhook */}
                <form
                    onSubmit={handleSaveWebhook}
                    className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                                <Webhook className="size-5" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 text-sm">
                                    Webhook de Mensagens
                                </h4>
                                <p className="text-xs text-slate-500">
                                    Endereço que recebe os eventos de mensagens desta instância em tempo real.
                                </p>
                            </div>
                        </div>
                        {currentWebhookUrl && (
                            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                Webhook Ativo
                            </span>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="webhookUrl" className="text-xs font-semibold text-slate-700">
                            URL do Webhook
                        </Label>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Input
                                id="webhookUrl"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://api.seudominio.com/webhook/evolution"
                                className="font-mono text-xs h-10 flex-1"
                            />
                            <Button
                                type="submit"
                                disabled={savingWebhook}
                                className="bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white h-10 px-5 text-xs font-bold shrink-0"
                            >
                                {savingWebhook ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Salvar Webhook na Evolution
                            </Button>
                        </div>
                        {currentWebhookUrl && (
                            <p className="text-[11px] text-slate-500">
                                Configurado atualmente na Evolution:{" "}
                                <code className="font-mono text-slate-700">{currentWebhookUrl}</code>
                            </p>
                        )}
                    </div>
                </form>
            </div>

            <ModalConfirm
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={handleDisconnect}
                isLoading={actionLoading}
                title="Desconectar WhatsApp?"
                description="Isso interromperá imediatamente todas as automações de IA para este escritório até que uma nova conexão seja feita."
                confirmText="Sim, Desconectar"
                variant="destructive"
            />
        </div>
    );
}
