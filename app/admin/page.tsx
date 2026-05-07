import { readMenu } from "@/lib/menu-store";
import { EditorForm } from "./editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weekend Burger · Editor",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const menu = await readMenu();
  return (
    <main className="admin-shell admin-shell-wide">
      <EditorForm initialMenu={menu} />
    </main>
  );
}
