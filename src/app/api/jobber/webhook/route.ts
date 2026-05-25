import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { processJobberWebhookEvents } from "@/lib/jobber/webhook-processor";

export const dynamic = "force-dynamic";

// Jobber signs each webhook with a base64 HMAC-SHA256 of the raw request
// body, keyed by the app's OAuth client secret, in this header.
const SIGNATURE_HEADER = "x-jobber-hmac-sha256";

function verifySignature(
  rawBody: string,
  provided: string | null,
): {
  matched: boolean;
  secretPresent: boolean;
  signaturePresent: boolean;
  providedLen: number;
  expectedLen: number;
} {
  const secret = process.env.JOBBER_CLIENT_SECRET;
  const secretPresent = Boolean(secret);
  const signaturePresent = Boolean(provided);
  if (!secret || !provided) {
    return {
      matched: false,
      secretPresent,
      signaturePresent,
      providedLen: provided?.length ?? 0,
      expectedLen: 0,
    };
  }
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  const matched = a.length === b.length && timingSafeEqual(a, b);
  return {
    matched,
    secretPresent,
    signaturePresent,
    providedLen: b.length,
    expectedLen: a.length,
  };
}

type WebHookEvent = {
  topic?: string;
  itemId?: string;
  accountId?: string;
  appId?: string;
  occurredAt?: string;
  occuredAt?: string; // legacy spelling for apps created before 2023-12-08
};

function parseTopic(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as {
      data?: { webHookEvent?: WebHookEvent };
    };
    return parsed.data?.webHookEvent?.topic;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  // Must read the RAW body for HMAC verification — re-serializing parsed
  // JSON would change bytes and break the signature.
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);
  const sig = verifySignature(rawBody, signature);
  const topic = parseTopic(rawBody);

  if (!sig.matched) {
    // TEMPORARY diagnostic: record the rejected attempt so we can tell
    // "Jobber never reached us" apart from "reached us but signature
    // mismatch" using a single SQL query. Status PROCESSED so the
    // processor ignores it. Remove once webhooks are confirmed working.
    await prisma.syncEvent.create({
      data: {
        source: "jobber",
        eventType: topic ? `BAD_SIGNATURE:${topic}` : "BAD_SIGNATURE",
        payload: {
          secretPresent: sig.secretPresent,
          signaturePresent: sig.signaturePresent,
          providedLen: sig.providedLen,
          expectedLen: sig.expectedLen,
          bodyLength: rawBody.length,
        },
        status: "PROCESSED",
        error: "signature mismatch (diagnostic)",
      },
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (!topic) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const event = (() => {
    try {
      const parsed = JSON.parse(rawBody) as {
        data?: { webHookEvent?: WebHookEvent };
      };
      return parsed.data?.webHookEvent ?? null;
    } catch {
      return null;
    }
  })();

  // Record the event. At-least-once delivery means duplicates can arrive;
  // processing reuses idempotent upserts, so we don't dedupe here.
  await prisma.syncEvent.create({
    data: {
      source: "jobber",
      eventType: topic,
      payload: (event as object) ?? {},
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
