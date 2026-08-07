"use client";

import { useActionState } from "react";
import { User, Lock, ArrowRight, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, null);

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-7">
      <div className="space-y-1.5">
        <label htmlFor="identifier" className="ir-label !text-white/45">
          Username or email
        </label>
        <div className="relative">
          <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoFocus
            autoComplete="username"
            className="w-full rounded border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-white/25 transition-colors focus:border-ir-gold focus:outline-none focus:ring-2 focus:ring-ir-gold/30"
            placeholder="shiham"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="ir-label !text-white/45">
          Password
        </label>
        <div className="relative">
          <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-white/25 transition-colors focus:border-ir-gold focus:outline-none focus:ring-2 focus:ring-ir-gold/30"
            placeholder="••••••••"
          />
        </div>
      </div>

      {state?.error && (
        <div className="rounded border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">{state.error}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="ir-btn ir-btn-gold w-full justify-center gap-2 py-2.5 disabled:opacity-60"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
