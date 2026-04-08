import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BACKEND_TOKEN_COOKIE } from "@/lib/auth";

export default function HomePage() {
  const backendToken = cookies().get(BACKEND_TOKEN_COOKIE)?.value;
  redirect(backendToken ? "/dashboard/monitoring" : "/login");
}

