"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import {
    setClientAiStatus,
    updateClientProfile,
    updateClientMemorySummary,
    getClientDrawerDetails,
    createKnowledgeDocument,
    updateKnowledgeDocument,
    toggleKnowledgeDocumentVisibility,
    deleteKnowledgeDocument,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Users,
    Search,
    FolderOpen,
    MessageSquare,
    PauseCircle,
    PlayCircle,
    ExternalLink,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Loader2,
    Sparkles,
    Pencil,
    Check,
    X,
    ChevronDown,
    ChevronUp,
    Save,
    Volume2,
    Mic,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantClientsProps {
    tenantId: string;
    clients: any[];
    initialClientId?: string;
    initialDrawerTab?: "dossier" | "chat";
    initialSearch?: string;
}

function cleanDisplayPhone(jid: string): string {
    return (jid || "").replace(/@(s\.whatsapp\.net|lid)$/i, "");
}

export function TenantClients({
    tenantId,
    clients,
    initialClientId,
    initialDrawerTab = "dossier",
    initialSearch = "",
}: TenantClientsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const handledDeepLinkRef = useRef<string | null>(null);

    const [search, setSearch] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Gaveta (Dossiê RAG + Conversa WhatsApp)
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [drawerTab, setDrawerTab] = useState<"dossier" | "chat">("dossier");
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [drawerMessages, setDrawerMessages] = useState<any[]>([]);
    const [drawerDocs, setDrawerDocs] = useState<any[]>([]);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Edição explícita de nome, status e memória na gaveta
    const [isEditingName, setIsEditingName] = useState(false);
    const [editClientName, setEditClientName] = useState("");
    const [editClientStatus, setEditClientStatus] = useState("active");
    const [editClientVoiceMode, setEditClientVoiceMode] = useState("auto");
    const [editMemorySummary, setEditMemorySummary] = useState("");

    // Formulário novo documento do cliente
    const [docTitle, setDocTitle] = useState("");
    const [docContent, setDocContent] = useState("");
    const [docVisible, setDocVisible] = useState(false); // Nasce privado por segurança!

    // Controle de expansão e edição de documentos do cliente (default: todos colapsados)
    const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editDocTitle, setEditDocTitle] = useState("");
    const [editDocContent, setEditDocContent] = useState("");
    const [editDocVisible, setEditDocVisible] = useState(false);

    const toggleExpandDoc = (groupId: string) => {
        setExpandedDocIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleStartEditDoc = (doc: { id: string; title: string; preview: string; visibleToClient: boolean }) => {
        setEditingDocId(doc.id);
        setEditDocTitle(doc.title);
        setEditDocContent(doc.preview);
        setEditDocVisible(doc.visibleToClient);
    };

    const handleCancelEditDoc = () => {
        setEditingDocId(null);
        setEditDocTitle("");
        setEditDocContent("");
    };

    const handleSaveEditDoc = async (docId: string) => {
        if (!editDocTitle.trim() || !editDocContent.trim()) {
            toast.error("Título e conteúdo são obrigatórios.");
            return;
        }

        startTransition(async () => {
            const res = await updateKnowledgeDocument({
                tenantId,
                docId,
                docTitle: editDocTitle,
                content: editDocContent,
                visibleToClient: editDocVisible,
            });

            if (res.success) {
                toast.success("Documento atualizado com sucesso!");
                setDrawerDocs((prev) =>
                    prev.map((d) =>
                        d.id === docId
                            ? {
                                  ...d,
                                  doc_title: editDocTitle,
                                  content: editDocContent,
                                  visible_to_client: editDocVisible,
                              }
                            : d
                    )
                );
                setEditingDocId(null);
            } else {
                toast.error("Erro ao atualizar documento: " + (res.error || "Tente novamente."));
            }
        });
    };

    const filteredClients = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (clients || []).filter((c) => {
            if (statusFilter !== "all" && c.status !== statusFilter) return false;
            if (!q) return true;
            return (
                (c.name || "").toLowerCase().includes(q) ||
                (c.phone || "").toLowerCase().includes(q) ||
                (c.lead?.area || "").toLowerCase().includes(q)
            );
        });
    }, [clients, search, statusFilter]);

    const groupedDrawerDocs = useMemo(() => {
        const map = new Map<string, any>();
        for (const row of drawerDocs || []) {
            const groupId = row.metadata?.doc_group_id || row.id;
            if (!map.has(groupId)) {
                map.set(groupId, {
                    id: row.id,
                    groupId,
                    title: row.doc_title || row.metadata?.title || "Documento do Cliente",
                    visibleToClient: Boolean(row.visible_to_client),
                    updatedAt: row.updated_at || row.created_at,
                    chunksCount: 1,
                    preview: row.content || "",
                });
            } else {
                map.get(groupId)!.chunksCount += 1;
            }
        }
        return Array.from(map.values());
    }, [drawerDocs]);

    const openClientDrawer = async (client: any, defaultTab: "dossier" | "chat" = "dossier") => {
        setSelectedClient(client);
        setIsEditingName(false);
        setEditClientName(client.name || "");
        setEditClientStatus(client.status || "active");
        setEditClientVoiceMode(client.metadata?.voice_mode || "auto");
        setEditMemorySummary(client.metadata?.memory_summary || "");
        setDrawerTab(defaultTab);
        setDrawerLoading(true);
        try {
            const details = await getClientDrawerDetails({
                tenantId,
                clientId: client.id,
                phone: client.phone,
            });
            setDrawerMessages(details.messages || []);
            setDrawerDocs(details.documents || []);
        } catch {
            toast.error("Erro ao carregar detalhes do cliente.");
        } finally {
            setDrawerLoading(false);
        }
    };

    useEffect(() => {
        if (!initialClientId || handledDeepLinkRef.current === initialClientId) return;
        const target = (clients || []).find((c) => c.id === initialClientId);
        if (target) {
            handledDeepLinkRef.current = initialClientId;
            void openClientDrawer(target, initialDrawerTab);
        }
    }, [initialClientId, initialDrawerTab, clients]);

    // Rola para o fim da conversa (mensagens mais recentes) ao abrir a aba de chat
    useEffect(() => {
        if (drawerTab === "chat" && !drawerLoading && drawerMessages.length > 0) {
            const scrollToBottom = () => {
                if (messagesContainerRef.current) {
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                }
                messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
            };

            const frameId = requestAnimationFrame(scrollToBottom);
            const timer1 = setTimeout(scrollToBottom, 60);
            const timer2 = setTimeout(scrollToBottom, 250);

            return () => {
                cancelAnimationFrame(frameId);
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        }
    }, [drawerTab, drawerLoading, drawerMessages]);

    const refreshDrawer = async (client: any) => {
        const details = await getClientDrawerDetails({
            tenantId,
            clientId: client.id,
            phone: client.phone,
        });
        setDrawerMessages(details.messages || []);
        setDrawerDocs(details.documents || []);
        router.refresh();
    };

    const handleToggleClientPause = (client: any) => {
        const nextStatus = client.status === "paused" ? "active" : "paused";
        startTransition(async () => {
            const res = await setClientAiStatus({
                tenantId,
                clientId: client.id,
                newStatus: nextStatus,
            });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success(
                    nextStatus === "paused"
                        ? `IA pausada para ${client.name || "cliente"}.`
                        : `IA reativada para ${client.name || "cliente"}!`
                );
                router.refresh();
            }
        });
    };

    const handleAddClientDoc = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || !docTitle.trim() || !docContent.trim()) return;

        startTransition(async () => {
            const res = await createKnowledgeDocument({
                tenantId,
                clientId: selectedClient.id,
                docTitle,
                content: docContent,
                visibleToClient: docVisible,
                category: "Dossiê Cliente",
            });

            if ((res as any)?.error) {
                toast.error((res as any).error);
                return;
            }

            toast.success(
                docVisible
                    ? "Documento salvo e liberado para consulta do cliente!"
                    : "Documento salvo como privado (visível apenas para a equipe)."
            );
            setDocTitle("");
            setDocContent("");
            setDocVisible(false);
            await refreshDrawer(selectedClient);
        });
    };

    const handleToggleDocVisibility = (docId: string, nextVal: boolean) => {
        if (!selectedClient) return;
        startTransition(async () => {
            const res = await toggleKnowledgeDocumentVisibility({
                tenantId,
                docId,
                visibleToClient: nextVal,
            });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success(
                    nextVal
                        ? "Liberado! A assistente já pode informar este conteúdo ao cliente."
                        : "Ocultado! Agora apenas a equipe interna tem acesso a este documento."
                );
                await refreshDrawer(selectedClient);
            }
        });
    };

    const handleDeleteClientDoc = (docId: string) => {
        if (!selectedClient) return;
        startTransition(async () => {
            const res = await deleteKnowledgeDocument({ tenantId, docId });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success("Documento removido da pasta do cliente.");
                await refreshDrawer(selectedClient);
            }
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "paused":
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        IA Pausada (Humano)
                    </span>
                );
            case "triagem_concluida":
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Triagem Concluída
                    </span>
                );
            case "converted":
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Cliente Fechado
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        IA Ativa
                    </span>
                );
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 bg-slate-50/50">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Users className="size-5 text-[var(--color-brand-primary)]" />
                        Clientes & Dossiês
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Gerencie atendimentos, histórico de conversas e documentos individuais de cada cliente.
                    </p>
                </div>
            </div>

            <div className="p-8 space-y-6">
                {/* Filtros */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="relative flex-1 min-w-[260px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar cliente por nome, telefone ou categoria..."
                            className="pl-9 bg-white"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                        {[
                            { id: "all", label: "Todos" },
                            { id: "active", label: "IA Ativa" },
                            { id: "paused", label: "Pausados" },
                            { id: "triagem_concluida", label: "Triagem OK" },
                            { id: "converted", label: "Fechados" },
                        ].map((st) => (
                            <button
                                key={st.id}
                                type="button"
                                onClick={() => setStatusFilter(st.id)}
                                className={`px-3 py-1.5 rounded-md transition-colors ${
                                    statusFilter === st.id
                                        ? "bg-white text-slate-900 shadow-xs"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista de Clientes */}
                {filteredClients.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm">
                        Nenhum cliente encontrado para este filtro.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                        {filteredClients.map((c) => {
                            const cleanPhone = cleanDisplayPhone(c.phone);
                            return (
                                <div
                                    key={c.id}
                                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                                >
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-bold text-slate-900 text-sm">
                                                {c.name || "Cliente sem nome"}
                                            </span>
                                            {getStatusBadge(c.status)}
                                            {c.lead?.temperature && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                                    {c.lead.temperature} • {c.lead.area || "Geral"}
                                                </span>
                                            )}
                                            {c.docsCount > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                    <FolderOpen className="size-3" />
                                                    {c.docsCount} doc(s) ({c.sharedDocsCount} liberado p/ IA)
                                                </span>
                                            )}
                                            {c.metadata?.memory_summary && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                                    <Sparkles className="size-3" />
                                                    Memória IA Ativa
                                                </span>
                                            )}
                                            {c.metadata?.voice_mode === "always_voice" && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <Mic className="size-3" />
                                                    Sempre Voz
                                                </span>
                                            )}
                                            {c.metadata?.voice_mode === "always_text" && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                    <MessageSquare className="size-3" />
                                                    Sempre Texto
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                            <a
                                                href={`https://wa.me/${cleanPhone}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-mono hover:text-[var(--color-brand-primary)] inline-flex items-center gap-1"
                                            >
                                                +{cleanPhone}
                                                <ExternalLink className="size-3" />
                                            </a>
                                            {c.last_interaction_at && (
                                                <span>
                                                    Última interação:{" "}
                                                    {new Date(c.last_interaction_at).toLocaleString("pt-BR")}
                                                </span>
                                            )}
                                        </div>

                                        {c.lead?.summary && (
                                            <p className="text-xs text-slate-600 line-clamp-1 pt-0.5">
                                                <strong>Resumo Triagem:</strong> {c.lead.summary}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openClientDrawer(c, "dossier")}
                                            className="text-xs font-semibold"
                                        >
                                            <FolderOpen className="mr-1.5 size-3.5 text-indigo-600" />
                                            Dossiê ({c.docsCount || 0})
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openClientDrawer(c, "chat")}
                                            className="text-xs font-semibold"
                                        >
                                            <MessageSquare className="mr-1.5 size-3.5 text-blue-600" />
                                            Conversa
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={isPending}
                                            onClick={() => handleToggleClientPause(c)}
                                            className={`text-xs font-bold ${
                                                c.status === "paused"
                                                    ? "text-emerald-700 hover:bg-emerald-50"
                                                    : "text-amber-700 hover:bg-amber-50"
                                            }`}
                                        >
                                            {c.status === "paused" ? (
                                                <>
                                                    <PlayCircle className="mr-1.5 size-4" />
                                                    Reativar IA
                                                </>
                                            ) : (
                                                <>
                                                    <PauseCircle className="mr-1.5 size-4" />
                                                    Pausar IA
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Gaveta Lateral: Dossiê RAG do Cliente + Histórico WhatsApp */}
            <Sheet
                open={Boolean(selectedClient)}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsEditingName(false);
                        setSelectedClient(null);
                    }
                }}
            >
                <SheetContent
                    side="right"
                    className="w-full sm:max-w-2xl overflow-y-auto p-0"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    {selectedClient && (
                        <div className="flex flex-col h-full">
                            <SheetHeader className="p-6 border-b border-zinc-200 bg-zinc-50/70 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        {isEditingName ? (
                                            <form
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    startTransition(async () => {
                                                        const res = await updateClientProfile({
                                                            tenantId,
                                                            clientId: selectedClient.id,
                                                            name: editClientName,
                                                            status: editClientStatus,
                                                        });
                                                        if ((res as any)?.error) {
                                                            toast.error((res as any).error);
                                                        } else {
                                                            const nextName =
                                                                editClientName.trim() || "Desconhecido";
                                                            setSelectedClient((prev: any) =>
                                                                prev ? { ...prev, name: nextName } : null
                                                            );
                                                            setIsEditingName(false);
                                                            toast.success("Nome do cliente atualizado!");
                                                            router.refresh();
                                                        }
                                                    });
                                                }}
                                                className="flex items-center gap-1.5 max-w-sm"
                                            >
                                                <Input
                                                    autoFocus
                                                    value={editClientName}
                                                    onChange={(e) => setEditClientName(e.target.value)}
                                                    placeholder="Nome completo do cliente"
                                                    className="h-8 bg-white text-xs font-semibold"
                                                />
                                                <Button
                                                    type="submit"
                                                    size="sm"
                                                    disabled={isPending}
                                                    className="h-8 px-2.5 bg-zinc-900 hover:bg-indigo-600 text-white"
                                                    title="Salvar nome"
                                                >
                                                    <Check className="size-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditClientName(selectedClient.name || "");
                                                        setIsEditingName(false);
                                                    }}
                                                    className="h-8 px-2.5"
                                                    title="Cancelar"
                                                >
                                                    <X className="size-3.5" />
                                                </Button>
                                            </form>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <SheetTitle className="text-lg font-bold text-zinc-950 truncate">
                                                    {selectedClient.name || "Cliente"}
                                                </SheetTitle>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditClientName(selectedClient.name || "");
                                                        setIsEditingName(true);
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
                                                    title="Alterar nome do cliente"
                                                >
                                                    <Pencil className="size-3" />
                                                    Editar nome
                                                </button>
                                            </div>
                                        )}

                                        <SheetDescription className="text-xs font-mono">
                                            WhatsApp: +{cleanDisplayPhone(selectedClient.phone)}
                                        </SheetDescription>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <select
                                            value={editClientStatus}
                                            disabled={isPending}
                                            onChange={(e) => {
                                                const nextStatus = e.target.value;
                                                setEditClientStatus(nextStatus);
                                                startTransition(async () => {
                                                    const res = await updateClientProfile({
                                                        tenantId,
                                                        clientId: selectedClient.id,
                                                        name: selectedClient.name || "Desconhecido",
                                                        status: nextStatus,
                                                    });
                                                    if ((res as any)?.error) {
                                                        toast.error((res as any).error);
                                                    } else {
                                                        setSelectedClient((prev: any) =>
                                                            prev ? { ...prev, status: nextStatus } : null
                                                        );
                                                        toast.success("Status atualizado!");
                                                        router.refresh();
                                                    }
                                                });
                                            }}
                                            className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-800 cursor-pointer"
                                        >
                                            <option value="active">IA Ativa (Lead Novo)</option>
                                            <option value="triagem_concluida">Triagem Concluída</option>
                                            <option value="converted">Cliente Fechado</option>
                                            <option value="paused">Atendimento Humano</option>
                                            <option value="archive">Arquivado</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Formato de Resposta do Assistente (Áudio / Texto / Espelho) */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 pb-1 border-t border-zinc-200/60">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-600 font-medium">
                                        <Volume2 className="size-3.5 text-indigo-600" />
                                        <span>Formato de Resposta do Assistente:</span>
                                    </div>
                                    <select
                                        value={editClientVoiceMode}
                                        disabled={isPending}
                                        onChange={(e) => {
                                            const nextMode = e.target.value as "auto" | "always_voice" | "always_text";
                                            setEditClientVoiceMode(nextMode);
                                            startTransition(async () => {
                                                const res = await updateClientProfile({
                                                    tenantId,
                                                    clientId: selectedClient.id,
                                                    voiceMode: nextMode,
                                                });
                                                if ((res as any)?.error) {
                                                    toast.error((res as any).error);
                                                } else {
                                                    setSelectedClient((prev: any) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  metadata: {
                                                                      ...(prev.metadata || {}),
                                                                      voice_mode: nextMode,
                                                                  },
                                                              }
                                                            : null
                                                    );
                                                    toast.success("Formato de resposta atualizado!");
                                                    router.refresh();
                                                }
                                            });
                                        }}
                                        className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-800 cursor-pointer hover:border-indigo-300 transition-colors"
                                    >
                                        <option value="auto">De acordo com o cliente (Áudio ↔ Áudio, Texto ↔ Texto)</option>
                                        <option value="always_voice">Sempre responder por Voz (Áudio)</option>
                                        <option value="always_text">Sempre responder por Texto</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setDrawerTab("dossier")}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                                            drawerTab === "dossier"
                                                ? "bg-[var(--color-brand-primary)] text-white"
                                                : "bg-white border border-slate-200 text-slate-600"
                                        }`}
                                    >
                                        Dossiê & Memória ({groupedDrawerDocs.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDrawerTab("chat")}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                                            drawerTab === "chat"
                                                ? "bg-[var(--color-brand-primary)] text-white"
                                                : "bg-white border border-slate-200 text-slate-600"
                                        }`}
                                    >
                                        Histórico WhatsApp ({drawerMessages.length})
                                    </button>
                                </div>
                            </SheetHeader>

                            <div ref={messagesContainerRef} className="p-6 flex-1 space-y-6 overflow-y-auto">
                                {drawerLoading ? (
                                    <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
                                        <Loader2 className="size-6 animate-spin" />
                                        <span className="text-xs">Carregando dados do cliente...</span>
                                    </div>
                                ) : drawerTab === "dossier" ? (
                                    <>
                                        {/* Memória do Cliente */}
                                        <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-4 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <h4 className="text-xs font-bold text-violet-950 flex items-center gap-1.5">
                                                        <Sparkles className="size-3.5 text-violet-600" />
                                                        Memória do Cliente
                                                    </h4>
                                                    <p className="text-[11px] text-violet-800/80 mt-0.5">
                                                        Resumo dos principais fatos registrados durante os atendimentos.
                                                    </p>
                                                </div>
                                                {selectedClient.metadata?.memory_updated_at && (
                                                    <span className="text-[10px] font-mono text-violet-700/80 shrink-0">
                                                        {new Date(selectedClient.metadata.memory_updated_at).toLocaleDateString("pt-BR")}
                                                    </span>
                                                )}
                                            </div>

                                            <Textarea
                                                value={editMemorySummary}
                                                onChange={(e) => setEditMemorySummary(e.target.value)}
                                                placeholder="Ex: • Interesse: Orçamento de equipamento / Atendimento inicial&#10;• Relato: Precisa de retorno até sexta-feira; enviou especificações.&#10;• Pendência: Aguardando confirmação de horário."
                                                className="min-h-[96px] bg-white text-xs leading-relaxed"
                                            />

                                            <div className="flex justify-end">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => {
                                                        startTransition(async () => {
                                                            const res = await updateClientMemorySummary({
                                                                tenantId,
                                                                clientId: selectedClient.id,
                                                                memorySummary: editMemorySummary,
                                                            });
                                                            if ((res as any)?.error) {
                                                                toast.error((res as any).error);
                                                            } else {
                                                                setSelectedClient((prev: any) =>
                                                                    prev
                                                                        ? { ...prev, metadata: (res as any).metadata }
                                                                        : null
                                                                );
                                                                toast.success("Memória do cliente salva!");
                                                                router.refresh();
                                                            }
                                                        });
                                                    }}
                                                    className="h-8 bg-violet-700 hover:bg-violet-800 text-white text-xs font-semibold"
                                                >
                                                    Salvar Memória
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Adicionar Documento / Atualização */}
                                        <form
                                            onSubmit={handleAddClientDoc}
                                            className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-4"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Plus className="size-4 text-indigo-600" />
                                                <h4 className="text-sm font-bold text-slate-900">
                                                    Anexar Documento ou Atualização ao Cliente
                                                </h4>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold">
                                                    Título do Documento ou Registro
                                                </Label>
                                                <Input
                                                    value={docTitle}
                                                    onChange={(e) => setDocTitle(e.target.value)}
                                                    placeholder="Ex: Ordem de Serviço #1042, Contrato ou Atualização de Status"
                                                    className="bg-white"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold">
                                                    Texto / Conteúdo do Documento ou Atualização
                                                </Label>
                                                <Textarea
                                                    value={docContent}
                                                    onChange={(e) => setDocContent(e.target.value)}
                                                    placeholder="Ex: Solicitação concluída e disponível para retirada ou acompanhamento a partir de 18/12 às 14h."
                                                    className="min-h-[120px] bg-white text-xs"
                                                    required
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-bold text-slate-900">
                                                        Liberar consulta pela assistente para este cliente?
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">
                                                        {docVisible
                                                            ? "Visível ao cliente: a assistente poderá consultar e informar este andamento automaticamente."
                                                            : "Privado: visível apenas para a equipe interna."}
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={docVisible}
                                                    onCheckedChange={setDocVisible}
                                                />
                                            </div>

                                            <Button
                                                type="submit"
                                                disabled={isPending}
                                                className="w-full bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white font-bold text-xs"
                                            >
                                                {isPending ? (
                                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="mr-2 size-4" />
                                                )}
                                                Salvar no Dossiê
                                            </Button>
                                        </form>

                                        {/* Documentos do Cliente */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                Documentos na Pasta deste Cliente ({groupedDrawerDocs.length})
                                            </h4>

                                            {groupedDrawerDocs.length === 0 ? (
                                                <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                                                    Nenhum documento individual anexado a este cliente ainda.
                                                </p>
                                            ) : (
                                                groupedDrawerDocs.map((doc) =>
                                                    editingDocId === doc.id ? (
                                                        <div
                                                            key={doc.groupId}
                                                            className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3"
                                                        >
                                                            <div className="space-y-1.5">
                                                                <Label className="text-xs font-semibold text-zinc-700">
                                                                    Título do Documento
                                                                </Label>
                                                                <Input
                                                                    value={editDocTitle}
                                                                    onChange={(e) => setEditDocTitle(e.target.value)}
                                                                    className="bg-white text-xs h-9"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-xs font-semibold text-zinc-700">
                                                                    Conteúdo do Documento
                                                                </Label>
                                                                <Textarea
                                                                    value={editDocContent}
                                                                    onChange={(e) => setEditDocContent(e.target.value)}
                                                                    className="bg-white text-xs min-h-[120px] font-mono leading-relaxed"
                                                                />
                                                            </div>
                                                            <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-zinc-200">
                                                                <span className="text-xs text-zinc-700 font-medium">
                                                                    Liberar consulta pela assistente no WhatsApp?
                                                                </span>
                                                                <Switch
                                                                    checked={editDocVisible}
                                                                    onCheckedChange={setEditDocVisible}
                                                                />
                                                            </div>
                                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={handleCancelEditDoc}
                                                                    className="text-xs h-8"
                                                                >
                                                                    Cancelar
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    disabled={isPending}
                                                                    onClick={() => handleSaveEditDoc(doc.id)}
                                                                    className="bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white text-xs h-8"
                                                                >
                                                                    {isPending ? (
                                                                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Save className="mr-1.5 size-3.5" />
                                                                    )}
                                                                    Salvar Alterações
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            key={doc.groupId}
                                                            className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-bold text-slate-900 text-xs">
                                                                        {doc.title}
                                                                    </span>
                                                                    {doc.visibleToClient ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                            <Eye className="size-3" /> Liberado ao Cliente
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                                            <EyeOff className="size-3" /> Só Equipe
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-1.5">
                                                                    <Switch
                                                                        checked={doc.visibleToClient}
                                                                        onCheckedChange={(v) =>
                                                                            handleToggleDocVisibility(doc.id, v)
                                                                        }
                                                                        disabled={isPending}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStartEditDoc(doc)}
                                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
                                                                        title="Editar documento"
                                                                    >
                                                                        <Pencil className="size-3.5" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteClientDoc(doc.id)}
                                                                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                                                        title="Remover documento"
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Conteúdo com Expand/Collapse (default: collapsed) */}
                                                            {expandedDocIds.has(doc.groupId) ? (
                                                                <div className="space-y-2">
                                                                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                                                                        {doc.preview}
                                                                    </p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpandDoc(doc.groupId)}
                                                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                                                    >
                                                                        <ChevronUp className="size-3" /> Recolher texto
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                                                        {doc.preview}
                                                                    </p>
                                                                    {doc.preview && doc.preview.length > 80 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleExpandDoc(doc.groupId)}
                                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                                                        >
                                                                            <ChevronDown className="size-3" /> Ver conteúdo completo
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                )
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    /* Histórico de Mensagens WhatsApp */
                                    <div className="space-y-3">
                                        {drawerMessages.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-10">
                                                Nenhuma mensagem registrada para este número ainda.
                                            </p>
                                        ) : (
                                            drawerMessages.map((m) => {
                                                const isClient = m.role === "user" && m.message_type !== "admin";
                                                const isAdmin = m.role === "admin" || m.message_type === "admin";
                                                return (
                                                    <div
                                                        key={m.id}
                                                        className={`flex flex-col ${
                                                            isClient ? "items-start" : "items-end"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs space-y-1 ${
                                                                isClient
                                                                    ? "bg-slate-100 text-slate-900 rounded-tl-xs"
                                                                    : isAdmin
                                                                      ? "bg-amber-50 border border-amber-200 text-amber-950 rounded-tr-xs"
                                                                      : "bg-[var(--color-brand-primary)] text-white rounded-tr-xs"
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-4 opacity-75 text-[10px] font-bold">
                                                                <span className="inline-flex items-center gap-1">
                                                                    {m.message_type === "audio" && (
                                                                        <span title="Mensagem de Voz / Áudio">
                                                                            <Volume2 className="size-3 text-indigo-500 inline" />
                                                                        </span>
                                                                    )}
                                                                    {isClient
                                                                        ? selectedClient.name || "Cliente"
                                                                        : isAdmin
                                                                          ? "Atendente Humano"
                                                                          : "Assistente IA"}
                                                                </span>
                                                                <span>
                                                                    {new Date(m.created_at).toLocaleString("pt-BR", {
                                                                        day: "2-digit",
                                                                        month: "2-digit",
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    })}
                                                                </span>
                                                            </div>
                                                            <p className="whitespace-pre-line leading-relaxed">
                                                                {m.content}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
