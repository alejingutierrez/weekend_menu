import { walletService } from "@/lib/wallet-service";
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
  const { id } = await params;
  const unavailable = () =>
    _req.headers.get("accept")?.includes("text/html")
      ? new NextResponse(
          `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekend · Mi tarjeta</title><body><main><h1>Apple Wallet está temporalmente no disponible</h1><p>Tu tarjeta web conserva tu código y tus sellos. Puedes mostrarla en caja o volver a descargar el pase más tarde.</p><a href="/card/${encodeURIComponent(id)}">Abrir mi tarjeta</a></main></body></html>`,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Retry-After": "60",
              "Cache-Control": "no-store",
            },
          },
        )
      : NextResponse.json(
          {
            error:
              "Apple Wallet está temporalmente no disponible. Puedes seguir usando tu tarjeta web.",
          },
          { status: 503, headers: { "Retry-After": "60" } },
        );
  return walletService(async () => {
    if (!appleConfigured()) {
      return unavailable();
    }
    const customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado." },
        { status: 404 },
      );
    }

    const baseUrl = await getBaseUrl();
    const stampUrl = await buildStampUrl(baseUrl, id);

    try {
      // Keep the serial of an older recovered pass stable for Wallet updates.
      const pkpass = await buildPkpass({ ...customer, id }, stampUrl, baseUrl);
      return new NextResponse(pkpass, {
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": `attachment; filename="weekend-club-${customer.code}.pkpass"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return unavailable();
    }
  }, unavailable);
}
