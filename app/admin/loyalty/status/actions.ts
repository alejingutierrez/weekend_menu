"use server";
import { requireAdmin } from "@/lib/admin-session";
import { processWalletQueue } from "@/lib/wallet-sync";
import { revalidatePath } from "next/cache";
export async function retryWallets() {
  await requireAdmin();
  await processWalletQueue(10);
  revalidatePath("/admin/loyalty/status");
}
