"use client";

import { useActionState } from "react";
import { joinLoyalty, type JoinState } from "./actions";

const initial: JoinState = {};

export function JoinForm() {
  const [state, formAction, pending] = useActionState(joinLoyalty, initial);
  return (
    <form action={formAction} className="lc-form">
      <label className="lc-field">
        <span>Nombre</span>
        <input name="name" type="text" autoComplete="name" required autoFocus />
      </label>
      <label className="lc-field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@email.com" />
      </label>
      <label className="lc-field">
        <span>Teléfono</span>
        <input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="Opcional" />
      </label>
      <p className="lc-hint">Con email o teléfono basta — lo usamos para no perder tus sellos.</p>
      {state.error && <p className="lc-error">{state.error}</p>}
      <button type="submit" disabled={pending} className="lc-btn">
        {pending ? "Creando tu tarjeta…" : "Crear mi tarjeta 🍔"}
      </button>
    </form>
  );
}
