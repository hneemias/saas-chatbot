import { type NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/health"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get("admin_token")?.value;
    const verifiedToken = token ? await verifyJWT(token) : null;

    const isPublicPath = PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
    );

    if (!verifiedToken && !isPublicPath) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (verifiedToken && pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (pathname === "/") {
        return NextResponse.redirect(new URL(verifiedToken ? "/dashboard" : "/login", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
