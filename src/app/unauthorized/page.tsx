import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-3xl font-bold text-santa-red">Not authorized</h1>
      <p className="mt-2 text-gray-400">
        Your account doesn&apos;t have permission to view that page.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm text-gray-300 underline hover:text-white"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
