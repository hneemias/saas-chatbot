"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { createTenant, updateTenant, getInstancesData } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Save, Hash, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const initialState = {
    message: "",
};

interface TenantFormProps {
    tenantId?: string;
    initialData?: {
        name: string;
        evolution_instance_name: string;
        evolution_api_key?: string;
        enable_product_catalog?: boolean;
    };
}

interface InstanceInfo {
    name: string;
    status: string;
    isTaken: boolean;
    tenantName: string | null;
}

export function TenantForm({ tenantId, initialData }: TenantFormProps) {
    const boundUpdateAction = tenantId
        ? updateTenant.bind(null, tenantId)
        : createTenant;
    const [state, formAction, isPending] = useActionState(
        boundUpdateAction,
        initialState
    );
    const router = useRouter();

    const [instances, setInstances] = useState<InstanceInfo[]>([]);
    const [suggestions, setSuggestions] = useState<InstanceInfo[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [inputValue, setInputValue] = useState(
        initialData?.evolution_instance_name || ""
    );
    const suggestionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getInstancesData().then(setInstances).catch(() => {});
    }, []);

    useEffect(() => {
        if (state.message === "success") {
            toast.success(
                tenantId
                    ? "Dados do escritório atualizados!"
                    : "Escritório provisionado com sucesso!"
            );
            if (!tenantId) router.push("/tenants");
        } else if (state.message) {
            toast.error(state.message);
        }
    }, [state, router, tenantId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionRef.current &&
                !suggestionRef.current.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);
        if (value) {
            setSuggestions(
                instances.filter((inst) =>
                    inst.name.toLowerCase().includes(value.toLowerCase())
                )
            );
            setShowSuggestions(true);
        } else {
            setSuggestions(instances.slice(0, 6));
            setShowSuggestions(false);
        }
    };

    return (
        <form action={formAction} className="divide-y divide-zinc-100">
            <div className="px-6 sm:px-8 py-5 bg-zinc-50/50">
                <h3 className="text-base font-bold text-zinc-950">
                    {tenantId ? "Identidade & Instância Evolution" : "Dados do Escritório"}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                    Configure o nome de exibição do escritório e a instância vinculada na Evolution API.
                </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
                <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold text-zinc-700">
                        Nome do Escritório
                    </Label>
                    <Input
                        id="name"
                        name="name"
                        defaultValue={initialData?.name}
                        placeholder="Ex: Advocacia Silva & Associados"
                        required
                        className="h-10"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5 relative">
                        <Label
                            htmlFor="instanceName"
                            className="text-xs font-semibold text-zinc-700"
                        >
                            Nome da Instância (Evolution API)
                        </Label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                            <Input
                                id="instanceName"
                                name="instanceName"
                                value={inputValue}
                                onChange={handleInputChange}
                                onFocus={() => {
                                    setSuggestions(
                                        inputValue
                                            ? instances.filter((i) =>
                                                  i.name
                                                      .toLowerCase()
                                                      .includes(inputValue.toLowerCase())
                                              )
                                            : instances.slice(0, 6)
                                    );
                                    setShowSuggestions(true);
                                }}
                                placeholder="Ex: advocacia_silva"
                                required
                                autoComplete="off"
                                className="h-10 pl-9 font-mono text-xs"
                            />

                            {showSuggestions && suggestions.length > 0 && (
                                <div
                                    ref={suggestionRef}
                                    className="absolute z-50 w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden"
                                >
                                    <div className="px-3 py-1.5 border-b border-zinc-100 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                        Instâncias detectadas na Evolution API
                                    </div>
                                    <div className="max-h-56 overflow-auto divide-y divide-zinc-100">
                                        {suggestions.map((inst, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    setInputValue(inst.name);
                                                    setShowSuggestions(false);
                                                }}
                                                className="w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer"
                                            >
                                                <div>
                                                    <p className="text-xs font-bold font-mono text-zinc-900">
                                                        {inst.name}
                                                    </p>
                                                    <p className="text-[10px] uppercase text-zinc-400">
                                                        {inst.status}
                                                    </p>
                                                </div>
                                                {inst.name === initialData?.evolution_instance_name ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                        Instância Atual
                                                    </span>
                                                ) : inst.isTaken ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                        <AlertTriangle className="size-2.5" />
                                                        Em uso ({inst.tenantName})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                        <CheckCircle2 className="size-2.5" />
                                                        Livre
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label
                            htmlFor="apiKey"
                            className="text-xs font-semibold text-zinc-700"
                        >
                            API Key Específica da Instância (Opcional)
                        </Label>
                        <Input
                            id="apiKey"
                            name="apiKey"
                            type="password"
                            defaultValue={initialData?.evolution_api_key || ""}
                            placeholder="Deixe em branco para usar a Master Key global"
                            className="h-10 font-mono text-xs"
                        />
                    </div>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 cursor-pointer hover:bg-zinc-50 transition-colors">
                    <input
                        type="checkbox"
                        name="enableCatalog"
                        defaultChecked={Boolean(initialData?.enable_product_catalog)}
                        className="mt-0.5 size-4 rounded border-zinc-300 accent-indigo-600 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                        <span className="text-xs font-bold text-zinc-900 block">
                            Habilitar Catálogo de Produtos & Estoque
                        </span>
                        <span className="text-xs text-zinc-500 block">
                            Ative para lojas, assistências técnicas e comércios que vendem produtos físicos com consulta de preço, saldo e envio de fotos no WhatsApp.
                        </span>
                    </div>
                </label>
            </div>

            <div className="px-6 sm:px-8 py-4 bg-zinc-50/70 flex items-center justify-end gap-2.5">
                {!tenantId && (
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => router.back()}
                        className="h-10 text-xs"
                    >
                        Cancelar
                    </Button>
                )}
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
                    {tenantId ? "Salvar Alterações" : "Provisionar Escritório"}
                </Button>
            </div>
        </form>
    );
}
