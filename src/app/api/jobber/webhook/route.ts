import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { processJobberWebhookEvents } from "@/lib/jobber/webhook-processor";

export const dynamic = "force-dynamic";

// Jobber signs each webhook with a base64 HMAC-SHA256 of the raw request
// body, keyed by the app's OAuth client secret, in this header.
const SIGNATURE_HEADER = "x-jobber-hmac-sha256";

function signatureMatches(rawBody: string, provided: string | null): boolean {
  const secret = process.env.JOBBER_CLIENT_SECRET;
  if (!secret || !provided) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type WebHookEvent = {
  topic?: string;
  itemId?: string;
  accountId?: string;
  appId?: string;
  occurredAt?: string;
  occuredAt?: string; // legacy spelling for apps created before 2023-12-08
};

export async function POST(req: NextRequest) {
  // Must read the RAW body for HMAC verification — re-serializing parsed
  // JSON would change bytes and break the signature.
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);

  if (!signatureMatches(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: WebHookEvent | null = null;
  try {
    const parsed = JSON.parse(rawBody) as {
      data?: { webHookEvent?: WebHookEvent };
    };
    event = parsed.data?.webHookEvent ?? null;
  } catch {
    // Signature was valid but body isn't the shape we expect. Ack so Jobber
    // doesn't retry forever; nothing to process.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const topic = event?.topic;
  if (!topic) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Record the event. At-least-once delivery means duplicates can arrive;
  // processing reuses idempotent upserts, so we don't dedupe here.
  await prisma.syncEvent.create({
    data: {
      source: "jobber",
      eventType: topic,
      payload: event as object,
      status: "PENDING",
    },
  });

  // Process after the response is sent so we ack well within Jobber's ~1s
  // window. On Railway's persistent server this runs reliably in-process.
  after(async () => {
    try {
      await processJobberWebhookEvents();
    } catch (err) {
      console.error("[jobber-webhook] processing failed:", err);
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
