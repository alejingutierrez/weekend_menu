/**
 * Shared types for the menu data. The JSON in `data/menu.json`
 * is the source of truth and conforms to the `Menu` shape.
 */

export type PillStyle =
  | "red"
  | "red-soft"
  | "blue"
  | "blue-deep"
  | "blue-soft";

export type LabelColor = "red" | "blue";

export type PriceTier = {
  label: string;
  sub: string;
  price: number;
  pillStyle: PillStyle;
  labelColor: LabelColor;
};

export type Burger = {
  name: string;
  desc: string;
  /** Free-form string of emoji decorations (e.g. "🌶️🌶️" or "🌱"). */
  icons?: string;
  tiers: PriceTier[];
};

export type Fries = {
  name: string;
  desc: string;
  tiers: PriceTier[];
};

export type Postre = {
  name: string;
  desc: string;
  badge?: "PRONTO";
};

export type BebidaItem = {
  name: string;
  desc?: string;
  price?: number;
};

export type BebidaSection = {
  title: string;
  suffix?: string;
  items: BebidaItem[];
};

export type Adicion = {
  name: string;
  price: number;
};

export type AdicionesHighlight = {
  name: string;
  sub: string;
  price: number;
};

export type Menu = {
  tagline: string;
  burgers: Burger[];
  fries: Fries;
  postres: Postre[];
  bebidas: BebidaSection[];
  adiciones: Adicion[];
  adicionesHighlight: AdicionesHighlight;
};
