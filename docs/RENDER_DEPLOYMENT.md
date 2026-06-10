# Render Deployment Guide

> Deploy HairBook to production using **Render** (backend Web Service + frontend Static Site) + **MongoDB Atlas**.

---

## 1. Overview

This guide covers deploying the full HairBook stack:

| Component | Platform | Type |
|---|---|---|
| Backend (Node.js/Express + Socket.IO) | Render | Web Service |
| Frontend (React + Vite) | Render | Static Site |
| Database | MongoDB Atlas | M0 Free Cluster |
| File storage | Render persistent disk | Local filesystem |

---

## 2. MongoDB Atlas — Production Database

### Create Cluster

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and log in.
2. Create a new project (e.g., `HairBook Production`).
3. Build a **M0 Free Cluster** in `eu-central-1` (Frankfurt) — closest region to Armenia (UTC+4) for lowest latency.
4. Wait for cluster provisioning (~3–5 minutes).

### Create Database User

1. Under **Security → Database Access**, add a new user:
   - Username: `hairbook-prod`
   - Password: generate a strong 32-char password (store in password manager)
   - Built-in Role: `Read and Write to any database`
2. Click **Add User**.

### Network Access

1. Under **Security → Network Access**, add an IP whitelist entry.
   - For Render: use `0.0.0.0/0` (allow all — MongoDB authentication still protects the data).
   - For stricter security after launch, get Render's egress IP(s) from [Render's docs](https://render.com/docs/static-outbound-ip-addresses).

### Create Database

1. Click **Browse Collections** → **Add My Own Data**.
2. Database name: `hairbook-prod`
3. Collection name: (leave empty — Mongoose will create collections automatically)

### Get Connection String

1. Click **Connect** → **Connect your application**.
2. Copy the connection string:
   ```
   mongodb+srv://hairbook-prod:<password>@cluster0.xxxxx.mongodb.net/hairbook-prod?retryWrites=true&w=majority
   ```
3. Replace `<password>` with the user password you created.
4. Save this for the backend env vars.

> ⚠️ **Important:** The database name in the URI (`hairbook-prod`) must match the database you created. This keeps production data **completely separate** from your development database.

---

## 3. Render — Backend Web Service Setup

### Option A: Root Directory = `backend` (recommended)

| Setting | Value |
|---|---|
| **Type** | Web Service |
| **Name** | `hairbook-api` |
| **Region** | `Frankfurt (EU Central)` |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm ci` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |
| **Instance Type** | Starter ($7/mo) |
| **Auto-Deploy** | `Yes` |

When using `Root Directory: backend`, the working directory (`process.cwd()`) inside the container will be the `backend/` directory. This means:
- `process.cwd()` = `/opt/render/project/src/backend` (or similar)
- Uploads will be stored at `<cwd>/uploads/`
- `npm start` runs `node src/server.js` relative to `backend/`

### Option B: Root Directory = repo root (alternative)

| Setting | Value |
|---|---|
| **Root Directory** | (leave empty / repo root) |
| **Build Command** | `cd backend && npm ci` |
| **Start Command** | `cd backend && npm start` |

When using repo root, `process.cwd()` will be the repo root directory. Uploads will be stored at `<repo-root>/uploads/`. Adjust persistent disk mount accordingly.

> ✅ **Both options work.** Option A is simpler because `npm start` and `npm ci` run naturally in the `backend/` context.

### Health Check

Render will ping `GET /api/health` periodically. The endpoint returns `"API is running"` with HTTP 200.

### Node Version

Render automatically detects the Node.js version from `package.json` `engines` field (if set) or uses the latest LTS. The project currently does not specify an `engines` field — this is fine for first launch.

---

## 4. Render — Frontend Static Site Setup

| Setting | Value |
|---|---|
| **Type** | Static Site |
| **Name** | `hairbook-app` |
| **Region** | `Frankfurt (EU Central)` |
| **Branch** | `main` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm ci && npm run build` |
| **Publish Directory** | `dist` |
| **Auto-Deploy** | `Yes` |

> ⚠️ **Critical:** When `Root Directory` is `frontend`, the **Publish Directory** must be `dist` (NOT `frontend/dist`). Render runs the build from inside the `frontend/` directory, so the output is at `frontend/dist/` relative to repo root, but just `dist` from Render's perspective.

### SPA Routing

Render Static Sites automatically handle SPA fallback (serving `index.html` for all routes). No additional configuration is needed for React Router client-side routing.

---

## 5. Backend Environment Variables

Set these in the Render dashboard under **Environment** for the `hairbook-api` Web Service:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Disables debug routes, blocks mock/test payment, enables HSTS |
| `PORT` | `5000` | Render sets this automatically via `process.env.PORT` |
| `MONGO_URI` | `mongodb+srv://hairbook-prod:<password>@<cluster>.mongodb.net/hairbook-prod?retryWrites=true&w=majority` | Replace with your Atlas connection string |
| `JWT_SECRET` | `<random 64-char hex string>` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLIENT_URL` | `https://hairbook-app.onrender.com` | The frontend URL — used for CORS and Socket.IO origin |
| `APP_PUBLIC_URL` | `https://hairbook-api.onrender.com` | Public backend URL |
| `TRUST_PROXY` | `true` | Required behind Render's reverse proxy |
| `PAYMENT_PROVIDER` | `manual` | See payment mode section below |

### Rate Limiting (optional tuning)

| Variable | Default | Notes |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Leave enabled for production |
| `RATE_LIMIT_AUTH_MAX` | `20` | Max auth requests per 15 min |
| `RATE_LIMIT_PUBLIC_MAX` | `120` | Max public requests per 15 min |
| `RATE_LIMIT_UPLOAD_MAX` | `40` | Max upload requests per 15 min |
| `RATE_LIMIT_PAYMENT_MAX` | `60` | Max payment requests per 15 min |

### Cron / Scheduler Flags

See [Cron Flags for First Launch](#8-cron-flags-for-first-launch) below.

---

## 6. Frontend Environment Variables

Set these in the Render dashboard under **Environment** for the `hairbook-app` Static Site:

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://hairbook-api.onrender.com/api` | Backend API base URL |
| `VITE_SOCKET_URL` | `https://hairbook-api.onrender.com` | Socket.IO server URL |
| `VITE_API_ORIGIN` | `https://hairbook-api.onrender.com` | Backend origin for media/image URLs |

> ⚠️ **Important:** All `VITE_*` variables are **baked into the JavaScript bundle at build time**. To change them, you must trigger a new build on Render. They do not refresh at runtime.

---

## 7. Uploads / Persistent Disk

### Exact Upload Path Used by the Code

The backend code uses `process.cwd()` as the base for all upload directories. With **Option A** (Root Directory = `backend`), `process.cwd()` resolves to Render's working directory for the Web Service.

The following subdirectories are used by the code:

| Directory | Path | Served Publicly? |
|---|---|---|
| Avatars | `<cwd>/uploads/avatars` | ✅ Yes — `/uploads/avatars/` |
| Certifications | `<cwd>/uploads/certifications` | ✅ Yes — `/uploads/certifications/` |
| Events | `<cwd>/uploads/events` | ✅ Yes — `/uploads/events/` |
| Certificate files | `<cwd>/uploads/certificate-files` | ✅ Yes — `/uploads/certificate-files/` |
| Portfolio | `<cwd>/uploads/portfolio` | ✅ Yes — `/uploads/portfolio/` |
| Booking references | `<cwd>/uploads/booking-references` | ❌ **No — private** (served via authenticated routes) |

Booking reference images are **not** listed in the static file serving configuration in `server.js`. They are served through authenticated booking controller routes that verify user authorization and include path traversal protection.

### Persistent Disk Setup

1. In your `hairbook-api` Web Service dashboard, scroll to **Persistent Disk**.
2. Click **Add Persistent Disk**.
3. **Name**: `hairbook-uploads`
4. **Mount Path**: (leave as default — the disk will mount to the service's working directory)
5. **Size**: Start with **1 GB** (sufficient for hundreds of users)
6. **Save**.

Render persistent disks survive restarts and redeploys. Files uploaded before a redeploy will persist.

> ⚠️ **Note:** The persistent disk must be mounted at the path where `process.cwd()` resolves. With Root Directory = `backend`, this is inside the backend working directory. The exact mount path depends on Render's internal structure — Render will suggest the correct mount path.

### When to Move to S3 / Cloudinary

Local filesystem storage is acceptable for the first launch but has limitations:

| Limitation | When It Becomes a Problem | Solution |
|---|---|---|
| Single instance only | When you need 2+ backend instances for scaling | Move to S3/Cloudinary |
| Disk space (1 GB) | When uploads exceed ~500 users with images | Upgrade disk or move to cloud |
| No CDN | Slower image delivery for distant users | Cloudinary/CloudFront |
| Backup complexity | When uploads become business-critical | S3 lifecycle policies |

**Plan to migrate when:**
- Active users exceed ~500, or
- You deploy 2+ backend instances, or
- Uploads directory exceeds 500 MB

---

## 8. Payment / Deposit Mode

### Safe Production Value

**Set `PAYMENT_PROVIDER=manual`** (or `disabled`).

| Provider | Production Behavior | Safe? |
|---|---|---|
| `manual` | Returns `manual_activation_required`. No money charged. | ✅ **Default, safe** |
| `disabled` | Returns `paymentDisabled: true`. No money charged. | ✅ **Safe** |
| `mock` | **Throws 403** — blocked in production. | ❌ Blocked by code |
| `test` | **Throws 403** — blocked in production. | ❌ Blocked by code |

> ⚠️ **Never set `PAYMENT_PROVIDER=mock` or `PAYMENT_PROVIDER=test` in production.** The application code explicitly throws a 403 error with code `PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION` if detected.

### Deposit Behavior

With `PAYMENT_PROVIDER=manual`:

1. Barber enables deposit settings for their services.
2. Client sees a deposit notice during booking flow.
3. Booking is created with `depositStatus: "pending"` and `paymentStatus: "pending"`.
4. **No real money is charged.**
5. When a real payment provider is integrated later:
   - Deposit-required bookings will transition from pending to requiring actual payment before confirmation.
   - The `createPaymentIntent` method will replace the current manual stub.

---

## 9. Cron Flags for First Launch

Set these environment variables on the backend service:

### Enable Immediately

```env
ENABLE_CLEANUP_NON_WORKING_DAYS_CRON=true    # Clean up past non-working days nightly
ENABLE_EXPIRE_PENDING_BOOKINGS_CRON=true      # Expire abandoned pending bookings
```

These two are safe to enable from day one and prevent data accumulation.

### Disable Initially (set to `false` or omit)

```env
ENABLE_BOOKING_REMINDERS=false               # Requires email provider (Resend) setup
ENABLE_WAITLIST_EXPIRATION=false             # Waitlist not critical for first launch
ENABLE_SUBSCRIPTION_EXPIRATION_CRON=false    # Subscriptions are manual-only initially
ENABLE_EVENT_REMINDERS_CRON=false            # Events not critical for first launch
```

### In-Code Schedulers (not flag-gated at server.js level)

These three schedulers start automatically when the server starts:

- `startBookingReminderScheduler()`
- `startWaitlistExpirationScheduler()`
- `startSubscriptionExpirationScheduler()`

Each one internally checks its env flag (e.g., `ENABLE_WAITLIST_EXPIRATION !== "true"`) and exits immediately if the flag is not set. They are safe to leave running — they simply iterate every interval and skip processing.

> ⚠️ If you run multiple backend instances, these schedulers could fire duplicate processing. For first launch with a single instance, this is not a concern. For scaling later, add a distributed lock or use Render's cron jobs instead.

---

## 10. Post-Deploy Smoke Test Checklist

After both services are deployed, verify each item:

### Backend Health
- [ ] `GET https://hairbook-api.onrender.com/api/health` returns HTTP 200 with `"API is running"`
- [ ] Backend logs show `MongoDB connected: .../hairbook-prod`

### Authentication
- [ ] `POST /api/auth/register` with client credentials returns 201
- [ ] `POST /api/auth/register` with barber credentials returns 201
- [ ] `POST /api/auth/login` returns JWT token
- [ ] Login with invalid credentials returns 401

### Public Endpoints
- [ ] `GET /api/salons` returns salon list
- [ ] Public booking page loads at `https://hairbook-app.onrender.com/salons/:salonId/book`
- [ ] No CORS errors in browser console

### Booking
- [ ] Create booking: select barber → service → date/time → confirm → 201
- [ ] Deposit notice appears if barber has deposit enabled
- [ ] Booking appears in barber's dashboard

### Salon Dashboard
- [ ] Barber logs in, dashboard loads with correct data
- [ ] Calendar shows bookings
- [ ] Reports show revenue/analytics (even if zero)

### Socket.IO
- [ ] Real-time notifications appear (booking confirmed, new message, etc.)
- [ ] Messages send and receive in real-time

### Uploads
- [ ] Avatar upload succeeds and image loads on profile
- [ ] Portfolio images upload and display
- [ ] Booking reference images upload during booking creation

### Security
- [ ] `GET /api/debug/me` returns **404** (disabled in production)
- [ ] Request from unauthorized origin returns 403
- [ ] Excessive login attempts return 429 (`RATE_LIMIT_AUTH_MAX`)
- [ ] HTTPS is enforced (Render handles this automatically)

### Subscription / Billing
- [ ] Subscription settings page loads
- [ ] Payment history page shows data (even if empty)

---

## 11. Common Mistakes

### ❌ Publish Directory = `frontend/dist` when Root Directory = `frontend`

When Root Directory is `frontend`, Render runs the build inside the `frontend/` directory. The output `dist/` folder is at `frontend/dist/` relative to repo root, but Render sees it as `dist`. **Set Publish Directory to `dist`.**

### ❌ Forgetting `TRUST_PROXY=true`

Without this, Express behind Render's proxy may see incorrect client IP addresses. Rate limiting and IP-based features will not work correctly.

### ❌ Using `NODE_ENV=development` in production

Debug routes (`/api/debug/*`) will be accessible, and payment provider mock/test modes will be enabled. Always set `NODE_ENV=production`.

### ❌ Weak `JWT_SECRET`

Using `your_secret_key_158` or other guessable strings. Generate a strong random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### ❌ Forgetting to enable health check

Render needs a health check path to detect if the service is running. Set it to `/api/health`.

### ❌ Setting `PAYMENT_PROVIDER=mock` in production

The code throws a 403 error, but the confusion is unnecessary. Use `manual` or `disabled`.

### ❌ Not mounting persistent disk

Without a persistent disk, all uploaded files are **lost on every deploy or restart**. Uploaded avatars, portfolio images, booking reference images will disappear.

### ❌ Localhost `MONGO_URI` in production

The backend will fail to start with `MongoDB connection failed` if `MONGO_URI` points to `localhost` or contains `127.0.0.1`. Use the MongoDB Atlas connection string.

### ❌ Wrong CORS origin

If `CLIENT_URL` does not match the actual frontend URL, all browser API calls will fail with CORS errors. Verify the exact frontend URL (with `https://` and no trailing slash).

### ❌ Rebuilding frontend without setting env vars

Frontend `VITE_*` variables are baked into the build. If you change them, you must trigger a new frontend build on Render. Simply redeploying the backend is not sufficient.

---

## 12. Redeploy After Changes

### Backend changes
Push to `main` → Render auto-deploys the Web Service. Uploads on persistent disk survive the redeploy.

### Frontend changes
Push to `main` → Render auto-deploys the Static Site. The old build is replaced.

### Env var changes
Update in the Render dashboard → **Manual Deploy** → **Clear build cache & deploy** (for static sites) or **Deploy latest commit** (for web services).

### MongoDB changes (indexes, schema changes)
Mongoose syncs indexes on backend startup. For schema changes, deploy the backend first, then check for any migration needs.
