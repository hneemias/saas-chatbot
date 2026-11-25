import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    const user = await getUser(token);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-zinc-50/80">
            <Sidebar user={user} />
            <main className="flex h-full flex-1 flex-col overflow-hidden relative">
                <Header user={user} />
                <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
