"use client";

import { useActionState } from "react";
import type { Menu } from "@/lib/menu-types";
import { logout, saveMenu, type SaveState } from "./actions";

const initial: SaveState = {};

export function EditorForm({ menu }: { menu: Menu }) {
  const [state, formAction, pending] = useActionState(saveMenu, initial);

  return (
    <>
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Editor del menú</h1>
          <p className="admin-subtitle">
            Cambiá precios y descripciones. Al guardar se actualiza la página
            pública.
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className="admin-link-btn">
            Cerrar sesión
          </button>
        </form>
      </header>

      <form action={formAction} className="admin-form admin-form-wide">
        <section className="admin-section">
          <h2>Tagline</h2>
          <textarea
            name="tagline"
            defaultValue={menu.tagline}
            rows={2}
            className="admin-textarea"
          />
        </section>

        <section className="admin-section">
          <h2>Burgers</h2>
          {menu.burgers.map((b, i) => (
            <fieldset key={b.name} className="admin-fieldset">
              <legend>{b.name}</legend>
              <label className="admin-field">
                <span>Descripción</span>
                <textarea
                  name={`burgers.${i}.desc`}
                  defaultValue={b.desc}
                  rows={3}
                  className="admin-textarea"
                />
              </label>
              <div className="admin-row">
                {b.tiers.map((t, j) => (
                  <label key={t.label} className="admin-field admin-field-narrow">
                    <span>{t.label}</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      name={`burgers.${i}.tiers.${j}.price`}
                      defaultValue={t.price}
                      className="admin-input"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="admin-section">
          <h2>Fries</h2>
          <fieldset className="admin-fieldset">
            <legend>{menu.fries.name}</legend>
            <label className="admin-field">
              <span>Descripción</span>
              <textarea
                name="fries.desc"
                defaultValue={menu.fries.desc}
                rows={2}
                className="admin-textarea"
              />
            </label>
            <div className="admin-row">
              {menu.fries.tiers.map((t, j) => (
                <label key={t.label} className="admin-field admin-field-narrow">
                  <span>{t.label}</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    name={`fries.tiers.${j}.price`}
                    defaultValue={t.price}
                    className="admin-input"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="admin-section">
          <h2>Postres</h2>
          {menu.postres.map((p, i) => (
            <fieldset key={p.name} className="admin-fieldset">
              <legend>{p.name}</legend>
              <label className="admin-field">
                <span>Descripción</span>
                <textarea
                  name={`postres.${i}.desc`}
                  defaultValue={p.desc}
                  rows={2}
                  className="admin-textarea"
                />
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  name={`postres.${i}.available`}
                  defaultChecked={p.badge !== "PRONTO"}
                />
                <span>Disponible (sin badge PRONTO)</span>
              </label>
            </fieldset>
          ))}
        </section>

        <section className="admin-section">
          <h2>Bebidas</h2>
          {menu.bebidas.map((sec, i) => (
            <fieldset key={sec.title} className="admin-fieldset">
              <legend>{sec.title}</legend>
              {sec.items.map((it, j) => (
                <div key={it.name} className="admin-row admin-row-stack">
                  <div className="admin-row-name">{it.name}</div>
                  {it.desc !== undefined && (
                    <label className="admin-field admin-field-grow">
                      <span>Descripción</span>
                      <textarea
                        name={`bebidas.${i}.items.${j}.desc`}
                        defaultValue={it.desc}
                        rows={2}
                        className="admin-textarea"
                      />
                    </label>
                  )}
                  {it.price !== undefined && (
                    <label className="admin-field admin-field-narrow">
                      <span>Precio</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        name={`bebidas.${i}.items.${j}.price`}
                        defaultValue={it.price}
                        className="admin-input"
                      />
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
          ))}
        </section>

        <section className="admin-section">
          <h2>Adiciones</h2>
          <div className="admin-grid">
            {menu.adiciones.map((a, i) => (
              <label key={a.name} className="admin-field">
                <span>{a.name}</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  name={`adiciones.${i}.price`}
                  defaultValue={a.price}
                  className="admin-input"
                />
              </label>
            ))}
          </div>
          <label className="admin-field admin-field-narrow">
            <span>
              {menu.adicionesHighlight.name} {menu.adicionesHighlight.sub}
            </span>
            <input
              type="number"
              step="0.5"
              min="0"
              name="adicionesHighlight.price"
              defaultValue={menu.adicionesHighlight.price}
              className="admin-input"
            />
          </label>
        </section>

        <div className="admin-actions">
          <button type="submit" className="admin-btn" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
          {state.ok && (
            <span className="admin-success">Guardado ✓</span>
          )}
          {state.error && <span className="admin-error">{state.error}</span>}
        </div>
      </form>
    </>
  );
}
