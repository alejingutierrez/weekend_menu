"use server";

import { revalidatePath } from "next/cache";
import { verifyCustomerToken } from "@/lib/customer-token";
import { addStamp, getCustomer } from "@/lib/loyalty-store";
import { requireAdmin } from "@/lib/admin-session";

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
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const token = String(formData.get("t") ?? "");

  if (!(await verifyCustomerToken(id, token))) {
    return { error: "Código inválido o alterado." };
  }

  const customer = await getCustomer(id);
  if (!customer) return { error: "Cliente no encontrado." };
  if (customer.archivedAt) return { error: "Tarjeta archivada. Restáurala en Fidelidad para poner sellos." };
  const res = await addStamp(customer.id, actor);
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
