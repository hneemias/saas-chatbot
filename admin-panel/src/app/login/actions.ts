"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { comparePassword, hashPassword, requireAdminSession, signJWT } from "@/lib/auth";

export async function login(formData: FormData) {
    try {
        const cookieStore = await cookies();
        const supabase = createAdminClient();

        const email = ((formData.get("email") as string) || "").trim().toLowerCase();
        const password = (formData.get("password") as string) || "";

        if (!email || !password) {
            return { error: "Informe e-mail e senha." };
        }

        const { data: user, error: dbErr } = await supabase
            .from("admin_users")
            .select("id, email, password_hash, role, full_name")
            .eq("email", email)
            .maybeSingle();

        if (dbErr) {
            return { error: "Erro ao consultar banco: " + dbErr.message };
        }

        if (!user) {
            return { error: "Credenciais inválidas." };
        }

        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return { error: "Credenciais inválidas." };
        }

        const token = await signJWT({
            sub: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
        });

        cookieStore.set("admin_token", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24, // 24h
            path: "/",
        });

        revalidatePath("/", "layout");
    } catch (err: any) {
        return { error: err?.message || "Falha interna ao autenticar." };
    }

    redirect("/dashboard");
}

export async function updateAdminPassword(formData: FormData) {
    const session = await requireAdminSession();
    const supabase = createAdminClient();

    const currentPassword = (formData.get("currentPassword") as string) || "";
    const newPassword = (formData.get("newPassword") as string) || "";

    if (newPassword.length < 6) {
        return { error: "A nova senha deve ter pelo menos 6 caracteres." };
    }

    const { data: user } = await supabase
        .from("admin_users")
        .select("id, password_hash")
        .eq("id", session.id)
        .maybeSingle();

    if (!user) {
        return { error: "Usuário administrador não encontrado." };
    }

    const valid = await comparePassword(currentPassword, user.password_hash);
    if (!valid) {
        return { error: "Senha atual incorreta." };
    }

    const newHash = await hashPassword(newPassword);
    const { error } = await supabase
        .from("admin_users")
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", session.id);

    if (error) {
        return { error: error.message };
    }

    return { success: true };
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.delete("admin_token");
    redirect("/login");
}
