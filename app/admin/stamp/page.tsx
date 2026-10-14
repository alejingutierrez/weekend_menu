import { verifyCustomerToken } from "@/lib/customer-token";
import { getCustomer } from "@/lib/loyalty-store";
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

  const valid = id && token && (await verifyCustomerToken(id, token));
  const customer = valid ? await getCustomer(id) : null;

  return (
    <main className="admin-shell">
      <div className="admin-card stamp-card">
        <nav className="admin-nav">
          <a href="/admin/loyalty">← Fidelidad</a>
        </nav>
        {!valid || !customer || customer.archivedAt ? (
          <div className="stamp-result">
            <div className="stamp-result-emoji">⚠️</div>
            <h2 className="stamp-result-title">{customer?.archivedAt ? "Tarjeta archivada" : "Código no válido"}</h2>
            <p className="stamp-result-sub">
              {customer?.archivedAt ? "Restaura la tarjeta en " : "Vuelve a escanear la tarjeta del cliente, o búscalo en "}
              <a href="/admin/loyalty">Fidelidad</a>.
            </p>
          </div>
        ) : (
          <StampConfirm
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
