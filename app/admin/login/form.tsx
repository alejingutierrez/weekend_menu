"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ from }: { from: string }) {
  const [state, formAction, pending] = useActionState(login, initial);
  return (
    <form action={formAction} className="admin-form">
      <input type="hidden" name="from" value={from} />
      <label className="admin-field">
        <span>Usuario</span>
        <input
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
        />
      </label>
      <label className="admin-field">
        <span>Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error && <p className="admin-error">{state.error}</p>}
      <button type="submit" disabled={pending} className="admin-btn">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
