import { TenantForm } from "@/components/tenant-form";
import { Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewTenantPage() {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-3">
                <Link
                    href="/tenants"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                    <ArrowLeft className="size-3.5" />
                    Voltar para Escritórios
                </Link>

                <div className="flex items-center gap-3.5">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-xs">
                        <Building2 className="size-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                            Provisionar Novo Escritório
                        </h1>
                        <p className="text-sm text-zinc-500">
                            Vincule uma instância da Evolution API e inicialize os agentes Karol e Atlas.
                        </p>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs overflow-hidden">
                <TenantForm />
            </div>
        </div>
    );
}
