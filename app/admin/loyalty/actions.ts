"use server";

import { revalidatePath } from "next/cache";
import { addStamp, deleteCustomer, redeemReward } from "@/lib/loyalty-store";

export async function addStampAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) await addStamp(id);
  revalidatePath("/admin/loyalty");
}

export async function redeemRewardAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) await redeemReward(id);
  revalidatePath("/admin/loyalty");
}

export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteCustomer(id);
  revalidatePath("/admin/loyalty");
}
