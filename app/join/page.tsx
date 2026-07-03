import type { Metadata } from "next";
import { STAMPS_PER_REWARD } from "@/lib/loyalty-types";
import { JoinForm } from "./form";
import { PeaceHand } from "@/app/peace-hand";

export const metadata: Metadata = {
  title: "Weekend Club · Únete",
  description: `Junta ${STAMPS_PER_REWARD} sellos y llévate una hamburguesa gratis.`,
  robots: { index: false, follow: false },
};

export default function JoinPage() {
  return (
    <main className="lc-shell">
      <div className="lc-logo">
        <h1>weekend</h1>
        <span className="lc-logo-club">club</span>
      </div>
      <div className="lc-card">
        <h2 className="lc-h1">Tu tarjeta de sellos</h2>
        <p className="lc-lead">
          Cada hamburguesa suma un sello. Al llegar a{" "}
          <strong>{STAMPS_PER_REWARD}</strong>, la siguiente es{" "}
          <strong>gratis</strong> 🎉
        </p>
        <JoinForm />
      </div>
      <PeaceHand />
    </main>

  );
}
