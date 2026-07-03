"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Customer } from "@/lib/loyalty-types";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { addStampAction, deleteCustomerAction, redeemRewardAction } from "./actions";

function SubmitButton({
  className,
  children,
  disabled,
}: {
  className: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? "…" : children}
    </button>
  );
}

/** ISO → "DD/MM" without locale/timezone (avoids hydration drift). */
function shortDate(iso?: string): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function LoyaltyPanel({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.code, c.email ?? "", c.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [customers, query]);

  return (
    <div className="lyl-panel">
      <input
        className="lyl-search"
        type="search"
        placeholder="Buscar por nombre, código, email o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="admin-muted">
          {customers.length === 0
            ? "Aún no hay clientes registrados."
            : "Sin resultados para esa búsqueda."}
        </p>
      ) : (
        <ul className="lyl-list">
          {filtered.map((c) => (
            <li key={c.id} className="lyl-row">
              <div className="lyl-row-top">
                <div className="lyl-id">
                  <span className="lyl-name">{c.name}</span>
                  <span className="lyl-code">{c.code}</span>
                  {c.rewardsAvailable > 0 && (
                    <span className="lyl-reward-badge">
                      🍔 {c.rewardsAvailable} gratis
                    </span>
                  )}
                </div>
                <div className="lyl-stamps-mini" aria-hidden="true">
                  {Array.from({ length: STAMPS_PER_REWARD }, (_, i) => (
                    <span key={i} className={`lyl-dot${i < c.stamps ? " on" : ""}`} />
                  ))}
                </div>
              </div>

              <div className="lyl-row-meta">
                <span className="lyl-metaitem strong">
                  {c.stamps}/{STAMPS_PER_REWARD} sellos
                </span>
                {(c.email || c.phone) && (
                  <span className="lyl-metaitem">{c.email || c.phone}</span>
                )}
                <span className="lyl-metaitem">Últ. visita {shortDate(c.lastStampAt)}</span>
                <span className="lyl-metaitem">Total {c.totalStamps}</span>
              </div>

              <div className="lyl-row-actions">
                <form action={addStampAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="lyl-btn primary">+1 sello</SubmitButton>
                </form>
                <form action={redeemRewardAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="lyl-btn ghost" disabled={c.rewardsAvailable <= 0}>
                    Canjear
                  </SubmitButton>
                </form>
                <form
                  action={deleteCustomerAction}
                  onSubmit={(e) => {
                    if (
                      !window.confirm(
                        `¿Borrar a ${c.name}? Se elimina su tarjeta y sellos. No se puede deshacer.`,
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="lyl-btn danger">Borrar</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
