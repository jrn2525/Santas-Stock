import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  // Admins are restricted to the Admin section; everyone else lands on
  // their Job Flow dashboard.
  if (session.user.role === "ADMIN") redirect("/admin/overview");
  redirect("/job-flow/dashboard");
}
