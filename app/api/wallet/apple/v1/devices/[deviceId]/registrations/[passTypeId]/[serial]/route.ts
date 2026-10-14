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
} from "@/lib/loyalty-store";
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

    const body = (await req.json().catch(() => null)) as {
      pushToken?: string;
    } | null;
    if (
      typeof body?.pushToken !== "string" ||
      !/^[0-9a-f]{32,512}$/i.test(body.pushToken)
    )
      return new NextResponse(null, { status: 400 });

    const inserted = await addAppleRegistration({
      serial,
      deviceLibraryId: deviceId,
      pushToken: body.pushToken,
      registeredAt: new Date().toISOString(),
    });
    // 201 = newly registered (Apple accepts 200 for already-registered too).
    return new NextResponse(null, { status: inserted ? 201 : 200 });
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
