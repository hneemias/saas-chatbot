"use client";

import { useState, useMemo, useTransition } from "react";
import {
    createKnowledgeDocument,
    updateKnowledgeDocument,
    deleteKnowledgeDocument,
    toggleKnowledgeDocumentVisibility,
    simulateKnowledgeSearch,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    BookOpen,
    Plus,
    Trash2,
    Search,
    Sparkles,
    Eye,
    EyeOff,
    Loader2,
    FileText,
    AlertTriangle,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    Pencil,
    Save,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantKnowledgeProps {
    tenantId: string;
    initialDocuments: any[];
    backendOnline: boolean;
}

/**
 * Remove palavras quebradas no início de um trecho (quando o recorte começa no meio de uma frase)
 * para que a leitura seja sempre limpa.
 */
function cleanChunkEdges(raw: string): string {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";

    // Se começa com letra minúscula ou pontuação solta (palavra partida pelo recorte), avança até a primeira quebra limpa
    if (/^[a-záàâãéêíóôõúç,;.)\-]/.test(trimmed)) {
        const nextBreak = trimmed.search(/\n|[.!?]\s+/);
        if (nextBreak > 0 && nextBreak < 140) {
            const after = trimmed.slice(nextBreak + 1).trim();
            if (after.length > 40) {
                return `… ${after}`;
            }
        }
        return `…${trimmed}`;
    }

    return trimmed;
}

/**
 * Destaca em marca-texto amarelo suave tanto as frases exatas apontadas pela IA (`highlights`)
 * quanto palavras relevantes da própria pergunta do usuário.
 */
function focusExcerptAroundHighlight(
    cleanText: string,
    highlights: string[],
    query: string,
    isExpanded: boolean
): string {
    if (isExpanded || cleanText.length <= 420) return cleanText;

    const lower = cleanText.toLowerCase();
    let bestIdx = -1;

    for (const h of highlights || []) {
        const needle = h.trim().toLowerCase();
        if (needle.length >= 6) {
            const pos = lower.indexOf(needle);
            if (pos !== -1) {
                bestIdx = pos;
                break;
            }
        }
    }

    if (bestIdx === -1) {
        const words = (query || "")
            .trim()
            .split(/\s+/)
            .filter((w) => w.length >= 4);
        for (const w of words) {
            const pos = lower.indexOf(w.toLowerCase());
            if (pos !== -1) {
                bestIdx = pos;
                break;
            }
        }
    }

    if (bestIdx <= 120) {
        return cleanText.slice(0, 420).trimEnd() + " …";
    }

    let start = Math.max(0, bestIdx - 110);
    const spaceAfterStart = cleanText.indexOf(" ", start);
    if (start > 0 && spaceAfterStart > start && spaceAfterStart - start < 25) {
        start = spaceAfterStart + 1;
    }

    const end = Math.min(cleanText.length, start + 420);
    const snippet = cleanText.slice(start, end).trim();
    return `${start > 0 ? "… " : ""}${snippet}${end < cleanText.length ? " …" : ""}`;
}

function renderHighlightedText(
    text: string,
    highlights: string[],
    query: string,
    isExpanded = false
): React.ReactNode {
    const baseClean = cleanChunkEdges(text);
    const cleanText = focusExcerptAroundHighlight(baseClean, highlights, query, isExpanded);
    if (!cleanText) return null;

    const phrases = (highlights || [])
        .map((h) => h.trim())
        .filter((h) => h.length >= 6);

    const stopWords = new Set([
        "como", "qual", "quais", "quanto", "quando", "onde", "para", "pelo", "pela",
        "com", "sem", "uma", "uns", "umas", "dos", "das", "que", "fica", "fazer",
        "trocar", "tem", "voces", "voce", "sobre", "isso", "esse", "essa",
    ]);

    const queryWords = (query || "")
        .trim()
        .split(/\s+/)
        .map((w) => w.replace(/[?!.,;:()"']/g, ""))
        .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()));

    const allPatterns = [
        ...phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        ...queryWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    ];

    if (allPatterns.length === 0) {
        return cleanText;
    }

    // Ordena do maior para o menor para dar preferência a frases completas antes de palavras isoladas
    allPatterns.sort((a, b) => b.length - a.length);

    const regex = new RegExp(`(${allPatterns.join("|")})`, "gi");
    const parts = cleanText.split(regex);

    return parts.map((part, i) => {
        if (!part) return null;
        regex.lastIndex = 0;
        if (regex.test(part)) {
            return (
                <mark
                    key={i}
                    className="rounded bg-amber-100/95 px-1 py-0.5 font-semibold text-zinc-950 ring-1 ring-amber-300/60"
                >
                    {part}
                </mark>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

export function TenantKnowledge({
    tenantId,
    initialDocuments,
    backendOnline,
}: TenantKnowledgeProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [docTitle, setDocTitle] = useState("");
    const [category, setCategory] = useState("Institucional");
    const [content, setContent] = useState("");
    const [visibleToClient, setVisibleToClient] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Simulador de Consulta e Resposta
    const [simQuery, setSimQuery] = useState("");
    const [simMode, setSimMode] = useState<"client" | "team">("client");
    const [simLoading, setSimLoading] = useState(false);
    const [simResults, setSimResults] = useState<any[] | null>(null);
    const [simReply, setSimReply] = useState<string | null>(null);
    const [simAgentName, setSimAgentName] = useState<string>("Assistente");
    const [simHighlights, setSimHighlights] = useState<string[]>([]);
    const [expandedHits, setExpandedHits] = useState<Record<number, boolean>>({});

    // Controle de expansão e edição de documentos da empresa
    const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editDocTitle, setEditDocTitle] = useState("");
    const [editDocCategory, setEditDocCategory] = useState("");
    const [editDocContent, setEditDocContent] = useState("");
    const [editDocVisible, setEditDocVisible] = useState(true);

    const toggleExpandDoc = (groupId: string) => {
        setExpandedDocIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleStartEditDoc = (doc: { id: string; title: string; category: string; preview: string; visibleToClient: boolean }) => {
        setEditingDocId(doc.id);
        setEditDocTitle(doc.title);
        setEditDocCategory(doc.category);
        setEditDocContent(doc.preview);
        setEditDocVisible(doc.visibleToClient);
    };

    const handleCancelEditDoc = () => {
        setEditingDocId(null);
        setEditDocTitle("");
        setEditDocCategory("");
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
                category: editDocCategory,
                content: editDocContent,
                visibleToClient: editDocVisible,
            });

            if (res.success) {
                toast.success("Documento atualizado com sucesso!");
                setEditingDocId(null);
                router.refresh();
            } else {
                toast.error("Erro ao atualizar documento: " + (res.error || "Tente novamente."));
            }
        });
    };

    const groupedDocs = useMemo(() => {
        const map = new Map<string, any>();
        for (const row of initialDocuments || []) {
            const groupId = row.metadata?.doc_group_id || row.id;
            if (!map.has(groupId)) {
                map.set(groupId, {
                    id: row.id,
                    groupId,
                    title: row.doc_title || row.metadata?.title || "Documento sem título",
                    category: row.metadata?.category || "Geral",
                    visibleToClient: row.visible_to_client ?? true,
                    updatedAt: row.updated_at || row.created_at,
                    chunksCount: 1,
                    preview: row.content || "",
                });
            } else {
                const entry = map.get(groupId)!;
                entry.chunksCount += 1;
            }
        }
        return Array.from(map.values());
    }, [initialDocuments]);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!docTitle.trim() || !content.trim()) {
            toast.error("Preencha o título e o conteúdo do documento.");
            return;
        }

        startTransition(async () => {
            const res = await createKnowledgeDocument({
                tenantId,
                clientId: null,
                docTitle,
                content,
                visibleToClient,
                category,
            });

            if ((res as any)?.error) {
                toast.error((res as any).error);
                return;
            }

            toast.success("Documento salvo com sucesso!");
            setDocTitle("");
            setContent("");
            setShowCreateForm(false);
            router.refresh();
        });
    };

    const handleToggleVisibility = (docId: string, nextVal: boolean) => {
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
                        ? "Documento liberado para atendimento de clientes!"
                        : "Documento restrito apenas à equipe interna."
                );
                router.refresh();
            }
        });
    };

    const handleDelete = (docId: string, title: string) => {
        startTransition(async () => {
            const res = await deleteKnowledgeDocument({ tenantId, docId });
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success(`"${title}" removido da base de conhecimento.`);
                router.refresh();
            }
        });
    };

    const handleSimulate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!simQuery.trim()) return;
        setSimLoading(true);
        setExpandedHits({});
        try {
            const res = await simulateKnowledgeSearch({
                tenantId,
                query: simQuery,
                mode: simMode,
            });
            if ((res as any)?.error) {
                toast.error((res as any).error);
                setSimResults(null);
                setSimReply(null);
                setSimHighlights([]);
            } else {
                setSimResults((res as any).results || []);
                setSimReply((res as any).simulatedReply || null);
                setSimAgentName((res as any).agentName || "Assistente");
                setSimHighlights((res as any).highlights || []);
            }
        } finally {
            setSimLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 bg-slate-50/50">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <BookOpen className="size-5 text-[var(--color-brand-primary)]" />
                        Base de Conhecimento
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Cadastre regras de atendimento, serviços, valores, políticas e dúvidas frequentes.
                    </p>
                </div>

                <Button
                    type="button"
                    onClick={() => setShowCreateForm((v) => !v)}
                    className="bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white font-bold shadow-md"
                >
                    <Plus className="mr-2 size-4" />
                    {showCreateForm ? "Fechar Formulário" : "Novo Documento"}
                </Button>
            </div>

            <div className="p-8 space-y-8">
                {!backendOnline && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-amber-800 text-xs">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                        <div>
                            <p className="font-bold">Serviço de indexação indisponível no momento</p>
                            <p className="mt-0.5">
                                A consulta e gestão de visibilidade seguem ativas. Inicie o servidor de API para cadastrar novos documentos ou simular respostas.
                            </p>
                        </div>
                    </div>
                )}

                {showCreateForm && (
                    <form
                        onSubmit={handleCreate}
                        className="rounded-2xl border border-blue-100 bg-blue-50/30 p-6 space-y-5 animate-in fade-in slide-in-from-top-2"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-700">
                                    Título do Documento
                                </Label>
                                <Input
                                    value={docTitle}
                                    onChange={(e) => setDocTitle(e.target.value)}
                                    placeholder="Ex: Regras de Atendimento e Valores"
                                    className="bg-white"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-700">
                                    Categoria
                                </Label>
                                <Input
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Ex: Institucional, Serviços, Perguntas Frequentes..."
                                    className="bg-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-700">
                                Conteúdo do Documento
                            </Label>
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Cole aqui as orientações, políticas comerciais, serviços prestados, endereços e horários..."
                                className="min-h-[200px] bg-white text-sm leading-relaxed"
                                required
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200">
                                <Switch
                                    checked={visibleToClient}
                                    onCheckedChange={setVisibleToClient}
                                />
                                <div>
                                    <p className="text-xs font-bold text-slate-900">
                                        {visibleToClient
                                            ? "Público no Atendimento (Clientes e Equipe)"
                                            : "Uso Interno Exclusivo da Equipe"}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        Documentos desmarcados ficam invisíveis para clientes externos no WhatsApp.
                                    </p>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isPending}
                                className="bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-dark)] text-white font-bold px-6"
                            >
                                {isPending ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-2 size-4" />
                                )}
                                Salvar Documento
                            </Button>
                        </div>
                    </form>
                )}

                {/* Lista de documentos institucionais */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Documentos Cadastrados ({groupedDocs.length})
                        </h4>
                    </div>

                    {groupedDocs.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center space-y-2 text-slate-500">
                            <FileText className="size-10 mx-auto opacity-20" />
                            <p className="text-sm font-semibold">
                                Nenhum documento cadastrado ainda.
                            </p>
                            <p className="text-xs text-slate-400">
                                Clique em &ldquo;Novo Documento&rdquo; acima para adicionar regras e informações da empresa.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {groupedDocs.map((doc) =>
                                editingDocId === doc.id ? (
                                    <div
                                        key={doc.groupId}
                                        className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 space-y-4"
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    Categoria / Seção
                                                </Label>
                                                <Input
                                                    value={editDocCategory}
                                                    onChange={(e) => setEditDocCategory(e.target.value)}
                                                    placeholder="Ex: Tabela de Preços, Regras, Garantia"
                                                    className="bg-white text-xs h-9"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-zinc-700">
                                                Conteúdo do Documento
                                            </Label>
                                            <Textarea
                                                value={editDocContent}
                                                onChange={(e) => setEditDocContent(e.target.value)}
                                                className="bg-white text-xs min-h-[140px] font-mono leading-relaxed"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-zinc-200">
                                            <span className="text-xs text-zinc-700 font-medium">
                                                Liberar consulta pela assistente no atendimento a clientes?
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
                                        className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 hover:shadow-xs transition-shadow"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-slate-900 text-sm">
                                                    {doc.title}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                                                    {doc.category}
                                                </span>
                                                {doc.visibleToClient ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <Eye className="size-3" /> Clientes & Equipe
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <EyeOff className="size-3" /> Só Equipe
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <Switch
                                                        checked={doc.visibleToClient}
                                                        onCheckedChange={(val) =>
                                                            handleToggleVisibility(doc.id, val)
                                                        }
                                                        disabled={isPending}
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => handleStartEditDoc(doc)}
                                                    className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                    title="Editar documento"
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => handleDelete(doc.id, doc.title)}
                                                    className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                    title="Excluir documento"
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Conteúdo com expand/collapse (default: collapsed) */}
                                        {expandedDocIds.has(doc.groupId) ? (
                                            <div className="space-y-2">
                                                <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
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
                                                {doc.preview && doc.preview.length > 100 && (
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
                            )}
                        </div>
                    )}
                </div>

                {/* Simulador de Atendimento e Consulta */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Sparkles className="size-4 text-indigo-600" />
                                Simulador de Resposta & Base
                            </h4>
                            <p className="text-xs text-slate-500">
                                Faça uma pergunta como cliente para ver a resposta simulada e os trechos exatos destacados na base.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setSimMode("client")}
                                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                                    simMode === "client"
                                        ? "bg-[var(--color-brand-primary)] text-white"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Visão Cliente
                            </button>
                            <button
                                type="button"
                                onClick={() => setSimMode("team")}
                                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                                    simMode === "team"
                                        ? "bg-indigo-600 text-white"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Visão Equipe
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSimulate} className="flex flex-col sm:flex-row gap-3">
                        <Input
                            value={simQuery}
                            onChange={(e) => setSimQuery(e.target.value)}
                            placeholder="Digite uma pergunta real de cliente para testar a resposta..."
                            className="bg-white flex-1"
                        />
                        <Button
                            type="submit"
                            disabled={simLoading}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold"
                        >
                            {simLoading ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                                <Search className="mr-2 size-4" />
                            )}
                            Simular Pergunta
                        </Button>
                    </form>

                    {simResults !== null && (
                        <div className="space-y-4 pt-2">
                            {/* 1. Resposta real simulada da Assistente em destaque */}
                            {simReply && (
                                <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                                            <MessageSquare className="size-3.5" />
                                            Resposta Simulada ({simAgentName})
                                        </span>
                                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                            Como o cliente receberia no WhatsApp
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-900 whitespace-pre-line leading-relaxed">
                                        {simReply}
                                    </p>
                                </div>
                            )}

                            {/* 2. Fontes e frases exatas destacadas */}
                            <div className="space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Fontes consultadas na base ({simResults.length}) — trechos relevantes grifados
                                </p>

                                {simResults.length === 0 ? (
                                    <p className="text-xs text-slate-500 bg-white p-4 rounded-xl border border-slate-200">
                                        Nenhum documento específico encontrado para esta pergunta (a resposta acima usou apenas as instruções principais da assistente).
                                    </p>
                                ) : (
                                    simResults.map((hit, idx) => {
                                        const isExpanded = Boolean(expandedHits[idx]);
                                        return (
                                            <div
                                                key={hit.id || idx}
                                                className="bg-white p-4 rounded-xl border border-slate-200 space-y-2"
                                            >
                                                <div className="flex items-center justify-between text-xs gap-2">
                                                    <span className="font-bold text-slate-900 truncate">
                                                        {hit.docTitle || "Documento de referência"}
                                                    </span>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            Relevância: {(hit.similarity * 100).toFixed(0)}%
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpandedHits((prev) => ({
                                                                    ...prev,
                                                                    [idx]: !prev[idx],
                                                                }))
                                                            }
                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                                        >
                                                            {isExpanded ? (
                                                                <>
                                                                    Recolher <ChevronUp className="size-3" />
                                                                </>
                                                            ) : (
                                                                <>
                                                                    Expandir <ChevronDown className="size-3" />
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                                    {renderHighlightedText(
                                                        hit.content,
                                                        simHighlights,
                                                        simQuery,
                                                        isExpanded
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
