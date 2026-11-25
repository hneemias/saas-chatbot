"use client";

import { useState, useTransition } from "react";
import { generatePromptWithAI } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Sparkles,
    Wand2,
    ChevronDown,
    ChevronUp,
    Loader2,
    Check,
    Copy,
    BookOpen,
    ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

interface AIPromptAssistantProps {
    tenantId: string;
    agentType: "external" | "internal";
    currentPrompt: string;
    onApplyPrompt: (newPrompt: string) => void;
}

export function AIPromptAssistant({
    tenantId,
    agentType,
    currentPrompt,
    onApplyPrompt,
}: AIPromptAssistantProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const [briefing, setBriefing] = useState("");
    const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
    const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isExternal = agentType === "external";

    const handleGenerate = () => {
        if (!briefing.trim() && (!currentPrompt || currentPrompt.trim().length < 10)) {
            toast.error("Informe instruções ou briefing sobre a empresa para gerar o prompt.");
            return;
        }

        startTransition(async () => {
            const res = await generatePromptWithAI({
                tenantId,
                agentType,
                briefing: briefing.trim() || "Aprimore o prompt atual seguindo as diretrizes oficiais da plataforma.",
                useKnowledgeBase,
                currentPrompt: currentPrompt.trim(),
            });

            if (res.success && res.prompt) {
                setGeneratedPrompt(res.prompt);
                toast.success("Prompt gerado com sucesso pela inteligência artificial!");
            } else {
                toast.error("Erro ao gerar prompt: " + (res.error || "Tente novamente."));
            }
        });
    };

    const handleApply = () => {
        if (!generatedPrompt) return;
        onApplyPrompt(generatedPrompt);
        toast.success(
            isExternal
                ? "Prompt aplicado ao campo de atendimento a clientes!"
                : "Prompt aplicado ao campo de copiloto interno!"
        );
    };

    const handleCopy = () => {
        if (!generatedPrompt) return;
        navigator.clipboard.writeText(generatedPrompt);
        setCopied(true);
        toast.success("Prompt copiado para a área de transferência!");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-2xl border border-indigo-200/90 bg-linear-to-b from-indigo-50/60 to-white shadow-xs overflow-hidden transition-all">
            {/* Cabeçalho Expansível */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-indigo-50/40 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Sparkles className="size-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-950">
                                Assistente Inteligente de Prompt
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                IA + RAG
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                            Crie ou aprimore o prompt a partir de um briefing e dos documentos da empresa.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-indigo-700 hidden sm:inline">
                        {isOpen ? "Recolher assistente" : "Abrir assistente"}
                    </span>
                    <div className="size-7 rounded-lg bg-indigo-100/70 text-indigo-700 flex items-center justify-center">
                        {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                </div>
            </button>

            {/* Conteúdo Expansível */}
            {isOpen && (
                <div className="p-5 sm:p-6 border-t border-indigo-100/80 space-y-5 bg-white/60">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-zinc-800">
                                Briefing & Regras da Empresa
                            </Label>
                            <span className="text-[11px] text-zinc-400">
                                Descreva serviços, horários, tom de voz e diferenciais
                            </span>
                        </div>
                        <Textarea
                            value={briefing}
                            onChange={(e) => setBriefing(e.target.value)}
                            placeholder="Ex: Somos uma clínica odontológica em Pinheiros/SP. Atendemos de seg a sex das 8h às 19h. Fazemos clareamento, implantes e emergências. Tom amigável, acolhedor e ágil, com foco em entender a queixa do paciente e agendar uma avaliação..."
                            className="min-h-[100px] text-xs bg-white focus:bg-white leading-relaxed"
                        />
                    </div>

                    {/* Toggle de inclusão do RAG */}
                    <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/40">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                                <BookOpen className="size-3.5 text-indigo-600" />
                                <span className="text-xs font-bold text-zinc-900">
                                    Consultar Base de Conhecimento desta empresa (RAG)
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500">
                                A IA usará os documentos já cadastrados na empresa (serviços, regras, preços) para enriquecer o prompt.
                            </p>
                        </div>
                        <Switch
                            checked={useKnowledgeBase}
                            onCheckedChange={setUseKnowledgeBase}
                        />
                    </div>

                    {/* Botão de Ação Principal */}
                    <div className="flex items-center justify-end gap-2.5">
                        <Button
                            type="button"
                            disabled={isPending}
                            onClick={handleGenerate}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-5 rounded-xl shadow-xs"
                        >
                            {isPending ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                                <Wand2 className="mr-2 size-4" />
                            )}
                            {currentPrompt && currentPrompt.trim().length > 20
                                ? "Otimizar Prompt Atual com IA"
                                : "Gerar Novo Prompt com IA"}
                        </Button>
                    </div>

                    {/* Pré-visualização do Prompt Gerado */}
                    {generatedPrompt && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3 animate-in fade-in-50 duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-950">
                                        Prompt Pronto para Produção
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        className="h-8 text-xs bg-white text-zinc-700"
                                    >
                                        {copied ? <Check className="mr-1.5 size-3.5 text-emerald-600" /> : <Copy className="mr-1.5 size-3.5" />}
                                        {copied ? "Copiado!" : "Copiar"}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleApply}
                                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                    >
                                        <ArrowRight className="mr-1.5 size-3.5" />
                                        Aplicar ao Prompt
                                    </Button>
                                </div>
                            </div>

                            <Textarea
                                value={generatedPrompt}
                                onChange={(e) => setGeneratedPrompt(e.target.value)}
                                className="min-h-[220px] font-mono text-xs bg-white leading-relaxed"
                            />

                            <p className="text-[11px] text-zinc-500">
                                Clique em <strong>Aplicar ao Prompt</strong> para transferir o texto para o campo principal e salvar as configurações da empresa.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
