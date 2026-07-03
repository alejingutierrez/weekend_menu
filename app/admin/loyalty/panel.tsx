"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Customer } from "@/lib/loyalty-types";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { addStampAction, redeemRewardAction } from "./actions";

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
              <div className="lyl-row-main">
                <span className="lyl-name">{c.name}</span>
                <span className="lyl-code">{c.code}</span>
                {(c.email || c.phone) && (
                  <span className="lyl-contact">{c.email || c.phone}</span>
                )}
              </div>
              <div className="lyl-row-stats">
                <span className="lyl-stamps-count">
                  {c.stamps}/{STAMPS_PER_REWARD}
                </span>
                {c.rewardsAvailable > 0 && (
                  <span className="lyl-reward-badge">
                    🍔 {c.rewardsAvailable} gratis
                  </span>
                )}
              </div>
              <div className="lyl-row-actions">
                <form action={addStampAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="lyl-btn primary">+1 sello</SubmitButton>
                </form>
                <form action={redeemRewardAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton
                    className="lyl-btn ghost"
                    disabled={c.rewardsAvailable <= 0}
                  >
                    Canjear
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
