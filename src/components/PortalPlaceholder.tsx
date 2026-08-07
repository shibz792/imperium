import { logoutAction } from "@/app/login/actions";
import { Logo } from "@/components/Logo";
import { ROLE_LABELS, type CurrentUser } from "@/lib/auth";

export function PortalPlaceholder({ user }: { user: CurrentUser }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ir-navy px-6 text-center text-white">
      <Logo variant="full" tone="dark" size="lg" />
      <div className="max-w-md space-y-2">
        <h1 className="ir-editorial text-2xl">The {ROLE_LABELS[user.role]} portal is on the roadmap</h1>
        <p className="text-sm text-white/60">
          Phase 3 of the roadmap adds a dedicated {user.role === "OWNER_PORTAL" ? "owner" : "buyer/tenant"} portal, a limited,
          branded view of your shortlist, viewings and reports. For now, please contact your Imperium agent directly.
        </p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="ir-btn ir-btn-gold">
          Sign out
        </button>
      </form>
    </div>
  );
}
