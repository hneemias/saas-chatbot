"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";
import { toast } from "sonner";
import {
    Bot,
    ArrowRight,
    AlertCircle,
    Eye,
    EyeOff,
    Mail,
    Lock,
    Sparkles,
    ShieldCheck,
    Mic,
} from "lucide-react";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            className="w-full h-11 bg-zinc-950 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            type="submit"
            disabled={pending}
        >
            <span>{pending ? "Autenticando..." : "Acessar Console"}</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
    );
}

export default function LoginPage() {
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-zinc-50">
            {/* Painel Institucional Escuro (Esquerda) */}
            <div className="hidden lg:flex lg:col-span-5 xl:col-span-6 flex-col justify-between bg-zinc-950 text-white p-12 xl:p-16 relative overflow-hidden">
                {/* Glow sutil de fundo */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-40"
                    style={{
                        background:
                            "radial-gradient(circle at 15% 20%, rgba(79, 70, 229, 0.28), transparent 45%), radial-gradient(circle at 85% 85%, rgba(16, 185, 129, 0.14), transparent 40%)",
                    }}
                />
                <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                        backgroundSize: "32px 32px",
                    }}
                />

                {/* Topo / Marca */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                        <Bot className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-lg font-bold tracking-tight text-white">
                            AtendeAI
                        </span>
                        <span className="ml-2 rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                            Enterprise v2.0
                        </span>
                    </div>
                </div>

                {/* Destaque Central */}
                <div className="relative z-10 max-w-lg space-y-8">
                    <div className="space-y-4">
                        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-400">
                            <Sparkles className="size-3.5" />
                            Atendimento Inteligente Multitenant
                        </p>
                        <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-[1.15]">
                            Atendimento comercial e operacional rápido, humano e organizado.
                        </h1>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Centralize a operação de múltiplas empresas no WhatsApp, qualifique clientes, consulte produtos em estoque e gerencie dossiês individuais.
                        </p>
                    </div>

                    <div className="space-y-3 pt-2">
                        {[
                            {
                                icon: Sparkles,
                                title: "Atendimento, Catálogo & Triagem",
                                desc: "Responde dúvidas, consulta produtos com fotos e encaminha demandas prontas para a equipe.",
                            },
                            {
                                icon: ShieldCheck,
                                title: "Dossiê Individual por Cliente",
                                desc: "Documentos, ordens de serviço e atualizações sob controle explícito da empresa.",
                            },
                            {
                                icon: Mic,
                                title: "Copiloto da Equipe por Voz",
                                desc: "Resumos diários e consultas rápidas por áudio para gestores e especialistas.",
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="flex items-start gap-3.5 rounded-xl border border-zinc-800/90 bg-zinc-900/60 p-4 backdrop-blur-xs"
                            >
                                <div className="rounded-lg bg-zinc-800 p-2 text-indigo-400 shrink-0">
                                    <item.icon className="size-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-zinc-100">
                                        {item.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {item.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Rodapé Esquerdo */}
                <div className="relative z-10 flex items-center justify-between text-xs text-zinc-500">
                    <span>© {new Date().getFullYear()} AtendeAI Cloud</span>
                    <span className="text-[11px] text-zinc-500">
                        Plataforma de Atendimento Inteligente
                    </span>
                </div>
            </div>

            {/* Área do Formulário (Direita) */}
            <div className="lg:col-span-7 xl:col-span-6 flex flex-col items-center justify-center p-6 sm:p-12">
                <div className="w-full max-w-[420px] space-y-8">
                    {/* Logo Mobile */}
                    <div className="flex lg:hidden items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
                            <Bot className="h-4 w-4" />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-zinc-900">
                            AtendeAI Console
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-8 sm:p-10 space-y-6">
                        <div className="space-y-1.5">
                            <h2 className="text-2xl font-bold tracking-tight text-zinc-950">
                                Entrar no Console
                            </h2>
                            <p className="text-sm text-zinc-500">
                                Use suas credenciais administrativas para gerenciar as empresas.
                            </p>
                        </div>

                        <form
                            action={async (formData) => {
                                setErrorMsg(null);
                                const res = await login(formData);
                                if (res?.error) {
                                    setErrorMsg(res.error);
                                    toast.error(res.error);
                                }
                            }}
                            className="space-y-5"
                        >
                            {errorMsg && (
                                <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium text-red-700">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label
                                    className="text-xs font-semibold text-zinc-700"
                                    htmlFor="email"
                                >
                                    E-mail administrativo
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400 pointer-events-none" />
                                    <input
                                        className="w-full h-11 pl-10 pr-4 bg-zinc-50/60 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-all"
                                        id="email"
                                        name="email"
                                        placeholder="seu@email.com"
                                        type="email"
                                        autoComplete="email"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label
                                    className="text-xs font-semibold text-zinc-700"
                                    htmlFor="password"
                                >
                                    Senha
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400 pointer-events-none" />
                                    <input
                                        className="w-full h-11 pl-10 pr-10 bg-zinc-50/60 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-all"
                                        id="password"
                                        name="password"
                                        placeholder="••••••••"
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="size-4" />
                                        ) : (
                                            <Eye className="size-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <SubmitButton />
                        </form>
                    </div>

                    <p className="text-center text-xs text-zinc-400">
                        Acesso restrito a administradores autorizados.
                    </p>
                </div>
            </div>
        </div>
    );
}
