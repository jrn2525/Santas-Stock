import { redirect } from "next/navigation";
import Image from "next/image";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getSettings, logoUrl } from "@/lib/settings";
import { PasswordInput } from "@/components/password-input";

// Render per-request so a changed logo / business name shows without a rebuild.
export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  CallbackRouteError: "Invalid email or password.",
  default: "Something went wrong. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? errorMessages[error] ?? errorMessages.default : null;
  const settings = await getSettings();

  async function action(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/job-flow/dashboard",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/sign-in?error=${err.type}`);
      }
      throw err;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 flex justify-center">
        {settings.hasCustomLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl(settings.logoVersion)}
            alt={settings.businessName}
            className="h-auto w-80"
          />
        ) : (
          <Image
            src="/logo.png"
            alt={settings.businessName}
            width={320}
            height={320}
            priority
            className="h-auto w-80"
          />
        )}
      </div>

      <p className="text-center text-sm text-ink-dim">Sign in to continue.</p>

      <form action={action} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-md border border-rule bg-card px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <div className="mt-1">
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {message && (
          <p className="text-sm text-brand" role="alert">
            {message}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-brand px-4 py-2 font-medium text-ink hover:bg-brand-hover"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-dim">
        Forgot your password? Contact your administrator to reset it.
      </p>
    </main>
  );
}
