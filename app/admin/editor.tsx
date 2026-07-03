"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  Adicion,
  BebidaItem,
  Burger,
  Menu,
  Postre,
  PriceTier,
} from "@/lib/menu-types";
import { logout, saveMenu } from "./actions";

const NEW_BURGER_TIERS: PriceTier[] = [
  { label: "sola", sub: "burger sola", price: 0, pillStyle: "blue", labelColor: "red" },
  { label: "con papas", sub: "burger + papas", price: 0, pillStyle: "red", labelColor: "red" },
  { label: "combo", sub: "burger+papas + bebida.", price: 0, pillStyle: "blue-deep", labelColor: "blue" },
];

const newBurger = (): Burger => ({
  name: "Nuevo burger",
  desc: "",
  tiers: NEW_BURGER_TIERS.map((t) => ({ ...t })),
});

const newSeasonalBurger = (): Burger => ({
  name: "Nueva de temporada",
  desc: "",
  tiers: NEW_BURGER_TIERS.map((t) => ({ ...t })),
});

const DEFAULT_TEMPORADA_NAME = "Hamburguesas de temporada";

const newPostre = (): Postre => ({ name: "Nuevo postre", desc: "" });

const newBebidaItem = (): BebidaItem => ({ name: "Nueva bebida", price: 0 });

const newAdicion = (): Adicion => ({ name: "Nueva adición", price: 0 });

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export function EditorForm({ initialMenu }: { initialMenu: Menu }) {
  const [menu, setMenu] = useState<Menu>(initialMenu);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);

  // Mark dirty whenever the menu drifts from the initial.
  useEffect(() => {
    setDirty(JSON.stringify(menu) !== JSON.stringify(initialMenu));
  }, [menu, initialMenu]);

  // Warn on navigation if there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const handleSave = () => {
    setStatus({ kind: "saving" });
    startTransition(async () => {
      try {
        const result = await saveMenu(menu);
        if (result.ok) {
          setStatus({ kind: "saved", at: result.savedAt });
          setDirty(false);
        } else {
          setStatus({ kind: "error", message: result.error });
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Error al guardar.",
        });
      }
    });
  };

  const confirmRemove = (label: string) =>
    window.confirm(`¿Eliminar "${label}"? Recordá guardar para confirmar.`);

  // ---- Tagline ----
  const setTagline = (tagline: string) => setMenu((m) => ({ ...m, tagline }));

  // ---- Burgers ----
  const updateBurger = (i: number, patch: Partial<Burger>) =>
    setMenu((m) => ({
      ...m,
      burgers: m.burgers.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));
  const updateBurgerTier = (bi: number, ti: number, price: number) =>
    setMenu((m) => ({
      ...m,
      burgers: m.burgers.map((b, idx) =>
        idx === bi
          ? {
              ...b,
              tiers: b.tiers.map((t, tidx) =>
                tidx === ti ? { ...t, price } : t,
              ),
            }
          : b,
      ),
    }));
  const addBurger = () =>
    setMenu((m) => ({ ...m, burgers: [...m.burgers, newBurger()] }));
  const removeBurger = (i: number) => {
    if (!confirmRemove(menu.burgers[i].name)) return;
    setMenu((m) => ({
      ...m,
      burgers: m.burgers.filter((_, idx) => idx !== i),
    }));
  };

  // ---- Postres ----
  const updatePostre = (i: number, patch: Partial<Postre>) =>
    setMenu((m) => ({
      ...m,
      postres: m.postres.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  const addPostre = () =>
    setMenu((m) => ({ ...m, postres: [...m.postres, newPostre()] }));
  const removePostre = (i: number) => {
    if (!confirmRemove(menu.postres[i].name)) return;
    setMenu((m) => ({
      ...m,
      postres: m.postres.filter((_, idx) => idx !== i),
    }));
  };

  // ---- Bebidas ----
  const updateBebidaItem = (
    si: number,
    ii: number,
    patch: Partial<BebidaItem>,
  ) =>
    setMenu((m) => ({
      ...m,
      bebidas: m.bebidas.map((sec, sidx) =>
        sidx === si
          ? {
              ...sec,
              items: sec.items.map((it, iidx) =>
                iidx === ii ? { ...it, ...patch } : it,
              ),
            }
          : sec,
      ),
    }));
  const addBebidaItem = (si: number) =>
    setMenu((m) => ({
      ...m,
      bebidas: m.bebidas.map((sec, sidx) =>
        sidx === si ? { ...sec, items: [...sec.items, newBebidaItem()] } : sec,
      ),
    }));
  const removeBebidaItem = (si: number, ii: number) => {
    if (!confirmRemove(menu.bebidas[si].items[ii].name)) return;
    setMenu((m) => ({
      ...m,
      bebidas: m.bebidas.map((sec, sidx) =>
        sidx === si
          ? { ...sec, items: sec.items.filter((_, iidx) => iidx !== ii) }
          : sec,
      ),
    }));
  };

  // ---- Adiciones ----
  const updateAdicion = (i: number, patch: Partial<Adicion>) =>
    setMenu((m) => ({
      ...m,
      adiciones: m.adiciones.map((a, idx) =>
        idx === i ? { ...a, ...patch } : a,
      ),
    }));
  const addAdicion = () =>
    setMenu((m) => ({ ...m, adiciones: [...m.adiciones, newAdicion()] }));
  const removeAdicion = (i: number) => {
    if (!confirmRemove(menu.adiciones[i].name)) return;
    setMenu((m) => ({
      ...m,
      adiciones: m.adiciones.filter((_, idx) => idx !== i),
    }));
  };

  // ---- Fries ----
  const updateFries = (patch: Partial<Menu["fries"]>) =>
    setMenu((m) => ({ ...m, fries: { ...m.fries, ...patch } }));
  const updateFriesTier = (ti: number, price: number) =>
    setMenu((m) => ({
      ...m,
      fries: {
        ...m.fries,
        tiers: m.fries.tiers.map((t, idx) =>
          idx === ti ? { ...t, price } : t,
        ),
      },
    }));

  // ---- Temporada (seasonal burgers) ----
  const temporada = menu.temporada ?? { name: DEFAULT_TEMPORADA_NAME, burgers: [] };
  const withTemporada = (
    m: Menu,
    fn: (t: NonNullable<Menu["temporada"]>) => NonNullable<Menu["temporada"]>,
  ): Menu => ({
    ...m,
    temporada: fn(m.temporada ?? { name: DEFAULT_TEMPORADA_NAME, burgers: [] }),
  });
  const updateTemporadaName = (name: string) =>
    setMenu((m) => withTemporada(m, (t) => ({ ...t, name })));
  const updateSeasonalBurger = (i: number, patch: Partial<Burger>) =>
    setMenu((m) =>
      withTemporada(m, (t) => ({
        ...t,
        burgers: t.burgers.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
      })),
    );
  const updateSeasonalBurgerTier = (bi: number, ti: number, price: number) =>
    setMenu((m) =>
      withTemporada(m, (t) => ({
        ...t,
        burgers: t.burgers.map((b, idx) =>
          idx === bi
            ? {
                ...b,
                tiers: b.tiers.map((tt, tidx) =>
                  tidx === ti ? { ...tt, price } : tt,
                ),
              }
            : b,
        ),
      })),
    );
  const addSeasonalBurger = () =>
    setMenu((m) =>
      withTemporada(m, (t) => ({ ...t, burgers: [...t.burgers, newSeasonalBurger()] })),
    );
  const removeSeasonalBurger = (i: number) => {
    if (!confirmRemove(temporada.burgers[i]?.name ?? "")) return;
    setMenu((m) =>
      withTemporada(m, (t) => ({
        ...t,
        burgers: t.burgers.filter((_, idx) => idx !== i),
      })),
    );
  };

  // ---- Highlight (upgrade row) ----
  const updateHighlight = (patch: Partial<Menu["adicionesHighlight"]>) =>
    setMenu((m) => ({
      ...m,
      adicionesHighlight: { ...m.adicionesHighlight, ...patch },
    }));

  return (
    <>
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Editor del menú</h1>
          <p className="admin-subtitle">
            Cambiá precios, agregá o eliminá productos. Al guardar se actualiza
            la página pública.
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className="admin-link-btn">
            Cerrar sesión
          </button>
        </form>
      </header>

      <div className="admin-form-wide">
        {/* Tagline */}
        <Section title="Tagline">
          <textarea
            className="admin-textarea"
            rows={2}
            value={menu.tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </Section>

        {/* Burgers */}
        <Section title="Burgers">
          {menu.burgers.map((b, i) => (
            <ItemCard
              key={i}
              title={b.name || "Sin nombre"}
              onRemove={() => removeBurger(i)}
            >
              <BurgerFields
                burger={b}
                onChange={(patch) => updateBurger(i, patch)}
                onTierPrice={(j, price) => updateBurgerTier(i, j, price)}
              />
            </ItemCard>
          ))}
          <AddButton onClick={addBurger}>+ Agregar burger</AddButton>
        </Section>

        {/* Fries */}
        <Section title="Fries">
          <ItemCard title={menu.fries.name}>
            <Field label="Nombre">
              <input
                className="admin-input"
                value={menu.fries.name}
                onChange={(e) => updateFries({ name: e.target.value })}
              />
            </Field>
            <Field label="Descripción">
              <textarea
                className="admin-textarea"
                rows={2}
                value={menu.fries.desc}
                onChange={(e) => updateFries({ desc: e.target.value })}
              />
            </Field>
            <div className="admin-row admin-row-tight">
              {menu.fries.tiers.map((t, j) => (
                <Field key={j} label={t.label} narrow>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="admin-input"
                    value={t.price}
                    onChange={(e) =>
                      updateFriesTier(j, Number(e.target.value))
                    }
                  />
                </Field>
              ))}
            </div>
          </ItemCard>
        </Section>

        {/* Temporada (seasonal burgers) */}
        <Section title="Hamburguesas de temporada">
          <Field label="Título de la sección">
            <input
              className="admin-input"
              value={temporada.name}
              onChange={(e) => updateTemporadaName(e.target.value)}
            />
          </Field>
          {temporada.burgers.map((b, i) => (
            <ItemCard
              key={i}
              title={b.name || "Sin nombre"}
              onRemove={() => removeSeasonalBurger(i)}
            >
              <BurgerFields
                burger={b}
                onChange={(patch) => updateSeasonalBurger(i, patch)}
                onTierPrice={(j, price) => updateSeasonalBurgerTier(i, j, price)}
              />
            </ItemCard>
          ))}
          <AddButton onClick={addSeasonalBurger}>
            + Agregar hamburguesa de temporada
          </AddButton>
        </Section>

        {/* Postres */}
        <Section title="Postres">
          {menu.postres.map((p, i) => (
            <ItemCard
              key={i}
              title={p.name || "Sin nombre"}
              onRemove={() => removePostre(i)}
            >
              <Field label="Nombre">
                <input
                  className="admin-input"
                  value={p.name}
                  onChange={(e) => updatePostre(i, { name: e.target.value })}
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={p.desc}
                  onChange={(e) => updatePostre(i, { desc: e.target.value })}
                />
              </Field>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={p.badge !== "PRONTO"}
                  onChange={(e) =>
                    updatePostre(i, {
                      badge: e.target.checked ? undefined : "PRONTO",
                    })
                  }
                />
                <span>Disponible (sin badge PRONTO)</span>
              </label>
            </ItemCard>
          ))}
          <AddButton onClick={addPostre}>+ Agregar postre</AddButton>
        </Section>

        {/* Bebidas */}
        <Section title="Bebidas">
          {menu.bebidas.map((sec, si) => (
            <div key={si} className="admin-subsection">
              <h3 className="admin-subsection-title">
                {sec.title}
                {sec.suffix && (
                  <span className="admin-subsection-suffix"> {sec.suffix}</span>
                )}
              </h3>
              {sec.items.map((it, ii) => (
                <ItemCard
                  key={ii}
                  title={it.name || "Sin nombre"}
                  onRemove={() => removeBebidaItem(si, ii)}
                  compact
                >
                  <Field label="Nombre">
                    <input
                      className="admin-input"
                      value={it.name}
                      onChange={(e) =>
                        updateBebidaItem(si, ii, { name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Descripción (opcional)">
                    <textarea
                      className="admin-textarea"
                      rows={2}
                      value={it.desc ?? ""}
                      onChange={(e) =>
                        updateBebidaItem(si, ii, {
                          desc: e.target.value || undefined,
                        })
                      }
                    />
                  </Field>
                  <Field label="Precio" narrow>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="admin-input"
                      value={it.price ?? 0}
                      onChange={(e) =>
                        updateBebidaItem(si, ii, {
                          price: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </ItemCard>
              ))}
              <AddButton onClick={() => addBebidaItem(si)}>
                + Agregar a {sec.title}
              </AddButton>
            </div>
          ))}
        </Section>

        {/* Adiciones */}
        <Section title="Adiciones">
          <div className="admin-grid">
            {menu.adiciones.map((a, i) => (
              <div key={i} className="admin-grid-item">
                <button
                  type="button"
                  aria-label={`Eliminar ${a.name}`}
                  className="admin-delete admin-delete-inline"
                  onClick={() => removeAdicion(i)}
                >
                  ×
                </button>
                <Field label="Nombre">
                  <input
                    className="admin-input"
                    value={a.name}
                    onChange={(e) =>
                      updateAdicion(i, { name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Precio" narrow>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="admin-input"
                    value={a.price}
                    onChange={(e) =>
                      updateAdicion(i, { price: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
          <AddButton onClick={addAdicion}>+ Agregar adición</AddButton>

          <ItemCard title="Upgrade (highlight row)">
            <Field label="Texto">
              <input
                className="admin-input"
                value={menu.adicionesHighlight.name}
                onChange={(e) => updateHighlight({ name: e.target.value })}
              />
            </Field>
            <Field label="Sub-texto">
              <input
                className="admin-input"
                value={menu.adicionesHighlight.sub}
                onChange={(e) => updateHighlight({ sub: e.target.value })}
              />
            </Field>
            <Field label="Precio" narrow>
              <input
                type="number"
                step="0.5"
                min="0"
                className="admin-input"
                value={menu.adicionesHighlight.price}
                onChange={(e) =>
                  updateHighlight({ price: Number(e.target.value) })
                }
              />
            </Field>
          </ItemCard>
        </Section>
      </div>

      {/* Sticky save bar */}
      <div className="admin-savebar">
        <SaveStatus status={status} dirty={dirty} pending={pending} />
        <button
          type="button"
          className="admin-btn"
          disabled={pending || !dirty}
          onClick={handleSave}
        >
          {pending ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
        </button>
      </div>
    </>
  );
}

/* ============================================================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ItemCard({
  title,
  children,
  onRemove,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  onRemove?: () => void;
  compact?: boolean;
}) {
  return (
    <fieldset className={`admin-fieldset${compact ? " admin-fieldset-compact" : ""}`}>
      <legend>{title}</legend>
      {onRemove && (
        <button
          type="button"
          aria-label={`Eliminar ${title}`}
          className="admin-delete"
          onClick={onRemove}
        >
          ×
        </button>
      )}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  children,
  narrow = false,
}: {
  label: string;
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <label className={`admin-field${narrow ? " admin-field-narrow" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="admin-add" onClick={onClick}>
      {children}
    </button>
  );
}

/** Name + description + icons + price tiers — shared by Burgers and Temporada. */
function BurgerFields({
  burger,
  onChange,
  onTierPrice,
}: {
  burger: Burger;
  onChange: (patch: Partial<Burger>) => void;
  onTierPrice: (tierIndex: number, price: number) => void;
}) {
  return (
    <>
      <Field label="Nombre">
        <input
          className="admin-input"
          value={burger.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="Descripción">
        <textarea
          className="admin-textarea"
          rows={3}
          value={burger.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
        />
      </Field>
      <Field label="Iconos (emoji libres)">
        <input
          className="admin-input"
          placeholder="ej: 🌶️🌶️ o 🌱"
          value={burger.icons ?? ""}
          onChange={(e) => onChange({ icons: e.target.value || undefined })}
        />
      </Field>
      <div className="admin-row admin-row-tight">
        {burger.tiers.map((t, j) => (
          <Field key={j} label={t.label || `Tier ${j + 1}`} narrow>
            <input
              type="number"
              step="0.5"
              min="0"
              className="admin-input"
              value={t.price}
              onChange={(e) => onTierPrice(j, Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
    </>
  );
}

function SaveStatus({
  status,
  dirty,
  pending,
}: {
  status: Status;
  dirty: boolean;
  pending: boolean;
}) {
  if (pending) return <span className="admin-saving">Guardando…</span>;
  if (status.kind === "error") {
    return <span className="admin-error">{status.message}</span>;
  }
  if (status.kind === "saved" && !dirty) {
    return <span className="admin-success">Guardado ✓</span>;
  }
  if (dirty) {
    return <span className="admin-dirty">Hay cambios sin guardar</span>;
  }
  return <span className="admin-muted">Todo al día</span>;
}
