import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";

export default async function Home() {
  const id = await getSessionUserId();
  redirect(id ? "/dashboard" : "/login");
}
