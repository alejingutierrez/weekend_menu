"use server";

import { redirect } from "next/navigation";
import { createCustomer } from "@/lib/loyalty-store";
import { ExistingContactError, validateJoin } from "@/lib/loyalty-validation";

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
  if (!email && !phone)
    return { error: "Deja al menos un email o un teléfono." };
  if (email && !EMAIL_RE.test(email))
    return { error: "Ese email no parece válido." };

  let customer;
  try {
    validateJoin({ name, email, phone });
  } catch (e) {
    return { error: (e as Error).message };
  }
  try {
    customer = await createCustomer({ name, email, phone });
  } catch (e) {
    if (e instanceof ExistingContactError)
      return {
        error:
          "Estos datos necesitan revisión. Pide en caja que recuperen tu tarjeta y tus sellos.",
      };
    return {
      error:
        "No pudimos guardar la tarjeta ahora. Intenta de nuevo; si ya tenías una tarjeta, pide que la recuperen en caja.",
    };
  }

  // Outside try/catch on purpose: redirect() throws internally.
  redirect(`/card/${customer.id}`);
}
