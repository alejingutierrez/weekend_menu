"use client";

import { useEffect } from "react";

/**
 * Shown briefly when a just-created card isn't readable yet (Vercel Blob is
 * eventually consistent). Auto-reloads to a bumped retry URL after a short
 * delay; the card page gives up with a real 404 after a few tries.
 */
export function CardPreparing({ href }: { href: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.replace(href);
    }, 1200);
    return () => clearTimeout(t);
  }, [href]);

  return (
    <main className="lc-shell">
      <div className="lc-logo">
        <h1>weekend</h1>
        <span className="lc-logo-club">club</span>
      </div>
      <div className="lc-card lc-preparing">
        <div className="lc-spinner" aria-hidden="true" />
        <p className="lc-preparing-text">Preparando tu tarjeta…</p>
        <p className="lc-hint">Un momento, guardando tus datos.</p>
      </div>
    </main>
  );
}
