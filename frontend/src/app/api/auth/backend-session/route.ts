import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BACKEND_TOKEN_COOKIE } from "@/lib/auth";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:5000";

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get(BACKEND_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      cookieStore.set(BACKEND_TOKEN_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });

      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    token,
  });
}
