import { verifyCustomerToken } from "@/lib/customer-token";
import { getCustomer, recordFailedScan } from "@/lib/loyalty-store";
import { requireAdmin } from "@/lib/admin-session";
import { randomUUID } from "node:crypto";
import { StampConfirm } from "./confirm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weekend Burger · Poner sello",
  robots: { index: false, follow: false },
};

export default async function StampPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; t?: string }>;
}) {
  const { c: id, t: token } = await searchParams;
  const actor = await requireAdmin();

  const valid = id && token && (await verifyCustomerToken(id, token));
  const customer = valid ? await getCustomer(id) : null;
  const failure = !valid
    ? "invalid_signature"
    : !customer
      ? "customer_missing"
      : customer.archivedAt
        ? "archived"
        : null;
  if (failure) await recordFailedScan(id, failure, actor);

  return (
    <main className="admin-shell">
      <div className="admin-card stamp-card">
        <nav className="admin-nav">
          <a href="/admin/loyalty">← Fidelidad</a>
        </nav>
        {!valid || !customer || customer.archivedAt ? (
          <div className="stamp-result">
            <div className="stamp-result-emoji">⚠️</div>
            <h2 className="stamp-result-title">
              {failure === "archived"
                ? "Tarjeta archivada"
                : failure === "customer_missing"
                  ? "Tarjeta no encontrada"
                  : "QR no válido"}
            </h2>
            <p className="stamp-result-sub">
              {failure === "archived" ? (
                <>
                  Restaura la tarjeta en <a href="/admin/loyalty">Fidelidad</a>.
                </>
              ) : failure === "customer_missing" ? (
                <>
                  Esta tarjeta no aparece en el registro. Busca al cliente por
                  nombre en <a href="/admin/loyalty">Fidelidad</a>.
                </>
              ) : (
                <>
                  Abre la tarjeta actual del cliente y vuelve a escanear su QR.
                  También puedes buscarlo por nombre o código en{" "}
                  <a href="/admin/loyalty">Fidelidad</a>.
                </>
              )}
            </p>
          </div>
        ) : (
          <StampConfirm
            operationId={randomUUID()}
            id={id as string}
            token={token as string}
            name={customer.name}
            stamps={customer.stamps}
          />
        )}
      </div>
    </main>
  );
}
