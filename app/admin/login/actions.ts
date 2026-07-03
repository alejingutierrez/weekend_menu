"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createSessionCookie } from "@/lib/auth";

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

  const envUser = process.env.ADMIN_USER;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  if (envUser && envHash && username === envUser) {
    return bcrypt.compare(password, envHash);
  }

  const b64 = process.env.ADMIN_USERS_B64;
  if (b64) {
    try {
      const list = JSON.parse(
        Buffer.from(b64, "base64").toString("utf8"),
      ) as Array<{ u: string; h: string }>;
      const found = list.find((a) => a.u === username);
      if (found) return bcrypt.compare(password, found.h);
    } catch {
      // malformed config → treat as no match
    }
  }
  return false;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/admin");

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
