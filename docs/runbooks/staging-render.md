# Staging on Render's free plan, step by step

From nothing to signing in to staging with the fake demo hospital, on Render's free plan. Staging is a copy of production with fake data only: hospital staff try a normal day on it. Never put a real patient on it.

Claude Code wrote this guide and the files it uses (`render.yaml`, `.github/workflows/staging-deploy.yml`), but nothing here has been run on a real account: the first run is the developer's. Allow two to three hours. The other way to run staging, on a server of our own, is [staging-oracle-cloud.md](staging-oracle-cloud.md).

## What staging uses

| Piece | Choice | Cost |
| --- | --- | --- |
| App and API | Render free web services, Singapore | Free. Render signs in with GitHub and asks for no card |
| Database | Supabase free plan, Mumbai, its own project | Free. A free project pauses after a week without use |
| DNS | Cloudflare free plan, DNS only at first | Free |
| Domain | A separate domain only for staging | About Rs 700 to 1,000 a year, bought by the developer |
| Migrations and demo data | The "Deploy staging" GitHub workflow | Free within GitHub's monthly minutes |

### What the free plan means (from Render's documentation)

- **Sleeping:** each service sleeps after 15 minutes without visitors, and the next visitor waits about a minute while it wakes. The first person in the morning sees a loading page.
- **The midnight job:** room and nursing charges do not post at midnight while the API sleeps. Billing still comes out right:
  - the API posts every missed night as soon as it wakes
  - "Prepare final bill" posts any day still missing before it bills
- **Hours:** 750 free hours a month for the whole Render account, shared by the two services. Sleeping services use none, so light testing stays inside it. Heavy all-day use could run out late in the month.
- **Small:** 512 MB of memory and a tenth of a processor per service. Screens are slower than they will be in production.
- **No shell or one-off tasks.** That is why migrations and demo data run from GitHub instead.
- **Singapore:** Render has no Indian region. That is acceptable for fake data only. Production stays in India (CLAUDE.md section 3).

### Two staging-only choices (docs/decisions.md)

- **The database is reachable from any address.** Render's free plan and GitHub's runners have no fixed addresses, so Supabase cannot be limited to one. Strong passwords and encrypted connections protect it. Never do this for production.
- **Cloudflare does DNS only** (grey cloud) at first. Render issues the HTTPS certificate itself.

### Why a separate domain

Session cookies are set for the parent domain shared by `app.` and `api.`. Render's own `onrender.com` addresses cannot share cookies, so sign-in would fail on them. A subdomain of production's domain would mix staging and production cookies. So staging gets its own domain, for example `myhospital-staging.in`, written `<staging-domain>` below.

## 1. The domain and Cloudflare

1. Buy `<staging-domain>` at any registrar.
2. Add it to Cloudflare (free plan) and change the registrar's name servers to the two Cloudflare gives.
3. Wait until Cloudflare shows it as active. The records come in step 6.

## 2. The staging database

Follow [supabase.md](supabase.md) for a **new project used only for staging**:
- name `hms-staging`
- region South Asia (Mumbai)
- a generated database password
- **Enforce SSL** on

Skip its network restrictions section: as above, staging cannot use them.

From the project's **Connect** button, **Session pooler** tab (port 5432), copy the connection string. It looks like this:

```
postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres
```

Staging uses three logins on that same address:

| Name | User in the address | Password | Made by |
| --- | --- | --- | --- |
| `DIRECT_URL` (the owner) | `postgres.<project-ref>` | The Supabase database password | Supabase |
| `DATABASE_URL` (the API) | `hms_app.<project-ref>` | A new one you generate | The deploy workflow |
| `JOBS_DATABASE_URL` (background jobs) | `hms_jobs.<project-ref>` | Another new one you generate | The deploy workflow |

Make each new password on your own computer. In Git Bash or a Linux or Mac terminal, run this twice:

```bash
openssl rand -hex 24
```

Hex keeps the password free of characters that need escaping in an address. Add `?sslmode=require` to the end of all three addresses.

## 3. Render

1. Sign up at Render with your GitHub account, and allow it to read the `DevMSR-HMS-` repository.
2. **New, Blueprint**: choose the repository and the `main` branch. Render reads `render.yaml` and shows two services, `hms-api-staging` and `hms-web-staging`, both free, in Singapore.
3. Render asks for the values marked secret in `render.yaml`:

| Service | Setting | Value |
| --- | --- | --- |
| API | `CORS_ORIGINS` | `https://app.<staging-domain>` |
| API | `COOKIE_DOMAIN` | `.<staging-domain>` (with the leading dot) |
| API | `DATABASE_URL` | The `hms_app` address from step 2 |
| API | `JOBS_DATABASE_URL` | The `hms_jobs` address from step 2 |
| API | `FIELD_ENCRYPTION_KEY` | A new random key: `openssl rand -base64 32`. Keep a copy somewhere safe: losing it loses every Aadhaar and ABHA number |
| Web | `NEXT_PUBLIC_API_URL` | `https://api.<staging-domain>/api/v1` |
| Web | `API_INTERNAL_URL` | `https://api.<staging-domain>/api/v1` |

Render makes `SESSION_SECRET` itself. Everything else is already in `render.yaml`. Create the Blueprint.

4. Render builds both services once. The API's first start may fail because the database has no tables yet: that is expected, and the first workflow run fixes it.
5. For each service: **Settings, Deploy Hook**, copy the URL. Keep both secret: anyone with one can start a deploy.

## 4. GitHub's staging environment

In the repository: **Settings, Environments, New environment**, named exactly `staging`. Add these **environment secrets**:

| Secret | Value |
| --- | --- |
| `DIRECT_URL` | The owner address from step 2 |
| `DATABASE_URL` | The `hms_app` address, the same as on Render |
| `JOBS_DATABASE_URL` | The `hms_jobs` address, the same as on Render |
| `FIELD_ENCRYPTION_KEY` | The same key as on Render |
| `SEED_USER_PASSWORD` | A password for every demo user, 12 or more characters. Staging is on the internet |
| `RENDER_API_DEPLOY_HOOK` | The API's deploy hook from step 3 |
| `RENDER_WEB_DEPLOY_HOOK` | The web app's deploy hook from step 3 |

Optionally, under the environment's **Deployment protection rules**, add yourself as a required reviewer, so every staging deploy waits for your click.

## 5. The first release

Releases are tags on `main`. On your own machine, from an up-to-date `main`:

```bash
git tag v0.1.0
```

```bash
git push origin v0.1.0
```

Then in GitHub: **Actions, Deploy staging, Run workflow**, from the `main` branch:
- **tag:** `v0.1.0`
- **Load (or refresh) the fake demo hospital:** ticked, this first time

The workflow takes a few minutes, in this order:
1. checks the tag is on `main`
2. applies the migrations
3. creates the `hms_app` and `hms_jobs` logins with your passwords
4. syncs the roles
5. loads the demo hospital: staff for every role, wards, beds, demo rates and 50 fake patients
6. tells Render to deploy exactly that commit

Watch the two services in Render until each shows **Live**.

Then run `deploy/sql/supabase-lockdown.sql` in Supabase's SQL editor ([supabase.md](supabase.md), section 2).

## 6. Your domain on Render

1. In Render, for `hms-web-staging`, go to **Settings, Custom Domains** and add `app.<staging-domain>`. For `hms-api-staging`, add `api.<staging-domain>`. Render shows a target for each, ending in `onrender.com`.
2. In Cloudflare DNS, add a **CNAME** for `app` and one for `api`, each to its Render target, with the proxy **off** (grey cloud, "DNS only").
3. Back in Render, **Verify** each domain. Render then issues the HTTPS certificates, which can take a few minutes.

## 7. Sign in

Open `https://app.<staging-domain>`. The first visit after a quiet spell shows Render's loading page for about a minute.

- **Usernames:** `reception`, `doctor`, `nurse`, `billing`, `cashier`, `md`, `accounts`, `admin` (all in `prisma/seed-data.ts`), with the `SEED_USER_PASSWORD` you chose.
- **Two-factor:** `admin`, `accounts` and `superadmin` set it up at their first sign-in, with an authenticator app on a phone.

**Check the client address once.** Sign in, open **My account**, and check that "Where you are signed in" shows your own public IP address. If it shows a Render address instead, set `TRUST_PROXY` on the API to `2` and redeploy. Sign-in limits count per address, so this matters.

## Later releases

1. Tag a new version on `main` and push the tag.
2. Run **Deploy staging** with it. Leave the demo hospital box unticked unless you want to refresh the demo data; refreshing updates it in place.

To go back to an earlier release, run the workflow with the earlier tag. Migrations never run backwards, so a migration must keep the release before it working ([deploy-and-rollback.md](deploy-and-rollback.md), "Migrations and rollback").

## When something goes wrong

| What you see | Usual cause |
| --- | --- |
| The workflow stops at "Check the tag" | The tag is not on `main`, or is not like `v0.1.0` |
| "The staging environment has no secret ..." | A secret is missing or misspelt in step 4, or the environment is not named exactly `staging` |
| Migrations fail to connect | The address is wrong, the Supabase project is paused (resume it in Supabase), or `?sslmode=require` is missing |
| The API on Render keeps restarting | The service's **Logs** tab in Render says why. Most often a database address, `FIELD_ENCRYPTION_KEY` not being 32 random bytes in base64, or the first workflow run not done yet |
| Sign-in fails, or works and then forgets you | `COOKIE_DOMAIN` is not `.<staging-domain>`, or the app is opened on its `onrender.com` address instead of `app.<staging-domain>` |
| The app page loads but every screen says it cannot load | `NEXT_PUBLIC_API_URL` or `API_INTERNAL_URL` is wrong. A change to `NEXT_PUBLIC_API_URL` needs a new deploy, because it is built into the browser bundle |
| "Your free instance hours are used up" | The account used its 750 hours this month: wait for next month, or move one service to a paid plan |
| A screen takes about a minute the first time | The service was asleep. Expected on the free plan |
