import { requireUser } from "@/lib/auth";
import { navForRole } from "@/lib/nav";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PortalPlaceholder } from "@/components/PortalPlaceholder";
import { MobileNavProvider } from "@/components/MobileNavContext";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = navForRole(user.role);

  if (items.length === 0) {
    return <PortalPlaceholder user={user} />;
  }

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar items={items} user={user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 bg-ir-ivory px-4 py-6 sm:px-10 sm:py-9">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
