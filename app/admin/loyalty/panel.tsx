"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Customer } from "@/lib/loyalty-types";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import {
  addStampAction,
  archiveCustomerAction,
  restoreCustomerAction,
  redeemRewardAction,
} from "./actions";
import { normalizeCode } from "@/lib/loyalty-code";

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

export function LoyaltyPanel({
  customers,
  operationKeys,
}: {
  customers: Customer[];
  operationKeys: Record<string, { stamp: string; redeem: string }>;
}) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.filter((c) => Boolean(c.archivedAt) === archived);
    return customers.filter(
      (c) =>
        [c.name, c.code, ...(c.aliases ?? []), c.email ?? "", c.phone ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q) ||
        [c.code, ...(c.aliases ?? [])].includes(normalizeCode(q)),
    );
  }, [customers, query, archived]);

  return (
    <div className="lyl-panel">
      <div className="lyl-row-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`lyl-btn ${archived ? "ghost" : "primary"}`}
          aria-pressed={!archived}
          onClick={() => {
            setArchived(false);
            setQuery("");
          }}
        >
          Activos
        </button>
        <button
          type="button"
          className={`lyl-btn ${archived ? "primary" : "ghost"}`}
          aria-pressed={archived}
          onClick={() => {
            setArchived(true);
            setQuery("");
          }}
        >
          Archivados ({customers.filter((c) => c.archivedAt).length})
        </button>
      </div>
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
            : archived && !query
              ? "No hay tarjetas archivadas."
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
                  {c.archivedAt && (
                    <span className="lyl-metaitem">Archivado</span>
                  )}
                  {c.rewardsAvailable > 0 && (
                    <span className="lyl-reward-badge">
                      🍔 {c.rewardsAvailable} gratis
                    </span>
                  )}
                </div>
                <div className="lyl-stamps-mini" aria-hidden="true">
                  {Array.from({ length: STAMPS_PER_REWARD }, (_, i) => (
                    <span
                      key={i}
                      className={`lyl-dot${i < c.stamps ? " on" : ""}`}
                    />
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
                <span className="lyl-metaitem">
                  Últ. visita {shortDate(c.lastStampAt)}
                </span>
                <span className="lyl-metaitem">Total {c.totalStamps}</span>
              </div>

              <div className="lyl-row-actions">
                {c.archivedAt ? (
                  <form action={restoreCustomerAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton className="lyl-btn primary">
                      Restaurar tarjeta
                    </SubmitButton>
                  </form>
                ) : (
                  <>
                    <form action={addStampAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        type="hidden"
                        name="operationId"
                        value={operationKeys[c.id].stamp}
                      />
                      <SubmitButton className="lyl-btn primary">
                        +1 sello
                      </SubmitButton>
                    </form>
                    <form action={redeemRewardAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        type="hidden"
                        name="operationId"
                        value={operationKeys[c.id].redeem}
                      />
                      <SubmitButton
                        className="lyl-btn ghost"
                        disabled={c.rewardsAvailable <= 0}
                      >
                        Canjear
                      </SubmitButton>
                    </form>
                    <form
                      action={archiveCustomerAction}
                      onSubmit={(e) => {
                        if (
                          !window.confirm(
                            `¿Archivar a ${c.name}? Su código y sellos se conservan. Puedes restaurar la tarjeta en Archivados.`,
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="lyl-btn ghost">
                        Archivar
                      </SubmitButton>
                    </form>
                  </>
                )}
                <a href={`/card/${c.id}`} className="lyl-btn ghost">
                  Abrir / recuperar tarjeta
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
