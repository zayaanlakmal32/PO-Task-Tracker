import { NextRequest, NextResponse } from "next/server";
import { webcrypto } from "node:crypto";
import { sha256Hex, AUTH_COOKIE_NAME } from "@/lib/auth-hash";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) return NextResponse.json({ ok: true }); // no password configured

  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const hash = await sha256Hex(expected, webcrypto.subtle as unknown as SubtleCrypto);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, hash, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
