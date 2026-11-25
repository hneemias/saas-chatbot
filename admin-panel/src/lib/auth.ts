import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

function getJwtSecretKey(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET é obrigatório em produção no Admin Panel.");
    }
    return new TextEncoder().encode(secret || "dev-only-local-jwt-secret-change-in-prod");
}

export interface AdminSessionUser {
    id: string;
    email: string;
    role: string;
    name: string;
}

export async function signJWT(payload: Record<string, any>) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(getJwtSecretKey());
}

export async function verifyJWT(token: string) {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        return payload;
    } catch {
        return null;
    }
}

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}

export async function getUser(token: string | undefined): Promise<AdminSessionUser | null> {
    if (!token) return null;
    const payload = await verifyJWT(token);
    if (!payload || !payload.sub) return null;

    return {
        id: String(payload.sub),
        email: String(payload.email || ""),
        role: String(payload.role || "admin"),
        name: String(payload.full_name || payload.name || "Administrador"),
    };
}

/**
 * Garante sessão administrativa válida em todas as Server Actions e rotas privadas.
 */
export async function requireAdminSession(): Promise<AdminSessionUser> {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    const user = await getUser(token);
    if (!user) {
        throw new Error("Sessão expirada ou não autorizada. Faça login novamente.");
    }
    return user;
}
