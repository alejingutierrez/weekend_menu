"use server";
import { requireAdmin } from "@/lib/admin-session";
import { processWalletQueue } from "@/lib/wallet-sync";
import { revalidatePath } from "next/cache";
import { resumeWalletRetries } from "@/lib/loyalty-store";
export async function retryWallets() {
  await requireAdmin();
  await resumeWalletRetries();
  await processWalletQueue(10);
  revalidatePath("/admin/loyalty/status");
}
