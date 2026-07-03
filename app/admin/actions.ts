"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeMenu } from "@/lib/menu-store";
import { clearedSessionCookie } from "@/lib/auth";
import type { Menu } from "@/lib/menu-types";

export type SaveResult =
  | { ok: true; savedAt: number }
  | { ok: false; error: string };

const PILL_STYLES = [
  "red",
  "red-soft",
  "blue",
  "blue-deep",
  "blue-soft",
] as const;
const LABEL_COLORS = ["red", "blue"] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

type ValidationResult =
  | { ok: true; menu: Menu }
  | { ok: false; error: string };

/**
 * Light-touch validation. The admin is single-user with a strong
 * password so this is mostly to keep a malformed submission from
 * breaking the public renderer — not an adversarial boundary.
 */
function validateMenu(input: unknown): ValidationResult {
  if (!isObj(input)) return { ok: false, error: "Cuerpo inválido." };

  if (typeof input.tagline !== "string") {
    return { ok: false, error: "Tagline inválido." };
  }
  if (!Array.isArray(input.burgers)) {
    return { ok: false, error: "Burgers inválidos." };
  }
  if (!isObj(input.fries)) {
    return { ok: false, error: "Fries inválidos." };
  }
  if (!Array.isArray(input.postres)) {
    return { ok: false, error: "Postres inválidos." };
  }
  if (!Array.isArray(input.bebidas)) {
    return { ok: false, error: "Bebidas inválidas." };
  }
  if (!Array.isArray(input.adiciones)) {
    return { ok: false, error: "Adiciones inválidas." };
  }
  if (!isObj(input.adicionesHighlight)) {
    return { ok: false, error: "Highlight inválido." };
  }

  // Coerce to the canonical shape, dropping unknown fields.
  const tier = (t: unknown) => {
    const o = isObj(t) ? t : {};
    const pill = PILL_STYLES.includes(o.pillStyle as (typeof PILL_STYLES)[number])
      ? (o.pillStyle as (typeof PILL_STYLES)[number])
      : "blue";
    const label = LABEL_COLORS.includes(o.labelColor as (typeof LABEL_COLORS)[number])
      ? (o.labelColor as (typeof LABEL_COLORS)[number])
      : "red";
    return {
      label: asString(o.label),
      sub: asString(o.sub),
      price: asNumber(o.price),
      pillStyle: pill,
      labelColor: label,
    };
  };

  const burgerOf = (b: unknown): Menu["burgers"][number] => {
    const o = isObj(b) ? b : {};
    const tiers = Array.isArray(o.tiers) ? o.tiers.map(tier) : [];
    const icons =
      typeof o.icons === "string"
        ? o.icons
        : Array.isArray(o.icons)
          ? (o.icons as unknown[]).map(String).join("")
          : undefined;
    return {
      name: asString(o.name, "Burger"),
      desc: asString(o.desc),
      ...(icons ? { icons } : {}),
      tiers,
    };
  };

  // Seasonal section is optional; persist it (even empty) whenever the
  // client sends an object, so a cleared section isn't re-seeded on read.
  const temporada = isObj(input.temporada)
    ? {
        name: asString(input.temporada.name, "Hamburguesas de temporada"),
        burgers: Array.isArray(input.temporada.burgers)
          ? input.temporada.burgers.map(burgerOf)
          : [],
      }
    : undefined;

  const menu: Menu = {
    tagline: input.tagline,
    burgers: input.burgers.map(burgerOf),
    fries: {
      name: asString((input.fries as Record<string, unknown>).name, "Fries"),
      desc: asString((input.fries as Record<string, unknown>).desc),
      tiers: Array.isArray((input.fries as Record<string, unknown>).tiers)
        ? ((input.fries as Record<string, unknown>).tiers as unknown[]).map(tier)
        : [],
    },
    ...(temporada ? { temporada } : {}),
    postres: input.postres.map((p) => {
      const o = isObj(p) ? p : {};
      const out: Menu["postres"][number] = {
        name: asString(o.name, "Postre"),
        desc: asString(o.desc),
      };
      if (o.badge === "PRONTO") out.badge = "PRONTO";
      return out;
    }),
    bebidas: input.bebidas.map((sec) => {
      const o = isObj(sec) ? sec : {};
      return {
        title: asString(o.title, "Sección"),
        ...(typeof o.suffix === "string" && o.suffix
          ? { suffix: o.suffix }
          : {}),
        items: Array.isArray(o.items)
          ? o.items.map((it) => {
              const i = isObj(it) ? it : {};
              const out: Menu["bebidas"][number]["items"][number] = {
                name: asString(i.name, "Bebida"),
              };
              if (typeof i.desc === "string" && i.desc) out.desc = i.desc;
              if (i.price !== undefined && i.price !== null) {
                out.price = asNumber(i.price);
              }
              return out;
            })
          : [],
      };
    }),
    adiciones: input.adiciones.map((a) => {
      const o = isObj(a) ? a : {};
      return {
        name: asString(o.name, "Adición"),
        price: asNumber(o.price),
      };
    }),
    adicionesHighlight: {
      name: asString(
        (input.adicionesHighlight as Record<string, unknown>).name,
        "Upgrade",
      ),
      sub: asString((input.adicionesHighlight as Record<string, unknown>).sub),
      price: asNumber((input.adicionesHighlight as Record<string, unknown>).price),
    },
  };

  return { ok: true, menu };
}

export async function saveMenu(input: unknown): Promise<SaveResult> {
  const validated = validateMenu(input);
  if (!validated.ok) return validated;

  try {
    await writeMenu(validated.menu);
    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true, savedAt: Date.now() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al guardar.",
    };
  }
}

export async function logout() {
  const store = await cookies();
  store.set(clearedSessionCookie());
  redirect("/admin/login");
}
