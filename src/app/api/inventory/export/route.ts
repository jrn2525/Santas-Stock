import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Scope = "items" | "kits" | "both";

function quote(value: string): string {
  // RFC 4180: quote if the field contains a comma, quote, CR, or LF.
  // Always escape internal quotes by doubling them.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function row(cells: (string | null | undefined)[]): string {
  return cells.map((c) => quote(c ?? "")).join(",");
}

function decimalToString(d: Prisma.Decimal | null): string {
  return d === null ? "" : d.toFixed(2);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Not authenticated.", { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return new NextResponse("Forbidden.", { status: 403 });
  }

  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope");
  const scope: Scope =
    scopeParam === "items" || scopeParam === "kits" || scopeParam === "both"
      ? scopeParam
      : "both";

  const lines: string[] = [];
  lines.push(row(["Name", "Description", "Category", "Unit Cost", "Active"]));

  if (scope === "items" || scope === "both") {
    const items = await prisma.item.findMany({
      orderBy: [{ name: "asc" }],
      select: { name: true, description: true, unitCost: true, active: true },
    });
    for (const it of items) {
      lines.push(
        row([
          it.name,
          it.description,
          "Product",
          decimalToString(it.unitCost),
          it.active ? "true" : "false",
        ]),
      );
    }
  }

  if (scope === "kits" || scope === "both") {
    const kits = await prisma.kit.findMany({
      orderBy: [{ name: "asc" }],
      select: { name: true, description: true, unitCost: true, active: true },
    });
    for (const k of kits) {
      lines.push(
        row([
          k.name,
          k.description,
          "Service",
          decimalToString(k.unitCost),
          k.active ? "true" : "false",
        ]),
      );
    }
  }

  const body = lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `santas-stock-${scope}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
