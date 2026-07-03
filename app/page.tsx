/**
 * Weekend Burger — Menu page (visual replica of Menú-Week.pdf).
 *
 * Reads menu data from `data/menu.json` via `lib/menu-store`.
 * The admin (`/admin`) writes back to the same file and calls
 * `revalidatePath('/')` so the public page picks up changes.
 */

import { readMenu } from "@/lib/menu-store";
import type { PriceTier } from "@/lib/menu-types";
import { PeaceHand } from "./peace-hand";

export const dynamic = "force-dynamic";

/* ============================================================ */

function fmtPrice(n: number): string {
  // Show "3.5" not "3.50"; keep decimals only when present.
  return Number.isInteger(n) ? String(n) : String(n);
}

function PriceCell({ tier }: { tier: PriceTier }) {
  return (
    <div className="price-cell">
      <span className={`price-cell-label ${tier.labelColor}`}>{tier.label}</span>
      <span className="price-cell-sub">{tier.sub}</span>
      <span className={`price-pill ${tier.pillStyle}`}>{fmtPrice(tier.price)}</span>
    </div>
  );
}

/* ============================================================ */

export default async function MenuPage() {
  const menu = await readMenu();
  const seasonal = menu.temporada;
  const showSeasonal = Boolean(seasonal && seasonal.burgers.length > 0);
  return (
    <main className={`page${showSeasonal ? " has-temporada" : ""}`}>
      {/* Hero */}
      <header className="hero">
        <div className="hero-logo">
          <h1>weekend</h1>
        </div>
      </header>

      {/* Tagline (red banner) */}
      <section className="tagline" data-area="tagline" aria-label="Frase de bienvenida">
        <span className="tagline-text">{menu.tagline}</span>
        <span className="tagline-star" aria-hidden="true">✦</span>
      </section>

      {/* Burgers */}
      <section className="card" data-area="burgers" aria-labelledby="burgers-title">
        <h2 id="burgers-title" className="card-title red">Burgers</h2>
        {menu.burgers.map((b) => (
          <article key={b.name} className="item">
            <h3 className="item-name red">
              {b.name}
              {b.icons && (
                <span className="item-icon" aria-hidden="true">{b.icons}</span>
              )}
            </h3>
            <p className="item-desc">{b.desc}</p>
            <div className="price-row">
              {b.tiers.map((t) => (
                <PriceCell key={t.label} tier={t} />
              ))}
            </div>
          </article>
        ))}
      </section>

      {/* Fries */}
      <section className="card" data-area="fries" aria-labelledby="fries-title">
        <h2 id="fries-title" className="card-title blue">fries</h2>
        <article className="item">
          <h3 className="item-name blue">{menu.fries.name}</h3>
          <p className="item-desc">{menu.fries.desc}</p>
          <div className="price-row two-col">
            {menu.fries.tiers.map((t) => (
              <PriceCell key={t.label} tier={t} />
            ))}
          </div>
        </article>
      </section>

      {/* Hamburguesas de temporada */}
      {seasonal && seasonal.burgers.length > 0 && (
        <section
          className="card temporada-card"
          data-area="temporada"
          aria-labelledby="temporada-title"
        >
          <span className="temporada-badge">Nuevo</span>
          <h2 id="temporada-title" className="card-title red">
            {seasonal.name}
          </h2>
          {seasonal.burgers.map((b) => (
            <article key={b.name} className="item">
              <h3 className="item-name red">
                {b.name}
                {b.icons && (
                  <span className="item-icon" aria-hidden="true">{b.icons}</span>
                )}
              </h3>
              <p className="item-desc">{b.desc}</p>
              <div className="price-row">
                {b.tiers.map((t) => (
                  <PriceCell key={t.label} tier={t} />
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Postres */}
      <section className="card" data-area="postres" aria-labelledby="postres-title">
        <h2 id="postres-title" className="card-title blue">Postres</h2>
        {menu.postres.map((p) => (
          <article key={p.name} className="item">
            <h3 className="item-name blue">{p.name}</h3>
            <p className="item-desc">{p.desc}</p>
            {p.badge === "PRONTO" && <span className="pronto-badge">PRONTO</span>}
          </article>
        ))}
      </section>

      {/* Bebidas */}
      <section className="card" data-area="bebidas" aria-labelledby="bebidas-title">
        <h2 id="bebidas-title" className="card-title blue">Bebidas</h2>
        {menu.bebidas.map((sub) => (
          <div key={sub.title} className="subsection">
            <h3 className="subsection-title">
              {sub.title}
              {sub.suffix && <span className="subsection-title-suffix">{sub.suffix}</span>}
            </h3>
            {sub.items.map((it) => (
              <div key={it.name} className="list-row">
                <div className="list-row-text">
                  <div className="list-row-name">{it.name}</div>
                  {it.desc && <div className="list-row-desc">{it.desc}</div>}
                </div>
                {typeof it.price === "number" && (
                  <span className="list-row-pill">{fmtPrice(it.price)}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Adiciones */}
      <section className="card" data-area="adiciones" aria-labelledby="adiciones-title">
        <h2 id="adiciones-title" className="card-title red">Adiciones</h2>
        {menu.adiciones.map((it) => (
          <div key={it.name} className="list-row">
            <div className="list-row-text">
              <div className="list-row-name">{it.name}</div>
            </div>
            <span className="list-row-pill">{fmtPrice(it.price)}</span>
          </div>
        ))}

        {/* Highlighted upgrade row */}
        <div className="highlight-row">
          <div className="highlight-row-text">
            <div className="highlight-row-name">
              {menu.adicionesHighlight.name}{" "}
              <span style={{ fontWeight: 500, opacity: 0.9 }}>
                {menu.adicionesHighlight.sub}
              </span>
            </div>
          </div>
          <span className="highlight-row-pill">{fmtPrice(menu.adicionesHighlight.price)}</span>
        </div>
      </section>

      {/* Weekend Club — loyalty registration CTA */}
      <section className="card loyalty-cta" data-area="loyalty" aria-labelledby="loyalty-title">
        <span className="loyalty-badge">NUEVO</span>
        <h2 id="loyalty-title" className="card-title red">Weekend Club</h2>
        <p className="loyalty-lead">
          Tu tarjeta de sellos digital. Cada burger suma un sello y al llegar a{" "}
          <strong>10</strong>, la siguiente es <strong>gratis</strong>.
        </p>
        <div className="loyalty-stamps-preview" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`loyalty-dot${i < 3 ? " on" : ""}`}>
              {i < 3 ? "🍔" : ""}
            </span>
          ))}
        </div>
        <a className="loyalty-cta-btn" href="/join">Crear mi tarjeta gratis</a>
        <p className="loyalty-fine">Guárdala en Apple Wallet o en tu teléfono.</p>
      </section>

      <footer className="footer">
        <p>Hecho con <span className="heart">♥</span> en Weekend Burger</p>
      </footer>

      {/* Floating mascot — drifts on its own, draggable */}
      <PeaceHand />
    </main>
  );
}
