import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// "My account" was merged into the Settings page so there's a single place for
// your profile, password, and (for managers) the app-wide settings.
export default function AccountPage() {
  redirect("/settings");
}
