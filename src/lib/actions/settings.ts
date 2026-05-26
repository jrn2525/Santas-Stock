"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const MAX_LOGO_BYTES = 1_000_000; // 1 MB
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

// "HH:MM" on a 15-minute boundary, 24-hour.
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

function parseJsonArray(v: unknown): unknown {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || v.trim() === "") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SettingsSchema = z
  .object({
    businessName: z.string().trim().min(1, "Business name is required.").max(120),
    calendarDefaultView: z.enum(["week", "month", "day"]),
    calendarHourStart: z.coerce.number().int().min(0).max(23),
    calendarHourEnd: z.coerce.number().int().min(1).max(24),
    defaultPageSize: z.coerce
      .number()
      .int()
      .min(10, "Minimum 10.")
      .max(200, "Maximum 200."),
    pickListDefaultWindow: z.enum(["week", "month", "all"]),
    lowStockDefaultThreshold: z.coerce
      .number()
      .int()
      .min(0, "Must be 0 or more."),
    autoSyncEnabled: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.boolean(),
    ),
    autoSyncTimes: z.preprocess(
      parseJsonArray,
      z
        .array(z.string().regex(TIME_RE, "Times must be on a 15-minute increment."))
        .max(96),
    ),
    autoSyncDays: z.preprocess(
      parseJsonArray,
      z.array(z.coerce.number().int().min(0).max(6)).max(7),
    ),
  })
  .refine((d) => d.calendarHourStart < d.calendarHourEnd, {
    message: "Start hour must be before end hour.",
    path: ["calendarHourEnd"],
  });

export async function updateSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = SettingsSchema.safeParse({
    businessName: formData.get("businessName"),
    calendarDefaultView: formData.get("calendarDefaultView"),
    calendarHourStart: formData.get("calendarHourStart"),
    calendarHourEnd: formData.get("calendarHourEnd"),
    defaultPageSize: formData.get("defaultPageSize"),
    pickListDefaultWindow: formData.get("pickListDefaultWindow"),
    lowStockDefaultThreshold: formData.get("lowStockDefaultThreshold"),
    autoSyncEnabled: formData.get("autoSyncEnabled"),
    autoSyncTimes: formData.get("autoSyncTimes"),
    autoSyncDays: formData.get("autoSyncDays"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  // Logo: replace only when a new file is uploaded; clear when "remove" ticked;
  // otherwise leave the existing logo untouched.
  let logo:
    | { logoData: Uint8Array<ArrayBuffer>; logoMimeType: string }
    | { logoData: null; logoMimeType: null }
    | undefined;
  const removeLogo = formData.get("removeLogo") === "on";
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      return {
        errors: { logo: ["Logo must be a PNG, JPEG, WebP, or SVG image."] },
        message: null,
      };
    }
    if (file.size > MAX_LOGO_BYTES) {
      return { errors: { logo: ["Logo must be under 1 MB."] }, message: null };
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(new Uint8Array(buf));
    logo = { logoData: bytes, logoMimeType: file.type };
  } else if (removeLogo) {
    logo = { logoData: null, logoMimeType: null };
  }

  const data = {
    ...parsed.data,
    autoSyncTimes: Array.from(new Set(parsed.data.autoSyncTimes)).sort(),
    autoSyncDays: Array.from(new Set(parsed.data.autoSyncDays)).sort(
      (a, b) => a - b,
    ),
    ...(logo ?? {}),
  };

  await prisma.settings.upsert({
    where: { singleton: "singleton" },
    create: data,
    update: data,
  });

  // Settings feed nearly every page (including the header in the app layout),
  // so invalidate the whole tree in one shot.
  revalidatePath("/", "layout");

  redirect("/settings?flash=settings-updated");
}
