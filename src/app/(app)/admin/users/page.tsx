import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole, roleLabel } from "@/lib/auth-helpers";
import { dateFormatET } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const dateFormatter = dateFormatET;

function parseRole(value: string | undefined): Role | undefined {
  if (!value) return undefined;
  return value === "ADMIN" || value === "MANAGER" || value === "USER"
    ? value
    : undefined;
}

function parseActive(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; active?: string }>;
}) {
  await requireRole(ADMIN_ROLES);
  const { q, role: roleFilter, active: activeFilter } = await searchParams;

  const query = q?.trim() ?? "";
  const parsedRole = parseRole(roleFilter);
  const parsedActive = parseActive(activeFilter);

  const users = await prisma.user.findMany({
    where: {
      AND: [
        query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
        parsedRole ? { role: parsedRole } : {},
        parsedActive !== undefined ? { active: parsedActive } : {},
      ],
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200,
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">Users</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Add, edit, deactivate, and reset passwords for everyone who signs
            into Santa&apos;s Stock.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
        >
          + New user
        </Link>
      </header>

      <form className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_180px_auto]">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email..."
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <select
          name="role"
          defaultValue={roleFilter ?? ""}
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="USER">Crew</option>
        </select>
        <select
          name="active"
          defaultValue={activeFilter ?? ""}
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">Active + inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button
          type="submit"
          className="rounded-md border border-rule bg-card px-4 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-dim">
                  {query || parsedRole || parsedActive !== undefined ? (
                    <>No users matched those filters.</>
                  ) : (
                    <>
                      No users yet.{" "}
                      <Link
                        href="/admin/users/new"
                        className="text-brand underline"
                      >
                        Add the first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="text-ink">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-ink-dim">{u.email}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {roleLabel(u.role)}
                  </td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="inline-block rounded-full border border-rule bg-card px-2 py-0.5 text-xs text-ink">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border border-brand bg-brand/10 px-2 py-0.5 text-xs text-brand">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {u.lastLoginAt ? dateFormatter.format(u.lastLoginAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}/edit`}
                      className="text-brand underline hover:text-brand-hover"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
