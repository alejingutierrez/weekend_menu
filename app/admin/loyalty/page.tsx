import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin-session";
import { customerDirectory } from "@/lib/loyalty-store";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { getBaseUrl } from "@/lib/base-url";
import { LoyaltyPanel } from "./panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weekend Burger · Fidelidad",
  robots: { index: false, follow: false },
};

export default async function LoyaltyAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; archived?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams,
    query = (params.q ?? "").slice(0, 120),
    archived = params.archived === "1";
  const directory = await customerDirectory(
      query,
      Number(params.page ?? 1),
      archived,
    ),
    customers = directory.customers;
  const baseUrl = await getBaseUrl();
  const joinUrl = `${baseUrl}/join`;
  const joinQr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 });

  const totalRewardsAvailable = directory.rewards;
  const totalStamps = directory.totalStamps;

  return (
    <main className="admin-shell admin-shell-wide">
      <nav className="admin-nav">
        <a href="/admin">← Editor de menú</a>
        <span className="admin-nav-current">Fidelidad</span>
      </nav>

      <div className="admin-card">
        <h1 className="admin-title">Weekend Club</h1>
        <p className="admin-subtitle">
          {STAMPS_PER_REWARD} sellos = 1 hamburguesa gratis.
        </p>

        <div className="lyl-stats">
          <div className="lyl-stat">
            <span className="lyl-stat-num">{directory.active}</span>
            <span className="lyl-stat-label">clientes</span>
          </div>
          <div className="lyl-stat">
            <span className="lyl-stat-num">{totalStamps}</span>
            <span className="lyl-stat-label">sellos totales</span>
          </div>
          <div className="lyl-stat">
            <span className="lyl-stat-num">{totalRewardsAvailable}</span>
            <span className="lyl-stat-label">premios sin canjear</span>
          </div>
        </div>

        <details className="lyl-join">
          <summary>
            QR para registrar clientes (imprímelo para las mesas)
          </summary>
          <div className="lyl-join-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={joinQr} alt="QR de registro" width={200} height={200} />
            <p className="admin-muted">
              Enlaza a <code>{joinUrl}</code>. El cliente se registra y recibe
              su tarjeta.
            </p>
          </div>
        </details>

        <p>
          <a href="/admin/loyalty/status">Estado de datos y Apple Wallet</a>
        </p>
        <LoyaltyPanel
          customers={customers}
          query={query}
          archived={archived}
          archivedCount={directory.archived}
          operationKeys={Object.fromEntries(
            customers.map((c) => [
              c.id,
              { stamp: randomUUID(), redeem: randomUUID() },
            ]),
          )}
        />
        <nav aria-label="Páginas de clientes" className="lyl-row-actions">
          {directory.page > 1 && (
            <a
              className="lyl-btn ghost"
              href={
                "/admin/loyalty?" +
                new URLSearchParams({
                  q: query,
                  archived: archived ? "1" : "0",
                  page: String(directory.page - 1),
                })
              }
            >
              Anterior
            </a>
          )}
          <span>
            {directory.matches} coincidencias · Página {directory.page}
          </span>
          {directory.page * 50 < directory.matches && (
            <a
              className="lyl-btn ghost"
              href={
                "/admin/loyalty?" +
                new URLSearchParams({
                  q: query,
                  archived: archived ? "1" : "0",
                  page: String(directory.page + 1),
                })
              }
            >
              Siguiente
            </a>
          )}
        </nav>
      </div>
    </main>
  );
}
