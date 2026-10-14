import { requireAdmin } from "@/lib/admin-session";
import {
  loyaltyHealth,
  lastLoyaltyBackup,
  walletQueueStatus,
} from "@/lib/loyalty-store";
import { appleCertificateStatus } from "@/lib/apple-wallet";
import { retryWallets } from "./actions";
export const dynamic = "force-dynamic";
export default async function LoyaltyStatus() {
  await requireAdmin();
  const [health, backup, queue] = await Promise.all([
    loyaltyHealth(),
    lastLoyaltyBackup(),
    walletQueueStatus(),
  ]);
  const apple = appleCertificateStatus();
  return (
    <main className="admin-shell">
      <div className="admin-card">
        <h1>Estado de tarjetas y datos</h1>
        <p role="status">
          {health.healthy
            ? "Datos y protecciones verificados."
            : "Hay una comprobación de datos pendiente de revisión."}
        </p>
        <dl>
          <dt>Tarjetas conservadas</dt>
          <dd>{health.cards}</dd>
          <dt>Sellos acumulados</dt>
          <dd>{health.totalStamps}</dd>
          <dt>Registros activos de Apple Wallet</dt>
          <dd>{health.devices}</dd>
          <dt>Actualizaciones pendientes</dt>
          <dd>{health.pendingWallets}</dd>
          <dt>Certificado de Apple</dt>
          <dd>
            {apple.valid
              ? `Válido hasta ${apple.expiresAt?.slice(0, 10)} (${apple.daysRemaining} días).`
              : "Revisar la configuración del certificado."}
          </dd>
        </dl>
        {queue.paused > 0 && (
          <p role="alert">
            {queue.paused} actualizaciones agotaron sus intentos automáticos.
            Sus datos están conservados; revisa la configuración y reintenta.
          </p>
        )}
        {(!backup ||
          Date.now() - new Date(backup.verifiedAt).getTime() >
            36 * 3600000) && (
          <p role="alert">
            La copia cifrada necesita revisión: no hay una copia verificada en
            las últimas 36 horas.
          </p>
        )}
        <p>
          Última copia cifrada verificada:{" "}
          {backup
            ? `${new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(backup.verifiedAt))} Bogotá · ${backup.cards} tarjetas`
            : "Pendiente de la primera copia."}
        </p>
        {apple.valid &&
          apple.daysRemaining !== undefined &&
          apple.daysRemaining < 30 && (
            <p>
              El certificado vence pronto. Renueva el certificado conservando el
              identificador del pase y sus tokens.
            </p>
          )}
        <form action={retryWallets}>
          <button className="lyl-btn primary">
            Reintentar actualizaciones de Wallet
          </button>
        </form>
        <p>
          Los sellos se guardan antes de enviar el aviso a Wallet. Si el aviso
          falla, queda pendiente para reintento. El cliente también puede
          consultar o descargar su tarjeta desde el enlace existente.
        </p>
        <a href="/admin/loyalty">← Fidelidad</a>
      </div>
    </main>
  );
}
