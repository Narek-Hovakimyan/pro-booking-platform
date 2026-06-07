# Production Deployment Checklist

> Use this checklist before and after deploying to production.

---

## 1. Environment Variables — Backend (`backend/.env`)

- [ ] `NODE_ENV=production` — disables debug routes, dev payment confirm, manual activation
- [ ] `PORT` — set to desired port (e.g. `5000`)
- [ ] `MONGO_URI` — valid MongoDB connection string
- [ ] `JWT_SECRET` — strong random secret generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] `CLIENT_URL` — production frontend origin(s), comma-separated
- [ ] `APP_PUBLIC_URL` — public URL of the backend
- [ ] `PAYMENT_PROVIDER=manual` or `disabled` — **never** `mock` or `test` in production
- [ ] `RATE_LIMIT_ENABLED=true` — enabled outside test environment
- [ ] `RATE_LIMIT_*` — tune limits for production traffic patterns
- [ ] `TRUST_PROXY=true` — only if behind a trusted reverse proxy (nginx, Render, Railway, etc.)
- [ ] `EMAIL_VERIFICATION_LOG_URL=false` — disable in production
- [ ] Scheduler flags — only enable those needed (all `false` by default)

### Scheduler flags (opt-in)

| Flag | Purpose |
|---|---|
| `ENABLE_BOOKING_REMINDERS` | Automatic booking reminders |
| `ENABLE_WAITLIST_EXPIRATION` | Past-date waitlist expiration |
| `ENABLE_SUBSCRIPTION_EXPIRATION_CRON` | Expire ended subscriptions |
| `ENABLE_CLEANUP_NON_WORKING_DAYS_CRON` | Nightly cleanup of past non-working days |
| `ENABLE_EXPIRE_PENDING_BOOKINGS_CRON` | Expire past pending bookings |
| `ENABLE_EVENT_REMINDERS_CRON` | Event reminders |

---

## 2. Environment Variables — Frontend (`frontend/.env`)

> ⚠️ All `VITE_*` variables are baked into the production bundle at build time.

- [ ] `VITE_API_URL` — backend API base URL (e.g. `https://api.example.com/api`)
- [ ] `VITE_SOCKET_URL` — Socket.IO server URL (e.g. `https://api.example.com`)
- [ ] `VITE_API_ORIGIN` — backend origin for media URLs (e.g. `https://api.example.com`)

---

## 3. Database

- [ ] MongoDB is running and accessible from the backend
- [ ] Connection string uses credentials if required (Atlas: `mongodb+srv://user:pass@...`)
- [ ] Database is backed up before deployment
- [ ] Backup strategy is in place (automated snapshots, mongodump, etc.)
- [ ] Indexes are created (Mongoose syncs indexes on startup)
- [ ] Storage size is sufficient (uploads, booking data, etc.)

---

## 4. Security

- [ ] `JWT_SECRET` is a strong random value
- [ ] Debug routes are disabled (`NODE_ENV=production`)
- [ ] Mock/test payment providers are blocked in production (throws 403)
- [ ] Dev payment confirmation endpoint is disabled (returns 403)
- [ ] Manual activation endpoint is disabled
- [ ] `CLIENT_URL` is set to restrict CORS
- [ ] `.env` files are **not** committed
- [ ] `backend/uploads/` is **not** committed (in `.gitignore`)
- [ ] All `node_modules/` and `dist/` are in `.gitignore`
- [ ] `X-Powered-By` header is disabled
- [ ] Security headers are set:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production only)
- [ ] Rate limiting is enabled
- [ ] Upload directory static middleware is configured safely:
  - `dotfiles: "deny"`
  - `fallthrough: false`
  - `index: false`

---

## 5. Uploads

- [ ] `backend/uploads/` directory exists and is writable
- [ ] Subdirectories exist: `avatars`, `certifications`, `events`, `certificate-files`, `portfolio`
- [ ] For multi-instance deployments: shared filesystem (NFS/EFS) mounted at `backend/uploads/` **or** object storage configured
- [ ] Upload size limits are appropriate (configured in `uploadMiddleware.js`)
- [ ] Booking reference images are protected (served only through authorized routes)

---

## 6. Payments

- [ ] `PAYMENT_PROVIDER` is `manual` or `disabled` — **not** `mock` or `test`
- [ ] Real payment provider is **not** integrated yet. Deposit bookings remain `depositStatus=pending`
- [ ] No real money is charged. Pending deposits are not counted as paid revenue
- [ ] Payment webhook route uses `express.raw()` for signature verification readiness
- [ ] When integrating a real provider: implement `createPaymentIntent`, `verifyWebhookSignature`, and `parseWebhookEvent` in a new provider class

---

## 7. Cron / Schedulers

- [ ] Only enabled schedulers are active (all `false` by default)
- [ ] Each scheduler runs on its configured interval
- [ ] Scheduler logs are visible in application output at startup
- [ ] Booking reminder scheduler does not send duplicate reminders
- [ ] Subscription expiration cron does not expire active subscriptions prematurely

---

## 8. Deployment

### Backend

- [ ] `npm ci` — clean install from lockfile
- [ ] `npm test` — all 1,228+ tests pass (requires local MongoDB)
- [ ] `npm start` — starts the server on the configured port
- [ ] Process manager is configured (systemd, PM2, supervisor, etc.) for auto-restart
- [ ] Health check endpoint (`GET /api/health`) is accessible

### Frontend

- [ ] `VITE_*` variables are set before build
- [ ] `npm ci` — clean install from lockfile
- [ ] `npm run lint` — passes
- [ ] `npm run build` — produces `dist/` directory
- [ ] Static files in `dist/` are served by web server (nginx, Caddy, Cloudflare Pages, etc.)
- [ ] SPA fallback is configured: `try_files $uri /index.html`

### Reverse Proxy (nginx example)

```nginx
# Backend API
location /api/ {
  proxy_pass http://localhost:5000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_cache_bypass $http_upgrade;
}

# Socket.IO
location /socket.io/ {
  proxy_pass http://localhost:5000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_cache_bypass $http_upgrade;
}

# Uploaded files
location /uploads/ {
  proxy_pass http://localhost:5000;
  proxy_cache_bypass $http_upgrade;
}

# Frontend SPA
location / {
  root /var/www/app/dist;
  try_files $uri /index.html;
}
```

---

## 9. Post-Deploy Smoke Tests

- [ ] Backend health check: `GET /api/health` returns 200
- [ ] Client registration and login works
- [ ] Barber registration and login works
- [ ] Public salon booking page loads at `/salons/:salonId/book`
- [ ] Booking creation succeeds (select barber → service → date/time → confirm)
- [ ] Deposit notice appears if selected barber has deposit enabled
- [ ] Promo/voucher code validates during booking
- [ ] Salon dashboard loads with correct data
- [ ] Salon calendar shows bookings
- [ ] Salon reports show revenue and analytics
- [ ] Subscription billing page loads
- [ ] Messages load and send/receive works
- [ ] Avatar/profile photo upload works
- [ ] Notifications appear (if applicable)
- [ ] Rate limiting returns 429 on excessive requests
- [ ] Debug routes return 404 in production (`/api/debug/me` → 404)
- [ ] Mock payment provider returns 403 (`PAYMENT_PROVIDER=mock` → throws at startup)

---

## 10. Version Control

- [ ] `package-lock.json` is committed (reproducible installs)
- [ ] `.env` files are NOT committed
- [ ] `node_modules/` is NOT committed
- [ ] `backend/uploads/` is NOT committed
- [ ] `frontend/dist/` is NOT committed
- [ ] Sensitive secrets never appear in git history

---

## 11. Monitoring & Maintenance

- [ ] Application logs are collected (stdout, log files, or log aggregation service)
- [ ] MongoDB is monitored (connection count, query performance, disk usage)
- [ ] Disk space is monitored (uploads directory can grow large)
- [ ] SSL/TLS certificates are configured and auto-renewing
- [ ] Backup strategy is tested (database + uploads)
- [ ] Security updates are applied regularly (OS, Node.js, npm packages)

---

## 12. Backup Recommendations

| Asset | Method | Frequency |
|---|---|---|
| MongoDB | `mongodump` or Atlas snapshots | Daily |
| Uploads | File backup or S3 sync | Daily |
| `.env` files | Encrypted backup (excluded from git) | After every change |
| SSL certificates | Certbot auto-renewal or provider-managed | Auto |
