# Turning on accounts

Everything in the app works without this. With no Supabase configured, Honey
Hole builds and runs exactly as it did before: lakes, species, regulations and
the forecast, no sign-in control, no reports section. That is deliberate, so a
missing environment variable degrades the app instead of breaking it.

Work through this once and the writable layer switches itself on.

---

## 1. Create the Supabase project  ·  ~3 min

1. Sign up at <https://supabase.com> and create a project.
2. Region: **East US (North Virginia)** — closest to Wisconsin of the free
   regions, and to where Vercel serves this app from.
3. Save the database password somewhere. You will rarely need it, and it is
   annoying to reset.

## 2. Create the tables  ·  ~1 min

In the project, open **SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it.

It is written to be re-runnable, so if you edit something later you can paste
the whole file again rather than working out which parts changed.

Check it worked: **Table Editor** should now list `profiles`, `water_reports`
and `feedback`, each showing **RLS enabled**. If any table says RLS is
disabled, stop and re-run the script — an unprotected table is readable and
writable by anyone who opens the browser console.

## 3. Wire up Google sign-in  ·  ~5 min

This is the fiddliest step, because two consoles have to agree on one URL.

1. In Supabase: **Authentication → Sign In / Providers → Google**. Leave it
   open; you need the **Callback URL** it shows you, which looks like
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In <https://console.cloud.google.com>: create a project, then
   **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - **Authorised redirect URIs**: paste the Supabase callback URL from step 1,
     exactly, including `https://`
3. Copy the **Client ID** and **Client secret** back into the Supabase Google
   provider, and enable it.
4. In Supabase, **Authentication → URL Configuration**:
   - **Site URL**: `https://honey-hole-one.vercel.app`
   - **Redirect URLs**: add both
     - `https://honey-hole-one.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback`

That last one is what lets sign-in work when you run `npm run dev`. Without it
Supabase refuses the redirect and you get a confusing error with no clue as to
why.

> Email sign-in links need no setup at all — they work the moment the project
> exists. Supabase's built-in mail server is rate limited to a handful of
> messages an hour, which is fine for now. If sign-in links start arriving
> slowly, that limit is why, and the fix is to plug in a real SMTP provider
> under **Authentication → Emails**.

## 4. Feedback email  ·  ~2 min

1. Sign up at <https://resend.com> and create an **API key**.
2. Without a verified domain, Resend only sends *from* `onboarding@resend.dev`
   and only *to* the address you signed up with. That is enough to start.
3. Later, verifying a domain lets it send from your own address.

Feedback is written to the `feedback` table whether or not email is configured,
so nothing is ever lost if a key expires. The email is a convenience on top.

## 5. Environment variables

Locally, create `.env.local` in the project root (it is gitignored — never
commit it):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the publishable or anon key>

# Optional. Feedback still saves to the database without these.
RESEND_API_KEY=<resend key>
FEEDBACK_TO_EMAIL=<your email>
```

Both Supabase values are in **Project Settings → API**. The publishable/anon
key is *meant* to be public — it is compiled into the JavaScript the browser
downloads. Row Level Security, not secrecy, is what protects the data. The
**service role** key is the opposite: it bypasses every policy. It is not used
anywhere in this app, and it must never appear in a `NEXT_PUBLIC_` variable.

Then add the same variables in Vercel: **Project → Settings → Environment
Variables**, ticking Production, Preview and Development. Redeploy afterwards —
`NEXT_PUBLIC_` values are baked in at build time, so an existing deployment will
not pick them up.

---

## Checking it works

```bash
npm run dev
```

1. **Header** shows "Sign in".
2. Sign in with Google, and with an emailed link, in a private window.
3. Open a lake. There is now a **Water reports** section with a
   "Report conditions" button.
4. Post a report with a water temperature.
5. Reload. The **Water** stat at the top now reads **Water (reported)** with
   your number, instead of **Water (est.)**.
6. Sign out. The reports are still readable — for three lakes, then it asks
   for an account.

If step 5 does not happen, the report was saved but is older than 24 hours, or
the page cache has not turned over. Posting calls `revalidatePath`, so it
should be immediate.

## Things worth knowing

**Where the free/paid line lives.** One file: [`src/lib/access.ts`](src/lib/access.ts).
`GATE.freeLakeReportViews` is how many lakes a signed-out visitor may read
reports on. `GATE.gateLakePages` would put a wall in front of the lake pages
themselves — it is off, and the comment there explains what turning it on
would cost.

**Moderation.** `water_reports.hidden_at` hides a row from everyone but its
author without destroying it. Set it from the Supabase table editor. There is
no admin UI yet; with this many users the table editor is enough.

**Deleting someone's data.** Deleting a user in **Authentication → Users**
cascades to their profile and every report they wrote. Worth knowing before
somebody asks, because at that point they are entitled to a quick answer.

**Rate limiting.** Ten reports per person per day, enforced in the insert
policy rather than in the app, so it holds even if someone calls the API
directly.
