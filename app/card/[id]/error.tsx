"use client";
export default function CardError({ reset }: { reset: () => void }) {
  return (
    <main className="lc-shell">
      <div className="lc-card">
        <h1>No podemos consultar tu tarjeta ahora</h1>
        <p>
          Intenta de nuevo en un momento. Conserva el código o tu pase de
          Wallet; en caja pueden ayudarte a recuperar la misma tarjeta y sus
          sellos.
        </p>
        <button className="lc-btn" onClick={() => reset()}>
          Volver a consultar
        </button>
      </div>
    </main>
  );
}
