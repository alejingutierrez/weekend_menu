import { NextResponse } from "next/server";
/** Infrastructure errors must not be presented as a missing customer's card. */
export async function walletService(
  run: () => Promise<Response>,
  onFailure?: () => Response,
): Promise<Response> {
  try {
    return await run();
  } catch {
    console.error("[wallet] service unavailable");
    return onFailure
      ? onFailure()
      : NextResponse.json(
          {
            error:
              "Tarjeta temporalmente no disponible. Conserva tu código y vuelve a intentarlo.",
          },
          {
            status: 503,
            headers: { "Retry-After": "30", "Cache-Control": "no-store" },
          },
        );
  }
}
