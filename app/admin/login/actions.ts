"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createSessionCookie, configuredAdminHash } from "@/lib/auth";
import { enforceRequestLimits } from "@/lib/request-limits";

export type LoginState = { error?: string };

/**
 * Verifies a login against the env single admin (ADMIN_USER /
 * ADMIN_PASSWORD_HASH) plus any additional admins in ADMIN_USERS_B64
 * (base64 of JSON `[{ "u": username, "h": bcryptHash }]`).
 */
async function checkCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!username || !password) return false;

  const hash = configuredAdminHash(username);
  return hash ? bcrypt.compare(password, hash) : false;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/admin");
  if (username.length > 128 || password.length > 256)
    return { error: "Usuario o contraseña incorrectos." };
  try {
    await enforceRequestLimits("login", username);
  } catch {
    return {
      error:
        "No pudimos iniciar sesión ahora. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_USERS_B64) {
    return { error: "Admin credentials are not configured on the server." };
  }

  if (!(await checkCredentials(username, password))) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const cookie = await createSessionCookie(username);
  const store = await cookies();
  store.set(cookie);

  // Only redirect to safe in-app paths.
  const redirectTo = from.startsWith("/admin") ? from : "/admin";
  redirect(redirectTo);
}
