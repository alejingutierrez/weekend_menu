import { LoginForm } from "./form";

export const metadata = {
  title: "Weekend Burger · Admin login",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ from?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : "/admin";
  return (
    <main className="admin-shell">
      <div className="admin-card">
        <h1 className="admin-title">Admin</h1>
        <p className="admin-subtitle">Entrá para editar el menú.</p>
        <LoginForm from={from} />
      </div>
    </main>
  );
}
