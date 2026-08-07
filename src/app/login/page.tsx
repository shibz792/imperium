import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GridPattern } from "@/components/GridPattern";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

// A skyline built from the same bar-chart language as the logomark itself —
// not a stock illustration, an echo of the one glyph this brand already
// owns. Heights are a fixed array (not random per render) so the page never
// hydration-mismatches and never redraws itself between visits.
const SKYLINE = [22, 38, 26, 52, 34, 44, 28, 60, 40, 30, 48, 24, 56, 32, 42, 26, 50, 36, 20, 46, 30, 54, 38, 28];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/command-centre");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ir-navy px-6 py-16 text-white">
      <GridPattern />

      {/* Signature moment: a soft gold glow behind the wordmark, and a faint
          skyline silhouette grounding the page along the bottom edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.14] blur-[110px]"
        style={{ background: "radial-gradient(circle, var(--color-gold) 0%, transparent 70%)" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center gap-[3px] opacity-[0.07] sm:gap-1.5">
        {SKYLINE.map((h, i) => (
          <div key={i} className="w-3 shrink-0 bg-ir-gold sm:w-5" style={{ height: `${h}%` }} />
        ))}
      </div>

      <div className="relative flex w-full flex-col items-center">
        <Logo variant="full" tone="dark" size="lg" className="mb-7" />

        <h1 className="ir-editorial mb-2.5 text-center text-[2rem] leading-[1.1] text-white sm:text-[2.4rem]">
          Welcome back
        </h1>
        <p className="mb-10 text-sm text-white/40">Sign in to your Imperium Realty workspace.</p>

        <LoginForm />

        <p className="relative mt-10 text-[0.7rem] tracking-[0.08em] text-white/25">IMPERIUM REALTY OS</p>
      </div>
    </div>
  );
}
