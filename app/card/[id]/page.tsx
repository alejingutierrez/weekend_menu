import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getCustomer } from "@/lib/loyalty-store";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { getBaseUrl } from "@/lib/base-url";
import { buildStampUrl } from "@/lib/stamp-link";
import { CardPreparing } from "./preparing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekend Club · Mi tarjeta",
  robots: { index: false, follow: false },
};

const appleReady = Boolean(
  process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_PASS_CERT,
);
const googleReady = Boolean(
  process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SERVICE_ACCOUNT,
);

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    // Blob is eventually consistent — a just-created card may not be
    // readable for a second or two. Show a "preparing" screen that retries
    // a few times before giving up with a real 404.
    const r = Number((await searchParams).r ?? 0);
    if (Number.isFinite(r) && r < 10) {
      return <CardPreparing href={`/card/${id}?r=${r + 1}`} />;
    }
    notFound();
  }

  const baseUrl = await getBaseUrl();
  const stampUrl = await buildStampUrl(baseUrl, id);
  const qr = await QRCode.toDataURL(stampUrl, {
    margin: 1,
    width: 320,
    color: { dark: "#0F1B49", light: "#FFFFFF" },
  });

  const slots = Array.from({ length: STAMPS_PER_REWARD }, (_, i) => i < customer.stamps);

  return (
    <main className="lc-shell">
      <div className="lc-card">
        <div className="lc-brand">weekend<span>club</span></div>
        <p className="lc-hello">¡Hola, {customer.name}! 👋</p>

        {customer.rewardsAvailable > 0 && (
          <div className="lc-reward-banner">
            🎉 Tienes {customer.rewardsAvailable}{" "}
            {customer.rewardsAvailable === 1 ? "hamburguesa gratis" : "hamburguesas gratis"} · dilo en caja
          </div>
        )}

        <div className="lc-stamps" aria-label={`${customer.stamps} de ${STAMPS_PER_REWARD} sellos`}>
          {slots.map((filled, i) => (
            <span key={i} className={`lc-stamp ${filled ? "on" : ""}`}>
              {filled ? "🍔" : ""}
            </span>
          ))}
        </div>
        <p className="lc-count">
          {customer.stamps}/{STAMPS_PER_REWARD} sellos ·{" "}
          {STAMPS_PER_REWARD - customer.stamps} para tu próxima gratis
        </p>

        <div className="lc-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código para sellar" width={220} height={220} />
          <p className="lc-code">
            Código: <strong>{customer.code}</strong>
          </p>
          <p className="lc-hint">Muestra este código en caja para que te sellen.</p>
        </div>

        <div className="lc-wallets">
          {appleReady ? (
            <a className="lc-wallet-btn apple" href={`/api/wallet/apple/${id}`}> Añadir a Apple Wallet</a>
          ) : (
            <span className="lc-wallet-btn disabled"> Apple Wallet · próximamente</span>
          )}
          {googleReady ? (
            <a className="lc-wallet-btn google" href={`/api/wallet/google/${id}`}>Añadir a Google Wallet</a>
          ) : (
            <span className="lc-wallet-btn disabled">Google Wallet · próximamente</span>
          )}
        </div>
        <p className="lc-hint lc-save-hint">
          Guarda esta página en tus favoritos para volver a verla.
        </p>
      </div>
    </main>
  );
}
