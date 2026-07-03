"use client";

import { useActionState } from "react";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { confirmStamp, type StampState } from "./actions";

const initial: StampState = {};

export function StampConfirm({
  id,
  token,
  name,
  stamps,
}: {
  id: string;
  token: string;
  name: string;
  stamps: number;
}) {
  const [state, formAction, pending] = useActionState(confirmStamp, initial);

  if (state.ok) {
    return (
      <div className="stamp-result">
        {state.rewardEarned ? (
          <>
            <div className="stamp-result-emoji">🎉🍔</div>
            <h2 className="stamp-result-title reward">¡Premio!</h2>
            <p className="stamp-result-sub">
              {state.name} completó los {STAMPS_PER_REWARD} sellos.
              <br />
              <strong>Una hamburguesa gratis.</strong>
            </p>
          </>
        ) : (
          <>
            <div className="stamp-result-emoji">✅</div>
            <h2 className="stamp-result-title">Sello puesto</h2>
            <p className="stamp-result-sub">
              {state.name}: <strong>{state.stamps}/{STAMPS_PER_REWARD}</strong> sellos
            </p>
          </>
        )}
        <a className="lyl-btn primary stamp-done" href="/admin/loyalty">
          Listo
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="stamp-confirm">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="t" value={token} />
      <p className="stamp-customer">{name}</p>
      <p className="stamp-progress">
        {stamps}/{STAMPS_PER_REWARD} sellos
      </p>
      {state.error && <p className="admin-error">{state.error}</p>}
      <button type="submit" className="stamp-big-btn" disabled={pending}>
        {pending ? "Poniendo sello…" : "Poner sello 🍔"}
      </button>
    </form>
  );
}
