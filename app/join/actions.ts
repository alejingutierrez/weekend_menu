"use server";

import { redirect } from "next/navigation";
import { createCustomer } from "@/lib/loyalty-store";

export type JoinState = { error?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function joinLoyalty(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) return { error: "Escribe tu nombre." };
  if (!email && !phone) return { error: "Deja al menos un email o un teléfono." };
  if (email && !EMAIL_RE.test(email)) return { error: "Ese email no parece válido." };

  const customer = await createCustomer({
    name,
    email: email || undefined,
    phone: phone || undefined,
  });

  // Outside try/catch on purpose: redirect() throws internally.
  redirect(`/card/${customer.id}`);
}
