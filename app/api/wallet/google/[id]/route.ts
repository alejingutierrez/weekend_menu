import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/loyalty-store";
import { getBaseUrl } from "@/lib/base-url";
import { buildStampUrl } from "@/lib/stamp-link";
import { googleConfigured, googleSaveUrl } from "@/lib/google-wallet";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: "Google Wallet no está configurado (ver SETUP-WALLET.md)." },
      { status: 503 },
    );
  }
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  const baseUrl = await getBaseUrl();
  const stampUrl = await buildStampUrl(baseUrl, id);

  try {
    const saveUrl = await googleSaveUrl(customer, stampUrl, baseUrl);
    return NextResponse.redirect(saveUrl);
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo generar el pase de Google.", detail: String(e) },
      { status: 502 },
    );
  }
}
