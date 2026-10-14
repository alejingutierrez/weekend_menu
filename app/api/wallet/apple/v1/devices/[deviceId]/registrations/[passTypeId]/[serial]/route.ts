import { walletService } from "@/lib/wallet-service";
/**
 * Apple pass web service — register / unregister a device for a pass.
 * POST   register (body: { pushToken })
 * DELETE unregister
 * Both require `Authorization: ApplePass <authenticationToken>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  addAppleRegistration,
  getCustomer,
  removeAppleRegistration,
  RegistrationLimitError,
} from "@/lib/loyalty-store";
import { enforceRequestLimits, RequestLimitError } from "@/lib/request-limits";
import { readLimitedJson } from "@/lib/limited-json";
import { verifyApplePassAuth } from "@/lib/apple-wallet";

import { validAppleIdentifiers } from "@/lib/apple-protocol";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ deviceId: string; passTypeId: string; serial: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  return walletService(async () => {
    const { deviceId, serial, passTypeId } = await params;
    if (!validAppleIdentifiers(deviceId, passTypeId, serial))
      return new NextResponse(null, { status: 404 });
    if (
      !(await verifyApplePassAuth(req.headers.get("authorization"), serial))
    ) {
      return new NextResponse(null, { status: 401 });
    }
    const customer = await getCustomer(serial);
    if (!customer) return new NextResponse(null, { status: 404 });

    const body = (await readLimitedJson(req, 4096).catch(() => null)) as {
      pushToken?: string;
    } | null;
    if (
      typeof body?.pushToken !== "string" ||
      !/^[0-9a-f]{32,512}$/i.test(body.pushToken)
    )
      return new NextResponse(null, { status: 400 });

    try {
      await enforceRequestLimits("wallet", customer.id, req.headers);
      const inserted = await addAppleRegistration({
        serial,
        deviceLibraryId: deviceId,
        pushToken: body.pushToken,
        registeredAt: new Date().toISOString(),
      });
      // 201 = newly registered (Apple accepts 200 for already-registered too).
      return new NextResponse(null, { status: inserted ? 201 : 200 });
    } catch (e) {
      if (e instanceof RequestLimitError || e instanceof RegistrationLimitError)
        return new NextResponse(null, {
          status: 429,
          headers: { "Retry-After": "900" },
        });
      throw e;
    }
  });
}
export async function DELETE(req: NextRequest, { params }: Params) {
  return walletService(async () => {
    const { deviceId, serial, passTypeId } = await params;
    if (!validAppleIdentifiers(deviceId, passTypeId, serial))
      return new NextResponse(null, { status: 404 });
    if (
      !(await verifyApplePassAuth(req.headers.get("authorization"), serial))
    ) {
      return new NextResponse(null, { status: 401 });
    }
    await removeAppleRegistration(deviceId, serial);
    return new NextResponse(null, { status: 200 });
  });
}
