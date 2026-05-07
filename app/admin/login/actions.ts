"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createSessionCookie } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/admin");

  const expectedUser = process.env.ADMIN_USER;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !expectedHash) {
    return { error: "Admin credentials are not configured on the server." };
  }

  if (username !== expectedUser) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const cookie = await createSessionCookie(username);
  const store = await cookies();
  store.set(cookie);

  // Only redirect to safe in-app paths.
  const redirectTo = from.startsWith("/admin") ? from : "/admin";
  redirect(redirectTo);
}
