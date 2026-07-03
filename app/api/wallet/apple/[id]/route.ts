import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/loyalty-store";
import { getBaseUrl } from "@/lib/base-url";
import { buildStampUrl } from "@/lib/stamp-link";
import { appleConfigured, buildPkpass } from "@/lib/apple-wallet";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!appleConfigured()) {
    return NextResponse.json(
      { error: "Apple Wallet no está configurado (ver SETUP-WALLET.md)." },
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
    const pkpass = await buildPkpass(customer, stampUrl, baseUrl);
    return new NextResponse(pkpass, {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="weekend-club-${customer.code}.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo generar el pase de Apple.", detail: String(e) },
      { status: 502 },
    );
  }
}
