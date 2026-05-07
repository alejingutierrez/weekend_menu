"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readMenu, writeMenu } from "@/lib/menu-store";
import { clearedSessionCookie } from "@/lib/auth";
import type { Menu } from "@/lib/menu-types";

export type SaveState = { ok?: boolean; error?: string; savedAt?: number };

function num(formData: FormData, name: string, fallback: number): number {
  const raw = formData.get(name);
  if (raw == null) return fallback;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function str(formData: FormData, name: string, fallback: string): string {
  const raw = formData.get(name);
  return raw == null ? fallback : String(raw);
}

export async function saveMenu(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  try {
    const current = await readMenu();
    const updated: Menu = {
      tagline: str(formData, "tagline", current.tagline),
      burgers: current.burgers.map((b, i) => ({
        ...b,
        desc: str(formData, `burgers.${i}.desc`, b.desc),
        tiers: b.tiers.map((t, j) => ({
          ...t,
          price: num(formData, `burgers.${i}.tiers.${j}.price`, t.price),
        })),
      })),
      fries: {
        ...current.fries,
        desc: str(formData, "fries.desc", current.fries.desc),
        tiers: current.fries.tiers.map((t, j) => ({
          ...t,
          price: num(formData, `fries.tiers.${j}.price`, t.price),
        })),
      },
      postres: current.postres.map((p, i) => {
        const available = formData.get(`postres.${i}.available`) === "on";
        return {
          ...p,
          desc: str(formData, `postres.${i}.desc`, p.desc),
          ...(available ? { badge: undefined } : { badge: "PRONTO" as const }),
        };
      }),
      bebidas: current.bebidas.map((sec, i) => ({
        ...sec,
        items: sec.items.map((it, j) => {
          const baseName = `bebidas.${i}.items.${j}`;
          const newPrice = num(formData, `${baseName}.price`, it.price ?? 0);
          return {
            ...it,
            desc: it.desc !== undefined
              ? str(formData, `${baseName}.desc`, it.desc)
              : it.desc,
            price: it.price !== undefined ? newPrice : it.price,
          };
        }),
      })),
      adiciones: current.adiciones.map((a, i) => ({
        ...a,
        price: num(formData, `adiciones.${i}.price`, a.price),
      })),
      adicionesHighlight: {
        ...current.adicionesHighlight,
        price: num(
          formData,
          "adicionesHighlight.price",
          current.adicionesHighlight.price,
        ),
      },
    };

    await writeMenu(updated);
    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true, savedAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar." };
  }
}

export async function logout() {
  const store = await cookies();
  store.set(clearedSessionCookie());
  redirect("/admin/login");
}
