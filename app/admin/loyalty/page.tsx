import QRCode from "qrcode";
import { listCustomers } from "@/lib/loyalty-store";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { getBaseUrl } from "@/lib/base-url";
import { LoyaltyPanel } from "./panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weekend Burger · Fidelidad",
  robots: { index: false, follow: false },
};

export default async function LoyaltyAdminPage() {
  const customers = await listCustomers();
  const baseUrl = await getBaseUrl();
  const joinUrl = `${baseUrl}/join`;
  const joinQr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 });

  const totalRewardsAvailable = customers.reduce((n, c) => n + c.rewardsAvailable, 0);
  const totalStamps = customers.reduce((n, c) => n + c.totalStamps, 0);

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
            <span className="lyl-stat-num">{customers.length}</span>
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
          <summary>QR para registrar clientes (imprímelo para las mesas)</summary>
          <div className="lyl-join-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={joinQr} alt="QR de registro" width={200} height={200} />
            <p className="admin-muted">
              Enlaza a <code>{joinUrl}</code>. El cliente se registra y recibe su tarjeta.
            </p>
          </div>
        </details>

        <LoyaltyPanel customers={customers} />
      </div>
    </main>
  );
}
