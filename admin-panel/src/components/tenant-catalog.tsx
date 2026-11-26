"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
    bulkImportTenantProducts,
    checkMissingCatalogProducts,
    upsertSingleTenantProduct,
    deleteTenantProduct,
    uploadProductPhotoAction,
    clearProductPhotosAction,
    bulkMatchProductPhotosAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Package,
    Upload,
    Images,
    Plus,
    Search,
    Trash2,
    Camera,
    Loader2,
    AlertTriangle,
    X,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TenantCatalogProps {
    tenantId: string;
    initialProducts: any[];
    tableMissing?: boolean;
}

function parseBrazilianNumber(raw: any): number {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
    const str = String(raw ?? "")
        .replace(/[R$\s]/gi, "")
        .trim();
    if (!str) return 0;

    // Se possui vírgula como separador decimal brasileiro (ex: "1.299,90" ou "219,90")
    if (str.includes(",")) {
        const cleaned = str.replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    const parsed = parseFloat(str);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeaderKey(header: string): string {
    return (header || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function extractMappedRows(rawRows: Record<string, any>[]) {
    if (!rawRows || rawRows.length === 0) return [];

    const skuAliases = new Set([
        "codigo", "cod", "sku", "id", "referencia", "ref", "codproduto", "coditem", "codbarras",
    ]);
    const nameAliases = new Set([
        "descricao", "nome", "produto", "mercadoria", "item", "titulo", "nomeproduto", "descricaoproduto",
    ]);
    const stockAliases = new Set([
        "estoque", "saldo", "qtd", "qtde", "quantidade", "disponivel", "estoqueatual", "saldoestoque",
    ]);
    const priceAliases = new Set([
        "preco", "precovenda", "precodedevenda", "precodevenda", "valor", "vlrvenda", "venda", "valorvenda", "unitario",
    ]);
    const categoryAliases = new Set([
        "categoria", "grupo", "departamento", "subgrupo", "secao", "marca", "familia",
    ]);

    return rawRows
        .map((row) => {
            let sku = "";
            let name = "";
            let stock = 0;
            let price = 0;
            let category = "";

            for (const [col, val] of Object.entries(row)) {
                const key = normalizeHeaderKey(col);
                if (!sku && skuAliases.has(key)) sku = String(val ?? "").trim();
                else if (!name && nameAliases.has(key)) name = String(val ?? "").trim();
                else if (stockAliases.has(key)) stock = Math.trunc(parseBrazilianNumber(val));
                else if (priceAliases.has(key)) price = parseBrazilianNumber(val);
                else if (!category && categoryAliases.has(key)) category = String(val ?? "").trim();
            }

            return {
                sku,
                name,
                category: category || null,
                price,
                stock_quantity: stock,
            };
        })
        .filter((item) => item.sku && item.name);
}

export function TenantCatalog({
    tenantId,
    initialProducts,
    tableMissing = false,
}: TenantCatalogProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const sheetInputRef = useRef<HTMLInputElement>(null);
    const batchPhotosInputRef = useRef<HTMLInputElement>(null);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "in_stock" | "out_of_stock" | "with_photo">("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [showNewForm, setShowNewForm] = useState(false);
    const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
    const PAGE_SIZE = 50;

    const [sku, setSku] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("1");

    // Controle do Modal de Produtos Ausentes na Importação de Planilha
    const [pendingImportItems, setPendingImportItems] = useState<any[] | null>(null);
    const [missingSkus, setMissingSkus] = useState<string[]>([]);
    const [showMissingModal, setShowMissingModal] = useState(false);

    const stats = useMemo(() => {
        const list = initialProducts || [];
        const inStock = list.filter((p) => Number(p.stock_quantity) > 0).length;
        const withPhoto = list.filter(
            (p) => Array.isArray(p.image_urls) && p.image_urls.length > 0
        ).length;
        return {
            total: list.length,
            inStock,
            outOfStock: list.length - inStock,
            withPhoto,
        };
    }, [initialProducts]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (initialProducts || []).filter((p) => {
            if (filter === "in_stock" && Number(p.stock_quantity) <= 0) return false;
            if (filter === "out_of_stock" && Number(p.stock_quantity) > 0) return false;
            if (
                filter === "with_photo" &&
                (!Array.isArray(p.image_urls) || p.image_urls.length === 0)
            ) {
                return false;
            }
            if (!q) return true;
            return (
                String(p.sku || "").toLowerCase().includes(q) ||
                String(p.name || "").toLowerCase().includes(q) ||
                String(p.category || "").toLowerCase().includes(q)
            );
        });
    }, [initialProducts, search, filter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedItems = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, safePage]);

    const executeImport = (items: any[], deleteMissing: boolean, skusToDelete: string[]) => {
        startTransition(async () => {
            const res = await bulkImportTenantProducts({
                tenantId,
                items,
                deleteMissingSkus: deleteMissing,
                missingSkusToDelete: skusToDelete,
            });
            setShowMissingModal(false);
            setPendingImportItems(null);
            setMissingSkus([]);

            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                const deletedMsg = (res as any).deletedProducts
                    ? `, ${(res as any).deletedProducts} removidos`
                    : "";
                toast.success(
                    `${(res as any).totalProcessed} produtos sincronizados (${(res as any).newProducts} novos, ${(res as any).updatedProducts} atualizados${deletedMsg})!`
                );
                router.refresh();
            }
        });
    };

    const handleSpreadsheetSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
                defval: "",
            });

            const mapped = extractMappedRows(rawJson);
            if (mapped.length === 0) {
                toast.error(
                    "Não encontramos colunas de Código e Descrição na planilha. Verifique se o cabeçalho contém Código, Descrição, Estoque e Preço."
                );
                return;
            }

            // Verifica se há produtos cadastrados anteriormente que não constam na nova planilha
            const incomingSkus = mapped.map((m) => m.sku);
            const checkRes = await checkMissingCatalogProducts({
                tenantId,
                incomingSkus,
            });

            if (checkRes.missingCount && checkRes.missingCount > 0) {
                setPendingImportItems(mapped);
                setMissingSkus(checkRes.missingSkus || []);
                setShowMissingModal(true);
                return;
            }

            // Se não há ausentes, importa direto
            executeImport(mapped, false, []);
        } catch {
            toast.error("Não foi possível ler o arquivo selecionado.");
        }
    };

    const handleBatchPhotosSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const files = Array.from(fileList);
        e.target.value = "";

        startTransition(async () => {
            const fd = new FormData();
            fd.append("tenantId", tenantId);
            for (const f of files) fd.append("files", f);

            const res = await bulkMatchProductPhotosAction(fd);
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                const { matched, unmatched } = res as any;
                if (matched > 0) {
                    toast.success(
                        `${matched} foto(s) vinculadas automaticamente pelo código do produto!`
                    );
                }
                if (unmatched?.length > 0) {
                    toast.warning(
                        `${unmatched.length} arquivo(s) não tinham código correspondente no nome.`
                    );
                }
                router.refresh();
            }
        });
    };

    const handleSinglePhotoUpload = async (productId: string, file?: File) => {
        if (!file) return;
        setUploadingProductId(productId);
        try {
            const fd = new FormData();
            fd.append("tenantId", tenantId);
            fd.append("productId", productId);
            fd.append("file", file);

            const res = await uploadProductPhotoAction(fd);
            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success("Foto adicionada ao produto!");
                router.refresh();
            }
        } finally {
            setUploadingProductId(null);
        }
    };

    const handleCreateManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!sku.trim() || !name.trim()) return;

        startTransition(async () => {
            const res = await upsertSingleTenantProduct({
                tenantId,
                sku: sku.trim(),
                name: name.trim(),
                category: category.trim() || undefined,
                price: parseBrazilianNumber(price),
                stock_quantity: Math.trunc(parseBrazilianNumber(stock)),
            });

            if ((res as any)?.error) {
                toast.error((res as any).error);
            } else {
                toast.success("Produto salvo no catálogo!");
                setSku("");
                setName("");
                setCategory("");
                setPrice("");
                setStock("1");
                setShowNewForm(false);
                router.refresh();
            }
        });
    };

    return (
        <div className="divide-y divide-zinc-100">
            {/* Cabeçalho */}
            <div className="px-6 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50">
                <div>
                    <h3 className="text-base font-bold text-zinc-950 flex items-center gap-2">
                        <Package className="size-4 text-indigo-600" />
                        Catálogo de Produtos & Estoque
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Importe a planilha do sistema para atualizar preços e saldos mantendo as fotos vinculadas.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={sheetInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleSpreadsheetSelect}
                    />
                    <input
                        ref={batchPhotosInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={handleBatchPhotosSelect}
                    />

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending || tableMissing}
                        onClick={() => batchPhotosInputRef.current?.click()}
                        className="h-9 text-xs font-semibold"
                        title="Nomeie os arquivos com o código do produto (ex: 1050.jpg) para vincular várias fotos de uma vez"
                    >
                        <Images className="mr-1.5 size-3.5 text-violet-600" />
                        Fotos por Código
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending || tableMissing}
                        onClick={() => sheetInputRef.current?.click()}
                        className="h-9 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                        {isPending ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                            <Upload className="mr-1.5 size-3.5" />
                        )}
                        Importar Planilha
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        disabled={isPending || tableMissing}
                        onClick={() => setShowNewForm((v) => !v)}
                        className="h-9 bg-zinc-950 hover:bg-indigo-600 text-white text-xs font-semibold"
                    >
                        <Plus className="mr-1.5 size-3.5" />
                        {showNewForm ? "Fechar" : "Novo Produto"}
                    </Button>
                </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
                {tableMissing && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-900">
                        <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Estrutura inicial do catálogo pendente no banco</p>
                            <p className="mt-0.5 text-amber-800">
                                Execute o arquivo <code className="font-mono font-semibold">sql/products_catalog.sql</code> uma única vez no painel do banco de dados para liberar a importação de produtos.
                            </p>
                        </div>
                    </div>
                )}

                {/* Resumo Rápido */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3.5">
                        <span className="text-[11px] font-medium text-zinc-500">Total Cadastrado</span>
                        <p className="text-xl font-bold text-zinc-950 tabular-nums mt-0.5">{stats.total.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3.5">
                        <span className="text-[11px] font-medium text-zinc-500">Disponíveis em Estoque</span>
                        <p className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5">{stats.inStock.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3.5">
                        <span className="text-[11px] font-medium text-zinc-500">Com Foto</span>
                        <p className="text-xl font-bold text-indigo-700 tabular-nums mt-0.5">{stats.withPhoto.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3.5">
                        <span className="text-[11px] font-medium text-zinc-500">Sem Saldo</span>
                        <p className="text-xl font-bold text-zinc-500 tabular-nums mt-0.5">{stats.outOfStock.toLocaleString("pt-BR")}</p>
                    </div>
                </div>

                {/* Cadastro Manual / Edição Rápida por Código */}
                {showNewForm && (
                    <form
                        onSubmit={handleCreateManual}
                        className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-4"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs font-semibold">Código</Label>
                                <Input
                                    value={sku}
                                    onChange={(e) => setSku(e.target.value)}
                                    placeholder="Ex: 1050"
                                    className="bg-white h-9 text-xs font-mono"
                                    required
                                />
                            </div>
                            <div className="sm:col-span-4 space-y-1">
                                <Label className="text-xs font-semibold">Descrição do Produto</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ex: Teclado Mecânico Redragon Kumara RGB"
                                    className="bg-white h-9 text-xs"
                                    required
                                />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs font-semibold">Categoria</Label>
                                <Input
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Periféricos"
                                    className="bg-white h-9 text-xs"
                                />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs font-semibold">Preço (R$)</Label>
                                <Input
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="219,90"
                                    className="bg-white h-9 text-xs font-mono"
                                    required
                                />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs font-semibold">Estoque</Label>
                                <Input
                                    type="number"
                                    value={stock}
                                    onChange={(e) => setStock(e.target.value)}
                                    className="bg-white h-9 text-xs font-mono"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5"
                            >
                                Salvar Produto
                            </Button>
                        </div>
                    </form>
                )}

                {/* Busca & Filtros */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                        <Input
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder="Buscar em todo o catálogo por código, descrição ou categoria..."
                            className="pl-9 h-9 text-xs bg-white"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1 text-xs font-semibold">
                        {[
                            { id: "all", label: "Todos" },
                            { id: "in_stock", label: "Em Estoque" },
                            { id: "with_photo", label: "Com Foto" },
                            { id: "out_of_stock", label: "Sem Saldo" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    setFilter(tab.id as any);
                                    setCurrentPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                                    filter === tab.id
                                        ? "bg-white text-zinc-950 shadow-2xs"
                                        : "text-zinc-500 hover:text-zinc-900"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista de Produtos */}
                {filtered.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center space-y-2 text-zinc-500">
                        <Package className="size-8 mx-auto text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">
                            Nenhum produto encontrado
                        </p>
                        <p className="text-xs text-zinc-400 max-w-md mx-auto">
                            Clique em &ldquo;Importar Planilha&rdquo; para carregar seu arquivo Excel ou CSV com colunas de Código, Descrição, Estoque e Preço.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 px-1">
                            <span>
                                Exibindo{" "}
                                <strong className="text-zinc-800">
                                    {((safePage - 1) * PAGE_SIZE + 1).toLocaleString("pt-BR")}–
                                    {Math.min(safePage * PAGE_SIZE, filtered.length).toLocaleString("pt-BR")}
                                </strong>{" "}
                                de <strong className="text-zinc-800">{filtered.length.toLocaleString("pt-BR")}</strong> produtos
                            </span>

                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={safePage <= 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        className="h-7 px-2.5 text-xs"
                                    >
                                        <ChevronLeft className="size-3.5 mr-1" />
                                        Anterior
                                    </Button>
                                    <span className="px-2 font-mono text-[11px] font-semibold text-zinc-700">
                                        Pág. {safePage} / {totalPages}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={safePage >= totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="h-7 px-2.5 text-xs"
                                    >
                                        Próxima
                                        <ChevronRight className="size-3.5 ml-1" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white divide-y divide-zinc-100">
                            {paginatedItems.map((p) => {
                            const hasPhoto = Array.isArray(p.image_urls) && p.image_urls.length > 0;
                            const inStock = Number(p.stock_quantity) > 0;

                            return (
                                <div
                                    key={p.id}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/70 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                        {/* Miniatura / Botão de Foto */}
                                        <div className="relative group shrink-0">
                                            <label className="flex size-14 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden cursor-pointer hover:border-indigo-300 transition-colors">
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        e.target.value = "";
                                                        void handleSinglePhotoUpload(p.id, f);
                                                    }}
                                                />
                                                {uploadingProductId === p.id ? (
                                                    <Loader2 className="size-4 animate-spin text-indigo-600" />
                                                ) : hasPhoto ? (
                                                    <img
                                                        src={p.image_urls[0]}
                                                        alt={p.name}
                                                        className="size-full object-cover"
                                                    />
                                                ) : (
                                                    <Camera className="size-4 text-zinc-400 group-hover:text-indigo-600" />
                                                )}
                                            </label>

                                            {hasPhoto && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        startTransition(async () => {
                                                            await clearProductPhotosAction({
                                                                tenantId,
                                                                productId: p.id,
                                                            });
                                                            toast.success("Foto removida.");
                                                            router.refresh();
                                                        });
                                                    }}
                                                    className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-zinc-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                    title="Remover foto"
                                                >
                                                    <X className="size-2.5" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-700">
                                                    #{p.sku}
                                                </span>
                                                <span className="text-xs font-bold text-zinc-950 truncate">
                                                    {p.name}
                                                </span>
                                                {p.category && (
                                                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                        {p.category}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 text-xs">
                                                <span className="font-bold text-zinc-900 tabular-nums">
                                                    {Number(p.price || 0).toLocaleString("pt-BR", {
                                                        style: "currency",
                                                        currency: "BRL",
                                                    })}
                                                </span>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                        inStock
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                                            : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                                                    }`}
                                                >
                                                    {inStock
                                                        ? `Estoque: ${p.stock_quantity} un.`
                                                        : "Sem estoque"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={isPending}
                                            onClick={() => {
                                                startTransition(async () => {
                                                    const res = await deleteTenantProduct({
                                                        tenantId,
                                                        productId: p.id,
                                                    });
                                                    if ((res as any)?.error) {
                                                        toast.error((res as any).error);
                                                    } else {
                                                        toast.success("Produto excluído.");
                                                        router.refresh();
                                                    }
                                                });
                                            }}
                                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50"
                                            title="Excluir produto"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage <= 1}
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    className="h-8 px-3 text-xs"
                                >
                                    <ChevronLeft className="size-3.5 mr-1" />
                                    Anterior
                                </Button>
                                <span className="px-2.5 font-mono text-xs font-semibold text-zinc-700">
                                    Página {safePage} de {totalPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    className="h-8 px-3 text-xs"
                                >
                                    Próxima
                                    <ChevronRight className="size-3.5 ml-1" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Confirmação: Produtos Removidos da Nova Planilha */}
            {showMissingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="size-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                                    <AlertTriangle className="size-6" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-base font-bold text-slate-900">
                                        Produtos Ausentes na Planilha
                                    </h3>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Identificamos que <strong className="text-slate-900 font-semibold">{missingSkus.length} produto(s)</strong> cadastrados anteriormente não constam neste novo arquivo.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowMissingModal(false);
                                    setPendingImportItems(null);
                                    setMissingSkus([]);
                                }}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-1.5 text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">
                                O que você deseja fazer com os produtos que saíram da planilha?
                            </p>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                • <strong>Excluir:</strong> remove os {missingSkus.length} itens ausentes do catálogo.<br />
                                • <strong>Manter:</strong> preserva os itens antigos no sistema e apenas atualiza os que estão na planilha.
                            </p>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={isPending}
                                onClick={() => {
                                    setShowMissingModal(false);
                                    setPendingImportItems(null);
                                    setMissingSkus([]);
                                }}
                                className="text-xs text-slate-500 hover:text-slate-800"
                            >
                                Cancelar
                            </Button>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isPending}
                                    onClick={() => {
                                        if (pendingImportItems) {
                                            executeImport(pendingImportItems, false, []);
                                        }
                                    }}
                                    className="text-xs font-semibold"
                                >
                                    Manter Anteriores
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => {
                                        if (pendingImportItems) {
                                            executeImport(pendingImportItems, true, missingSkus);
                                        }
                                    }}
                                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                                >
                                    {isPending ? (
                                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-1.5 size-3.5" />
                                    )}
                                    Excluir {missingSkus.length} Produtos
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
