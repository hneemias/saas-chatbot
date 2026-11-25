"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { updateAIConfig, getEvolutionGroups } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
    Save,
    Bot,
    UserCog,
    Loader2,
    Users,
    Sliders,
    MessageSquare,
} from "lucide-react";

interface AIConfigFormProps {
    tenantId: string;
    initialData?: {
        external_agent_name?: string;
        external_system_prompt?: string;
        internal_agent_name?: string;
        internal_system_prompt?: string;
        temperature?: number;
        notification_group_id?: string;
    } | null;
}

const EXTERNAL_TEMPLATE_TAGS = [
    { tag: "{{ agent_name }}", desc: "Nome desta assistente" },
    { tag: "{{ tenant_name }}", desc: "Nome da empresa" },
    { tag: "{{ internal_agent_name }}", desc: "Nome do copiloto interno" },
];

const INTERNAL_TEMPLATE_TAGS = [
    { tag: "{{ agent_name }}", desc: "Nome deste copiloto" },
    { tag: "{{ tenant_name }}", desc: "Nome da empresa" },
    { tag: "{{ external_agent_name }}", desc: "Nome da assistente externa" },
];

export function AIConfigForm({ tenantId, initialData }: AIConfigFormProps) {
    const [isPending, startTransition] = useTransition();
    const [activeAgentTab, setActiveAgentTab] = useState<"external" | "internal">("external");
    const [manualGroupInput, setManualGroupInput] = useState(false);

    const externalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);

    const [groups, setGroups] = useState<{ id: string; subject: string }[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);

    const [formData, setFormData] = useState({
        external_agent_name: initialData?.external_agent_name || "Karol",
        external_system_prompt: initialData?.external_system_prompt || "",
        internal_agent_name: initialData?.internal_agent_name || "Atlas",
        internal_system_prompt: initialData?.internal_system_prompt || "",
        temperature: initialData?.temperature ?? 0.4,
        notification_group_id: initialData?.notification_group_id || "",
    });

    useEffect(() => {
        setFormData({
            external_agent_name: initialData?.external_agent_name || "Karol",
            external_system_prompt: initialData?.external_system_prompt || "",
            internal_agent_name: initialData?.internal_agent_name || "Atlas",
            internal_system_prompt: initialData?.internal_system_prompt || "",
            temperature: initialData?.temperature ?? 0.4,
            notification_group_id: initialData?.notification_group_id || "",
        });
    }, [tenantId, initialData]);

    useEffect(() => {
        async function fetchGroups() {
            setIsLoadingGroups(true);
            try {
                const result = await getEvolutionGroups(tenantId);
                let groupList: any[] = [];
                if (Array.isArray(result)) {
                    groupList = result;
                } else if (result && typeof result === "object") {
                    if ((result as any).error) throw new Error((result as any).error);
                    groupList = (result as any).groups || (result as any).data || [];
                }
                if (Array.isArray(groupList) && groupList.length > 0) {
                    setGroups(
                        groupList.map((g: any) => ({
                            id: g.id || g.remoteJid || g.jid,
                            subject: g.subject || g.name || g.id,
                        }))
                    );
                } else {
                    setManualGroupInput(true);
                }
            } catch {
                setManualGroupInput(true);
            } finally {
                setIsLoadingGroups(false);
            }
        }
        fetchGroups();
    }, [tenantId]);

    const insertTagAtCursor = (tag: string, target: "external" | "internal") => {
        const textarea =
            target === "external" ? externalTextareaRef.current : internalTextareaRef.current;
        const fieldKey =
            target === "external" ? "external_system_prompt" : "internal_system_prompt";
        const currentValue = formData[fieldKey];

        if (!textarea) {
            setFormData((prev) => ({
                ...prev,
                [fieldKey]: `${prev[fieldKey]}${prev[fieldKey].endsWith(" ") ? "" : " "}${tag}`,
            }));
            return;
        }

        const start = textarea.selectionStart ?? currentValue.length;
        const end = textarea.selectionEnd ?? currentValue.length;
        const nextValue =
            currentValue.slice(0, start) + tag + currentValue.slice(end);

        setFormData((prev) => ({ ...prev, [fieldKey]: nextValue }));

        requestAnimationFrame(() => {
            textarea.focus();
            const cursor = start + tag.length;
            textarea.setSelectionRange(cursor, cursor);
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const result = await updateAIConfig(tenantId, {
                ...formData,
                notification_group_id: formData.notification_group_id.trim() || null,
            });
            if (result.success) {
                toast.success("Configurações salvas com sucesso!");
            } else {
                toast.error("Erro ao salvar: " + result.error);
            }
        });
    };

    const activeTags =
        activeAgentTab === "external" ? EXTERNAL_TEMPLATE_TAGS : INTERNAL_TEMPLATE_TAGS;

    return (
        <form onSubmit={handleSubmit} className="divide-y divide-zinc-100">
            {/* Cabeçalho */}
            <div className="px-6 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50">
                <div>
                    <h3 className="text-base font-bold text-zinc-950">
                        Agentes de Inteligência Artificial
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Personalize a identidade, instruções e postura do atendimento externo e interno.
                    </p>
                </div>

                {/* Seletor Externo vs Interno */}
                <div className="inline-flex items-center rounded-xl bg-zinc-200/70 p-1 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setActiveAgentTab("external")}
                        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 transition-all cursor-pointer ${
                            activeAgentTab === "external"
                                ? "bg-white text-zinc-950 shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900"
                        }`}
                    >
                        <Bot className="size-3.5 text-indigo-600" />
                        Clientes: {formData.external_agent_name || "Assistente"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveAgentTab("internal")}
                        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 transition-all cursor-pointer ${
                            activeAgentTab === "internal"
                                ? "bg-white text-zinc-950 shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900"
                        }`}
                    >
                        <UserCog className="size-3.5 text-emerald-600" />
                        Equipe: {formData.internal_agent_name || "Copiloto"}
                    </button>
                </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
                {activeAgentTab === "external" ? (
                    <div className="space-y-5">
                        <div className="max-w-sm space-y-1.5">
                            <Label htmlFor="external_name" className="text-xs font-semibold text-zinc-700">
                                Nome da Assistente (Clientes)
                            </Label>
                            <Input
                                id="external_name"
                                value={formData.external_agent_name}
                                onChange={(e) =>
                                    setFormData({ ...formData, external_agent_name: e.target.value })
                                }
                                placeholder="Ex: Karol"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label
                                    htmlFor="external_prompt"
                                    className="text-xs font-semibold text-zinc-700"
                                >
                                    Instruções de Atendimento
                                </Label>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] text-zinc-400 mr-1">Inserir variável:</span>
                                    {activeTags.map((item) => (
                                        <button
                                            key={item.tag}
                                            type="button"
                                            onClick={() => insertTagAtCursor(item.tag, "external")}
                                            title={item.desc}
                                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-mono font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer"
                                        >
                                            {item.tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Textarea
                                ref={externalTextareaRef}
                                id="external_prompt"
                                value={formData.external_system_prompt}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        external_system_prompt: e.target.value,
                                    })
                                }
                                placeholder="Defina o tom de voz, roteiro de triagem e regras de atendimento..."
                                className="min-h-[380px] font-mono text-xs leading-relaxed bg-zinc-50/40 focus:bg-white"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="max-w-sm space-y-1.5">
                            <Label htmlFor="internal_name" className="text-xs font-semibold text-zinc-700">
                                Nome do Copiloto (Equipe Interna)
                            </Label>
                            <Input
                                id="internal_name"
                                value={formData.internal_agent_name}
                                onChange={(e) =>
                                    setFormData({ ...formData, internal_agent_name: e.target.value })
                                }
                                placeholder="Ex: Atlas"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label
                                    htmlFor="internal_prompt"
                                    className="text-xs font-semibold text-zinc-700"
                                >
                                    Instruções do Copiloto
                                </Label>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] text-zinc-400 mr-1">Inserir variável:</span>
                                    {activeTags.map((item) => (
                                        <button
                                            key={item.tag}
                                            type="button"
                                            onClick={() => insertTagAtCursor(item.tag, "internal")}
                                            title={item.desc}
                                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-mono font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer"
                                        >
                                            {item.tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Textarea
                                ref={internalTextareaRef}
                                id="internal_prompt"
                                value={formData.internal_system_prompt}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        internal_system_prompt: e.target.value,
                                    })
                                }
                                placeholder="Defina como o copiloto apoia a equipe interna, gera resumos e responde por voz..."
                                className="min-h-[380px] font-mono text-xs leading-relaxed bg-zinc-50/40 focus:bg-white"
                            />
                        </div>
                    </div>
                )}

                {/* Parâmetros & Grupo de Alerta */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-100">
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-xs font-bold text-zinc-800">
                                <Sliders className="size-3.5 text-indigo-600" />
                                Temperatura de Resposta
                            </span>
                            <span className="rounded-md bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
                                {formData.temperature.toFixed(1)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={formData.temperature}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    temperature: parseFloat(e.target.value),
                                })
                            }
                            className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-[10px] font-medium text-zinc-400">
                            <span>0.0 (Mais objetivo)</span>
                            <span>0.4 (Equilibrado)</span>
                            <span>1.0 (Mais criativo)</span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-xs font-bold text-zinc-800">
                                <MessageSquare className="size-3.5 text-indigo-600" />
                                Grupo de Alertas no WhatsApp
                            </span>
                            <button
                                type="button"
                                onClick={() => setManualGroupInput((v) => !v)}
                                className="text-[11px] font-medium text-indigo-600 hover:underline cursor-pointer"
                            >
                                {manualGroupInput ? "Selecionar da lista" : "Digitar ID manual"}
                            </button>
                        </div>

                        {isLoadingGroups ? (
                            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                                <Loader2 className="size-3.5 animate-spin" />
                                Carregando grupos...
                            </div>
                        ) : manualGroupInput || groups.length === 0 ? (
                            <Input
                                value={formData.notification_group_id}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        notification_group_id: e.target.value,
                                    })
                                }
                                placeholder="Ex: 12036304999999@g.us"
                                className="bg-white font-mono text-xs"
                            />
                        ) : (
                            <Select
                                value={formData.notification_group_id}
                                onValueChange={(val) =>
                                    setFormData({ ...formData, notification_group_id: val })
                                }
                            >
                                <SelectTrigger className="bg-white text-xs">
                                    <SelectValue placeholder="Selecione um grupo do WhatsApp" />
                                </SelectTrigger>
                                <SelectContent>
                                    {groups.map((g) => (
                                        <SelectItem key={g.id} value={g.id}>
                                            <span className="flex items-center gap-2 text-xs">
                                                <Users className="size-3.5 text-zinc-400" />
                                                <span className="font-medium">{g.subject}</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-[11px] text-zinc-500">
                            Recebe avisos de novas triagens concluídas e solicitações de atendimento humano.
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-6 sm:px-8 py-4 bg-zinc-50/70 flex items-center justify-end">
                <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold px-6 h-10 rounded-xl shadow-xs"
                >
                    {isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 size-4" />
                    )}
                    Salvar Alterações
                </Button>
            </div>
        </form>
    );
}
