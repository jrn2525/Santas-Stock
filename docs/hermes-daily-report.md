# CDPM Daily Morning Report — build spec for Hermes

**A single email to the GM every morning at 5:30 AM Eastern, covering the schedule
plus what happened in the last 24 hours.**

| | |
|---|---|
| Owner | John Nichols |
| Recipient | Scott Granger, GM — scott@christmasdecorplusmore.com |
| Schedule | 5:30 AM America/New_York, **every day** |
| Data source | **Jobber GraphQL API, queried directly** |
| Status | ✅ **DELIVERED to Hermes 2026-09-02 — build in progress on the Beelink** |
| Date | 2026-09-02 |
| Version | 2.1 — final; all blocking questions resolved |

> **This spec is closed and handed off.** John gave it to the Hermes Agent, which
> is building against it on the Beelink. **Nothing here is Santa's Stock work** —
> no code in this repo changes for it. The remaining items in §10 (payment status
> values, the payments/requests/quotes query shapes, primary phone/email, currency
> formatting) are **Hermes's build-time checks**, not open items for this repo.
> Don't reopen this unless John asks for a spec change.

> **This supersedes the earlier "CDPM Install Schedule Report" draft.** That draft
> covered only the install schedule (tomorrow / this week / next two weeks) and
> assumed the data came from Santa's Stock's existing sync. Both assumptions were
> wrong for this report. See §9.

---

## 1. Read this first — two things that will bite you

### 1.1 Create a SEPARATE Jobber Developer app for Hermes ⚠️

**Do not reuse Santa's Stock's Jobber app or its tokens.** Register a second app in
the Jobber Developer Center for Hermes, with its own client ID/secret, and
authorize it separately.

**Why this matters:** Jobber **rotates the refresh token on every use**. If Hermes
and Santa's Stock share one connection, whichever refreshes second is holding a
token that was just invalidated. The 5:30 AM Hermes run would silently break
John's production Santa's Stock sync, and the failure would surface hours later as
"Jobber not connected."

That rotation behavior is not speculation — it is the documented reason Santa's
Stock funnels all of its own concurrent refreshes through a single in-flight
promise (`src/lib/jobber/client.ts`).

**Why a separate *app*, not just a second authorization of the same app:**

1. **Guaranteed isolation.** A separate app unambiguously has its own credentials
   and its own token pairs. No shared-token failure mode, at all.
2. **Least privilege.** Hermes needs payments + requests + quotes read; Santa's
   Stock needs none of those. Separate apps keep each grant narrow, instead of
   widening what the production sync's token can reach.
3. **Independent revocation.** If Hermes's token leaks, revoke it without touching
   the live sync.

**Unverified, and the reason to not take the shortcut:** whether authorizing the
*same* app twice against the same Jobber account produces two independent token
pairs, or whether Jobber **replaces** the existing grant. That is vendor behavior
and is not checkable from this repo. If it replaces the grant, a second
authorization of the Santa's Stock app would take the production sync offline. A
separate app makes the question moot.

**Never** copy a refresh token out of the Santa's Stock database.

### 1.2 Three of the six sections do not exist in Santa's Stock

Santa's Stock syncs only: Customers/Properties, Jobs (incl. line items), Visits,
Invoices, and Notes — plus Products/Services on a separate manual sync.

It has **no payment records** (only an `invoiceStatus` string like `"paid"` — no
payment date, no amount), **no requests**, and **no quotes**.

So sections 4, 5, and 6 **must** come from the Jobber API directly. That is why
this whole report queries Jobber rather than reading Santa's Stock.

---

## 2. What the report contains

Six sections, same order every day. **Every section always renders** — if it has no
rows, it prints `None` rather than disappearing. A missing section is
indistinguishable from a broken report.

| # | Section | Window |
|---|---------|--------|
| 1 | Today's Schedule | Today, 00:00–23:59 ET |
| 2 | This Week's Schedule | Today → Sunday of this week |
| 3 | Next Week's Schedule | The following Mon–Sun, in full |
| 4 | Payments Received | Last 24h (see §4) |
| 5 | New Requests | Last 24h |
| 6 | Quotes Approved | Last 24h |

---

## 3. Sections 1–3: Schedule

### Week definitions (confirmed by John)

**Calendar weeks starting MONDAY** (confirmed by John, 2026-09-02) — not rolling
windows:

- **Today** — the calendar day the email is sent.
- **This week** — from today through **Sunday** of the current week.
- **Next week** — the **following Monday through Sunday**, in full.

Worked example, sent **Wednesday Sep 2**: This week = **Sep 2 → Sep 6 (Sun)**.
Next week = **Sep 7 (Mon) → Sep 13 (Sun)**.

⚠️ **Note for anyone reusing Santa's Stock's date helpers:** that app's calendar
uses a **Sunday**-anchored week (`startOfWeekET`). This report is **Monday**-
anchored. Don't borrow that helper without changing the anchor, or every week
boundary lands a day off.

Edge case: when the report is sent **on a Sunday**, "this week" is that single day
and "next week" begins the next morning. That is correct and intended — the block
"next week" refers to never shifts.

Today's stops also appear inside This Week. That repetition is intentional — Scott
reads section 1 for today and section 2 for planning.

### Fields per stop

```
8:00 AM    John Bob Jones
           1420 Oak Ridge Hwy, Lenoir City, TN 37771
           (865) 555-0142    jbjones@example.com
```

- Time (or the week label when no time is set)
- Client name
- Full service address
- Phone and email

Order stops by start time within each day; group by day within a week section.

> **Assumption to confirm:** these five fields are carried over from John's earlier
> draft, which he did not object to. If Scott needs more (job number, job title,
> crew), say so and they get added.

### Visits with no set time

Some installs are booked to a week rather than a day. They must **not** be guessed
onto a day. Group them at the end of the week they belong to under a clear heading:

```
WEEK OF SEP 21 — NO SET DAY
           Katie Stordahl
           [address]
           [phone]    [email]
```

They never appear in section 1 (Today), because there is no day to place them on.

---

## 4. Sections 4–6: the 24-hour window

All three "what happened" sections share one window, in **America/New_York**:

> **From 5:00:00 AM ET the previous day, through 4:59:59 AM ET on the send day.**

That is the 24 hours ending 31 minutes before the 5:30 AM send, so nothing falls
between the window and the email.

**Must be timezone-correct, not UTC-offset math.** Eastern shifts between EDT
(UTC−4) and EST (UTC−5). Compute the boundaries as *Eastern wall-clock times* and
convert to whatever the API expects. Hard-coding an offset silently shifts the
window by an hour twice a year. (Santa's Stock solves this with `Intl`-based
helpers in `src/lib/datetime.ts` — same approach applies.)

**Worked example.** Report sent **Wed Sep 2, 5:30 AM ET**:
- Window opens: **Tue Sep 1, 5:00:00 AM ET**
- Window closes: **Wed Sep 2, 4:59:59 AM ET**

### Section 4 — Payments Received

Everyone who paid inside the window.

| Column | Notes |
|---|---|
| Client | Customer name |
| Payment Date | The date the client paid, ET |
| Amount | Currency-formatted, e.g. `$1,250.00` |

Add a **total** row at the bottom — Scott will add them up anyway.

**Confirmed against Jobber's Payments view** (screenshot from John, 2026-09-02).
That screen lists: Client, Payment date, Payment status, Method, Payout date,
Amount — with each row also linking to an Invoice #. Three consequences:

1. **Use "Payment date", never "Payout date."** They are different columns and
   often days apart (e.g. paid Aug 26 → paid out Aug 28; some rows read "Upcoming"
   or "Manually deposited"). Payout date is when money reaches the bank, which is
   not what Scott is being told. Filtering on the wrong one silently shifts the
   whole section.
2. **Filter to successful payments.** The view has a Payment status column
   (observed value: `Succeeded`). Only count payments that actually cleared — a
   failed or pending attempt must not appear as revenue. Confirm the full set of
   status values in the API before relying on this.
3. **Available if Scott wants more later** — and cheap to add, since they're on the
   same record: **Method** (Card / Check) and **Invoice #**. Not included now
   because John specified three columns.

### Section 5 — New Requests

Everyone who submitted a request inside the window.

| Column | Notes |
|---|---|
| Client | Customer name — see the "New Call" caveat below |
| Contact | Phone and/or email (some requests have both, some phone only) |
| Requested | **When the request came in**, rendered absolute — e.g. `Sep 1, 4:02 PM` |

**Confirmed against Jobber's Requests view** (screenshot from John, 2026-09-02).
That screen shows: Client, Title, Property, Contact, Requested, Status. The three
columns John asked for map to it exactly. Three things to build around:

1. **Render "Requested" as an absolute date+time — do not copy Jobber's display.**
   The UI shows it relatively: `11:00 AM` for today, `Fri` for a few days back,
   `Aug 26` beyond that. That's fine on a screen you're looking at live; it is
   ambiguous in an email read at 5:30 the next morning. Since every row is inside a
   known 24-hour window anyway, print the real timestamp.
2. **⚠️ Many "clients" are auto-generated placeholders.** Observed client values
   include `New Call [+13026445686]`, `New Call [+14172933602]` — phone-call-sourced
   requests where Jobber has no name yet, alongside real names like `Katie Stordahl`
   and `Jimmy Brown`. **Print whatever Jobber has; never blank the row.** A nameless
   lead is exactly the one Scott needs to chase. If the name is a `New Call [...]`
   placeholder, the Contact column is the useful field — make sure it renders.
3. **Available if wanted later:** Title (observed: `Quo Request`), Property, and
   Status (observed: `New`). Not included now — John specified three columns.

### Section 6 — Quotes Approved

Everyone who **approved** a quote inside the window.

| Column | Notes |
|---|---|
| Client | Customer name |
| Quote Number | Jobber's quote number |

**Important:** this must catch **both** paths to approval:
1. The client approving the quote themselves (client-side approval), and
2. Someone at CDPM using **"Mark as Approved"** in Jobber.

These are often distinct events in the data model. If they carry different
statuses or timestamps, capture both — a quote John marked approved is exactly as
important to Scott as one the client clicked.

---

## 5. Connecting to Jobber

**Verified from the Santa's Stock codebase** (these are known-good):

| Item | Value |
|---|---|
| GraphQL endpoint | `https://api.getjobber.com/api/graphql` |
| OAuth authorize | `https://api.getjobber.com/api/oauth/authorize` |
| OAuth token | `https://api.getjobber.com/api/oauth/token` |
| Version header | `X-JOBBER-GRAPHQL-VERSION` (Santa's Stock pins `2025-04-16`) |
| Auth header | `Authorization: Bearer <access token>` |
| Pagination | `nodes { … }` + `pageInfo { hasNextPage endCursor }`, page size 25 |
| Refresh | `grant_type=refresh_token`; **rotates the refresh token every use** |
| Token expiry | From `expires_in`, or the access token's JWT `exp` claim |

**Throttling.** Jobber uses a **cost-based** throttle and returns
`extensions.cost.throttleStatus` on every response. Read it and wait exactly long
enough for the bucket to refill rather than using a fixed sleep. Santa's Stock
retries up to 6 times on throttle and 3 on transient 502/503/504, with a 60s
per-request timeout. Mirror that.

**Store tokens encrypted at rest.** Santa's Stock uses AES-256-GCM with a random
per-value IV. Hermes should do no less. Never log a token.

### The app — CONFIRMED

John registered a second Jobber Developer app on 2026-09-02:

| Field | Value |
|---|---|
| App name | **Managers Daily Report** |
| Developer | Christmas Decor Plus More, LLC |
| Callback URL | `https://jobber.askjohnbob.com/callback` — see below |

### How the Jobber Developer app works — read this before writing any code

If you have never wired up a Jobber app, this is the whole mental model. Nothing
here is optional; skipping step 5 is what breaks these integrations weeks later.

**What the app is.** A registration in Jobber's Developer Center that gives you two
credentials — a **Client ID** and a **Client Secret**. They identify *the software*.
They are not a login and they grant no data access on their own. John's account is
separate: he must *authorize* the app against his Jobber account before it can read
anything.

**Where the credentials go.** Copy them from the Developer Center into the Hermes
box's environment — `~/.hermes/.env`, or the systemd unit for the local Jobber
service:

```
JOBBER_CLIENT_ID=<from Developer Center>
JOBBER_CLIENT_SECRET=<from Developer Center>
```

⚠️ **Never** commit them, paste them into a chat, or put them in a doc. Same rule
John already applies to the Telegram bot token. Treat the Client Secret like a
password — anyone holding it plus a refresh token can read the whole Jobber account.

**The flow, start to finish:**

1. **John authorizes, once, in a browser.** The service sends him to Jobber's
   authorize URL with `client_id`, `redirect_uri`, `response_type=code`, and a
   random `state`.
2. **He approves** the scopes on Jobber's screen.
3. **Jobber redirects his browser** to the callback URL with `?code=…&state=…`.
   Verify `state` matches what you sent — that's the CSRF guard. Santa's Stock does
   this with an httpOnly cookie and rejects a mismatch.
4. **Exchange the code for tokens** — `POST` to the token URL with the code,
   `client_id`, `client_secret`, `redirect_uri`, and `grant_type=authorization_code`.
   You get back an **access token** (short-lived) and a **refresh token**
   (long-lived). The code is single-use and expires fast.
5. **From then on it runs unattended.** Before each API call, check whether the
   access token is near expiry; if so, `POST` again with
   `grant_type=refresh_token`. **Jobber returns a NEW refresh token every time and
   invalidates the old one.** You must persist the new one immediately, and never
   let two refreshes run concurrently — see §1.1. Get this wrong and it works for
   about an hour, then dies in a way that looks random days later.
6. **Every API call** then carries `Authorization: Bearer <access token>` plus the
   version header.

**How it breaks, and the fix.** If the stored refresh token is ever lost, clobbered,
or spent twice, no amount of retrying helps — the grant is dead. The only recovery
is John re-doing step 1. So: back up the token store, write it atomically, and log
loudly when a refresh fails rather than silently retrying.

**What John does vs. what the code does:**

| Step | Who |
|---|---|
| Register the app, set scopes + callback | John (Developer Center) |
| Copy Client ID/Secret into the environment | John, once |
| Click Approve in the browser | John, once |
| Everything after that — refresh, rotate, query | The code, forever |

### Callback URL

This is the OAuth `redirect_uri`: where Jobber returns the browser after John
approves, carrying a one-time `?code=`. Whatever listens there must exchange that
code for tokens **using the Managers Daily Report app's own Client ID + Secret**,
and the value must match the authorize request **exactly** (OAuth requirement).

**Do not use either of these:**

- ❌ `https://www.santasstock.com/api/jobber/callback` — Santa's Stock's route
  exchanges with *its own* client credentials, so a code minted for the Managers
  Daily Report app fails there (`error=token_exchange`). Verified non-destructive
  — that route exchanges before it writes, so a failure leaves the production
  connection intact — but it cannot work.
- ❌ `https://example.com/jobber/callback` — a placeholder carried over from
  another draft app. Fine for saving a draft; authorization can never complete,
  since the code would be delivered to a domain John doesn't control.

**ANSWER — use a Cloudflare-tunneled hostname to the Beelink:**

```
https://jobber.askjohnbob.com/callback
```

…routed by the existing Beelink `cloudflared` tunnel to a local listener on
`localhost:8767`.

**Verified environment** (from the `jrn2525/Cudy` repo, read 2026-09-02):

| Fact | Detail |
|---|---|
| What Hermes is | **Nous Research Hermes Agent**, v0.20.5, Python 3.11.15 |
| Where it runs | Beelink, `10.77.42.50` — local, headless |
| How it runs | systemd user services `hermes-gateway` + `hermes-dashboard` |
| Config / secrets | `~/.hermes/config.yaml`, `~/.hermes/.env` |
| How it gets tools | **`mcp_servers` HTTP entries** in `config.yaml` (same as John's Brain) |
| Tunnel | `cloudflared` runs **on the Beelink** (tunnel `openclaw-control-2`) |
| Proven routes | `hermes.askjohnbob.com` → `localhost:9119`; `brain.askjohnbob.com` → `localhost:8766` |

**Why this rather than the alternatives:**

- **Real HTTPS**, so it avoids the open question of whether Jobber accepts a plain
  `http://localhost` redirect — no need to find out.
- **It terminates on the Beelink**, the machine where Hermes lives and where the
  rotating refresh token has to be written. A callback on Santa's Stock would land
  the code on the wrong machine.
- **The ingress pattern is already proven twice** on this exact box.

### Gotchas — all four are recorded in John's own Cudy journal

1. **Do NOT put Cloudflare Access in front of the callback path.** The journal notes
   Access on `hermes.askjohnbob.com` produces *"two logins (Cloudflare email code,
   then the Hermes form)."* An Access interstitial sitting between Jobber's redirect
   and the listener will break the code hand-off. Use a hostname with **no Access
   app** (as `brain.` ended up after the Access app was deleted), or add an explicit
   bypass for `/callback`.
2. **Bind the listener to `127.0.0.1`, not `0.0.0.0`.** `cloudflared` runs on the
   same box; loopback is the established pattern here and keeps the port off the LAN.
3. **Always verify the tunnel route actually saved** — the journal records a save
   that *silently failed*:
   ```bash
   sudo journalctl -u cloudflared --no-pager | grep "Updated to new configuration" | tail -1
   ```
4. **Watch the Host header** if the listener validates it. The Hermes dashboard
   rejected any Host but its bind address (`Invalid Host header`); the fix was
   Cloudflare route → Origin request settings → **HTTP Host Header = `localhost`**.
   A minimal callback listener won't care, but know the symptom.

### Recommended shape: a local Jobber service, not OAuth inside Hermes

Hermes consumes tools as **`mcp_servers` HTTP entries** — exactly how it reads
John's Brain. So mirror that proven pattern instead of teaching Hermes OAuth:

```
Jobber  ──OAuth──▶  jobber.askjohnbob.com  ──tunnel──▶  127.0.0.1:8767
                                                          (local Jobber service)
                                                                 ▲
                                              Hermes ────────────┘
                                              via mcp_servers HTTP entry
```

That local service owns the whole credential problem: the callback, encrypted
token storage on disk, and **rotation-safe refresh with single-flight** (§1.1).
Hermes just calls it and formats the email — it never touches a token.

**John already has a working reference for this.** `Brain OAuth/server.py` in the
Cudy repo is a self-hosted OAuth 2.1 server with redirect-URI allow-listing,
approval gating, and **rotating refresh tokens** — the same problem, already
solved on the same machine. Copy its token-store approach rather than inventing one.

**Suggested port `8767`** — adjacent to the Brain's `8766` and clear of the ports
in use on that box (`8080` llama.cpp, `8765`/`8766` Brain, `9119` Hermes dashboard,
`58650` OpenClaw).

**Wiring it into Hermes** — same two lines as John's Brain, in
`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  johns_brain:
    url: "http://127.0.0.1:8765/mcp"
  jobber:                                   # new
    url: "http://127.0.0.1:8767/mcp"
```

**Adding the tunnel hostname** — Cloudflare dashboard → tunnel
`openclaw-control-2` → add public hostname `jobber.askjohnbob.com` →
`http://localhost:8767`, then verify it saved (gotcha 3 above).

### Scheduling the 5:30 AM send

**Hermes ships its own cron.** Its Web Dashboard exposes *"sessions, memory,
skills, MCP, cron, logs"* — so the daily trigger is a Hermes cron entry, not a
system crontab. Prefer it: it keeps the schedule with the agent that owns the job.

Two Beelink-specific realities that a cloud server wouldn't have:

- **The box must be awake at 5:30 AM.** A sleeping or rebooting Beelink sends
  nothing, silently. `hermes-gateway` is already `Restart=on-failure` with linger
  enabled, so it survives reboots — but confirm the machine doesn't sleep.
- **This is exactly why §7's heartbeat matters.** A report that stops arriving is
  indistinguishable from a quiet week. John needs to hear about a missed send.

### Scopes — CONFIRMED for this app

Verified from the Developer Center screenshots (2026-09-02). Every scope the six
sections need is enabled, **Read**, with Write left unchecked:

| Scope | Covers |
|---|---|
| **Clients** | Client names + contact info (all sections) |
| **Scheduled Items** | *"Visits, Assessments, Tasks, and Calendar Events"* — sections 1–3 |
| **Requests** | Section 5 |
| **Quotes** | Section 6 |
| **Jobber Payments** | Section 4 (read-only — no Write option offered) |
| Jobs, Invoices | Supporting context; invoices link to payments |

**Read-only is correct — keep it that way.** This report never writes to Jobber.
Leave every **Write** box unchecked.

**Recommend trimming the rest.** Also switched on but unused by this report:
Users, Tax Rates, Expenses, Custom Field Configurations, Timesheets, Vehicles and
Equipment, Marketing. Least privilege says turn off what the report doesn't read —
it shrinks what a leaked token could reach. Not urgent, but easier to do now than
after the app is live.

### Scopes — general note

Santa's Stock does **not** request scopes in its authorize URL; they are configured
on the app in the Jobber Developer Center. Its current grant covers clients, jobs,
visits, invoices, notes, and products/services — **it has no reason to include
payments, requests, or quotes.**

**Action:** confirm the Hermes app has read scopes for **payments, requests, and
quotes**, then re-authorize. If a scope is missing, those queries fail at runtime,
not at setup — so verify before the first scheduled send.

### Query names — verify against the live schema

⚠️ **Honest limitation:** Santa's Stock has never queried payments, requests, or
quotes, so this repo contains **no working example** of those queries. Their exact
type names, fields, filter arguments, and status enums are **not verified here**,
and a vendor's API drifts.

**Do not guess them.** Before building sections 4–6, run GraphQL introspection
against the live endpoint (or read Jobber's current API docs) to confirm:

- The query/connection name for each of payments, requests, quotes
- The timestamp field each one filters on — and whether server-side date filtering
  is supported (strongly preferred over pulling everything and filtering locally)
- The exact status values that mean "approved" for a quote, covering both the
  client-approved and "Mark as Approved" paths
- Whether payment amount comes back as a number or a string, and in what currency
  unit

The known-good patterns above (pagination, throttle handling, version header) apply
to those queries too.

---

## 6. Email delivery

| Item | Choice |
|---|---|
| To | scott@christmasdecorplusmore.com |
| Reply-to | John |
| Subject | `CDPM Daily Report — Wed, Sep 2` |
| Format | HTML **with a plain-text alternative** |
| Recipients | Built as a list, so people can be added without a code change |

Keep it scannable on a phone. Scott is reading this at 5:30 AM.

---

## 7. Failure handling

The rules that keep this trustworthy:

1. **Partial beats silent.** If one section's query fails, send the report with the
   other five and state plainly which section failed and why. Never drop the send.
2. **Empty is not the same as broken.** A section with no rows prints `None`. A
   section that errored says so explicitly. These must never look alike.
3. **Never present stale data as current.** If a section is served from cache or a
   prior run, label it with its timestamp.
4. **Heartbeat to John.** If the 5:30 AM send does not go out at all, John gets
   notified. A report that stops arriving looks exactly like a quiet week — that is
   how a broken job hides for a month.
5. **Retry, then report.** Transient API errors retry with backoff. If retries are
   exhausted, rule 1 applies.
6. **Log every run**: started, finished, per-section row counts, and any errors.

---

## 8. Suggested build order

| Phase | Scope | Done when |
|---|---|---|
| 1 | Hermes's own Jobber OAuth connection + scope check | A test query returns data, and Santa's Stock's sync still works afterward |
| 2 | Sections 1–3 (schedule) | John compares against Jobber and it matches |
| 3 | Sections 4–6, after the schema check in §5 | Counts match Jobber for a known day |
| 4 | Email to John at 5:30 AM | Five consecutive correct sends |
| 5 | Switch recipient to Scott | He reads it and says what's missing |

Sending to John first is deliberate — it catches formatting and timezone errors
before they reach the GM.

---

## 9. What changed from the earlier draft

The previous "CDPM Install Schedule Report" spec was wrong in four ways:

1. **Scope.** It covered only the install schedule. It had no payments, requests, or
   quotes — three of the six sections John actually wants.
2. **Data source.** It stated "all five fields already come through the existing
   sync. Nothing new is pulled from Jobber." True for the schedule; **impossible**
   for payments/requests/quotes, which Santa's Stock does not store at all.
3. **Horizons.** It used tomorrow / this week / next two weeks. The ask is
   **today / this week / next week**.
4. **Cadence.** It specified Sunday–Friday, six sends. The ask is **every morning**.

Carried forward from it, because they were right: the per-stop field list, the
week-window handling for undated installs, the freshness/heartbeat discipline, and
sending to John before Scott.

---

## 10. Open items

1. ~~The "Requested" column.~~ **RESOLVED 2026-09-02** — it is the date/time the
   request came in. Render it absolute, not Jobber's relative display. See §4.
2. ~~Week start.~~ **RESOLVED 2026-09-02** — weeks start **Monday**. See §3, and
   note Santa's Stock's own helper is Sunday-anchored.
3. ~~Scopes.~~ **RESOLVED 2026-09-02** — the *Managers Daily Report* app has
   Clients, Scheduled Items, Requests, Quotes, and Jobber Payments all enabled
   Read. See §5. Optional cleanup: turn off the scopes the report doesn't use.
4. ~~Callback URL.~~ **RESOLVED 2026-09-02** — `https://jobber.askjohnbob.com/callback`
   via the Beelink's existing cloudflared tunnel to `localhost:8767`. See §5 for the
   verified environment and the four gotchas.
5. **Payment status values.** Confirm the full set (`Succeeded` observed) so the
   filter in section 4 excludes failed/pending attempts correctly.
6. **Query shapes.** Introspect the live Jobber schema for payments, requests, and
   quotes (§5). Not verifiable from the Santa's Stock repo.
7. **Multiple phones/emails.** If a client has several, does Jobber flag a primary?
   If not, the report takes the first — check that against a few real records.
8. **Currency formatting** for the payments total.

---

## Appendix: Example output

```
Subject: CDPM Daily Report — Wed, Sep 2

================================================================
TODAY'S SCHEDULE — WEDNESDAY, SEPTEMBER 2
================================================================
8:00 AM    John Bob Jones
           1420 Oak Ridge Hwy, Lenoir City, TN 37771
           (865) 555-0142    jbjones@example.com

10:30 AM   Ellen Flautt
           [address]
           [phone]    [email]

================================================================
THIS WEEK — SEP 2 TO SEP 6
================================================================
THURSDAY SEP 3
9:00 AM    Debbie Sexton
           [address]
           [phone]    [email]

FRIDAY SEP 4
8:00 AM    Darius Hairston
           [address]
           [phone]    [email]

NO SET DAY THIS WEEK
           Kasi Henrickson
           [address]
           [phone]    [email]

================================================================
NEXT WEEK — SEP 7 TO SEP 13
================================================================
MONDAY SEP 7
8:00 AM    Susie McCamy
           [address]
           [phone]    [email]

WEEK OF SEP 7 — NO SET DAY
           Katie Stordahl
           [address]
           [phone]    [email]

================================================================
PAYMENTS RECEIVED — SEP 1, 5:00 AM TO SEP 2, 4:59 AM
================================================================
Client                  Payment Date        Amount
Amanda Wilson           Sep 1, 9:14 AM      $1,250.00
Tennessee Brokerage     Sep 1, 2:37 PM        $550.00
                                    TOTAL   $1,800.00

================================================================
NEW REQUESTS — SEP 1, 5:00 AM TO SEP 2, 4:59 AM
================================================================
Client                  Contact                     Requested
Kasi Henrickson         (407) 782-6753              Sep 1, 4:02 PM
                        khenri915@gmail.com
New Call [+18653189414] (865) 318-9414              Sep 1, 6:19 PM

================================================================
QUOTES APPROVED — SEP 1, 5:00 AM TO SEP 2, 4:59 AM
================================================================
Client                  Quote Number
Pam Michelson           #1042
UT / Chi Omega          #1039

================================================================
Generated Sep 2, 5:30 AM ET
```

Empty sections still render:

```
================================================================
QUOTES APPROVED — SEP 1, 5:00 AM TO SEP 2, 4:59 AM
================================================================
None
```
