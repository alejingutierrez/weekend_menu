"use server";

import { revalidatePath } from "next/cache";
import { verifyCustomerToken } from "@/lib/customer-token";
import { addStamp } from "@/lib/loyalty-store";

export type StampState = {
  ok?: boolean;
  name?: string;
  stamps?: number;
  rewardEarned?: boolean;
  rewardsAvailable?: number;
  error?: string;
};

export async function confirmStamp(
  _prev: StampState,
  formData: FormData,
): Promise<StampState> {
  const id = String(formData.get("id") ?? "");
  const token = String(formData.get("t") ?? "");

  if (!(await verifyCustomerToken(id, token))) {
    return { error: "Código inválido o alterado." };
  }

  const res = await addStamp(id);
  if (!res) return { error: "Cliente no encontrado." };

  revalidatePath("/admin/loyalty");
  return {
    ok: true,
    name: res.customer.name,
    stamps: res.customer.stamps,
    rewardEarned: res.rewardEarned,
    rewardsAvailable: res.customer.rewardsAvailable,
  };
}
