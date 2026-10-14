"use server";

import { revalidatePath } from "next/cache";
import {
  addStamp,
  archiveCustomer,
  restoreCustomer,
  redeemReward,
} from "@/lib/loyalty-store";
import { requireAdmin } from "@/lib/admin-session";

export async function addStampAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await addStamp(id, actor, String(formData.get("operationId") ?? ""));
  revalidatePath("/admin/loyalty");
}

export async function redeemRewardAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id)
    await redeemReward(id, actor, String(formData.get("operationId") ?? ""));
  revalidatePath("/admin/loyalty");
}

export async function archiveCustomerAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await archiveCustomer(id, actor);
  revalidatePath("/admin/loyalty");
  revalidatePath(`/card/${id}`);
}

export async function restoreCustomerAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await restoreCustomer(id, actor);
  revalidatePath("/admin/loyalty");
  revalidatePath(`/card/${id}`);
}
