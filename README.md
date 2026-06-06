# HairBook — Pro Booking Platform

A full-stack SaaS application for salon and barber appointment management. HairBook connects clients with barbers and salons, providing booking, messaging, reviews, portfolio, events, and a subscription-based access model.

**Roles:** Client | Barber | Salon Owner | Salon Admin  
**Monetization:** Individual barber subscriptions + salon seat subscriptions  
**Privacy model:** Staff vs. Chair Renter — owners see movement for staff only

---

## Tech Stack

### Frontend
| Library | Purpose |
|---|---|
| **React 19** | UI framework |
| **Vite 8** | Build tool / dev server |
| **Redux Toolkit** | State management |
| **React Router 7** | Client-side routing |
| **Tailwind CSS 3** | Utility-first styling |
| **Socket.IO Client** | Real-time messaging |
| **Axios** | HTTP client |
| **Lucide React** | Icons |

### Backend
| Library | Purpose |
|---|---|
| **Node.js** (>=18) | Runtime |
| **Express 5** | HTTP framework |
| **MongoDB** + **Mongoose 9** | Database / ODM |
| **jsonwebtoken** | JWT authentication |
| **Socket.IO 4** | Real-time WebSocket server |
| **bcrypt** | Password hashing |
| **multer** | File uploads |
| **node-cron** | Scheduled tasks |
| **node:test** (built-in) | Testing |
| **express-rate-limit** | Rate limiting |
| **resend** | Email provider (optional) |

---

## Main Features

### Client
- Browse barbers with filters (city, service, specialty, price, rating)
- Browse salons
- **Public salon booking link** — `/salons/:salonId/book` (no login required)
- Book appointments (select barber → service → date/time → confirm)
- Manage own bookings (upcoming / past)
- Cancel or reschedule bookings
- Add barbers and salons to favorites
- **Favorites hide unpaid barbers** — expired/unauthorized barbers are hidden from favorites
- Send messages to barbers
- Leave reviews for completed bookings
- Leave salon reviews
- Join waitlist for unavailable barber/slots
- Register for barber events
- View event certificates (public verification page)
- Booking history and loyalty tracking

### Barber
- Manage personal profile, gallery, portfolio photos
- Manage certifications and uploaded certificates
- Manage services and packages (single, package with included services)
- Manage schedule per salon (weekly schedule, date overrides, non-working days)
- Accept / reject / complete / delay bookings
- View bookings in a calendar timeline (daily and monthly views)
- View revenue and client analytics
- Create events (with optional salon association, capacity, registration, certificates)
- Manage event registrations (approve, reject, waitlist, check-in)
- Issue event certificates (auto-generated or uploaded PDF)
- Manage waitlist entries (approve, reject, offer alternative times)
- Salon jobs management (post openings, review applications)
- Voucher/discount management
- Loyalty program management
- **Billing & subscription management**
- **Salon dashboard** (if owner/admin)
- **Salon calendar** (if owner/admin)
- **Salon billing** (if owner/admin — seat subscription management)
- Treatment records via booking outcomes

### Salon Owner / Admin
- Create and manage salon profile
- Membership management — approve/reject join requests
- Manage staff relationship type (`staff` vs. `chair_renter`)
- **Staff:** owner/admin can see booking, revenue, and calendar movement
- **Chair Renter:** independent barber — owner/admin cannot see private movement or metrics
- Relationship type management via Salon Settings
- Promote/demote salon admins
- Remove barbers from salon
- **Salon dashboard** — aggregated metrics, revenue, alerts, staff overview
- **Salon calendar** — unified view of all staff bookings
- **Salon billing** — manage seat subscription and seat assignments
- Public booking link configuration

### Subscription & Payment System
- **Individual barber subscription** — monthly plan with trial period
- **Salon seat subscription** — salon buys seats for staff barbers
- Models: `SubscriptionPlan`, `Subscription`, `SubscriptionSeat`, `PaymentRecord`, `SubscriptionPaymentAttempt`
- **Payment attempt lifecycle:** create payment intent → pending attempt → manual/dev confirm → activate subscription
- Payment history for individual barbers and salon subscriptions
- Renewal UX through manual confirmation flow
- **Paid access enforcement:**
  - `requireBarberSubscription` middleware blocks unpaid barbers from premium features (services, schedule, bookings, calendar, portfolio, waitlist, vouchers, clients, revenue)
  - Booking creation blocks unpaid barbers
  - Unpaid/expired/stale-seat barbers hidden from public booking and favorites
- **Subscription expiration scheduler** — background cron that marks expired subscriptions (opt-in via `ENABLE_SUBSCRIPTION_EXPIRATION_CRON`)
- Dev endpoints for granting/extending subscriptions and confirming payment attempts (disabled in production)

### Privacy & Business Rules
- **Staff members** (`relationshipType: "staff"` with `relationshipStatus: "accepted"`): salon owner/admin can see booking, revenue, and calendar data
- **Chair renters** (`relationshipType: "chair_renter"`): independent — owner/admin cannot see private movement
- Relationship type management exists in Salon Settings
- Unpaid/expired barbers are hidden from public discovery and favorites
- Confirmation flow for relationship type changes exists (pending/accepted/rejected)

### Events & Certificates
- Barbers create events (title, date, time, capacity, location, certificate settings)
- Clients register for events
- Organizer approves, rejects, or moves registrations to waitlist
- Organizer marks participants as attended (check-in)
- After event ends, organizer can issue certificates to attended participants
- Certificates can be auto-generated or uploaded as PDF files
- Public certificate verification page

### Waitlist
- Clients can join a waitlist when no slot is available
- Barber reviews and can offer alternative time slots
- Client accepts or declines the offered slot
- Past-date waitlist entries expire automatically (opt-in cron)
- Notifications sent for waitlist updates

---

## Important Routes

### Frontend Routes

| Route | Access | Description |
|---|---|---|
| `/` | public | Home (client) or redirect to `/admin` (barber) |
| `/register` | public | Registration |
| `/login` | public | Login |
| `/barbers` | client | Browse barbers |
| `/barbers/:barberId/profile` | client | Barber profile detail |
| `/salons` | client | Browse salons |
| `/salons/:salonId` | public | Salon profile |
| `/salons/:salonId/book` | public | **Public salon booking link** |
| `/booking/:barberId` | client | Book appointment with barber |
| `/my-bookings` | client | My bookings |
| `/my-waitlist` | client | My waitlist entries |
| `/favorites` | client | Favorites (barbers + salons) |
| `/profile` | client | Profile settings |
| `/messages` | any | Messages |
| `/messages/:userId` | any | Conversation with user |
| `/notifications` | any | Notifications |
| `/events` | any | Browse events |
| `/my-events` | any | My events (registrations or created) |
| `/certificates/:certificateId` | public | Certificate verification |
| `/jobs` | public | Salon job listings |
| `/jobs/applications` | barber | My job applications |
| `/admin` | barber | Dashboard |
| `/admin/services` | barber* | Services management |
| `/admin/schedule` | barber* | Schedule management |
| `/admin/bookings` | barber* | Bookings management |
| `/admin/clients` | barber* | Client list |
| `/admin/calendar` | barber* | Calendar view |
| `/admin/calendar/day/:date` | barber* | Calendar day detail |
| `/admin/portfolio` | barber* | Portfolio management |
| `/admin/waitlist` | barber* | Waitlist management |
| `/admin/jobs` | barber | Job postings management |
| `/admin/vouchers` | barber* | Voucher management |
| `/admin/revenue` | barber* | Revenue analytics |
| `/admin/profile` | barber | Profile settings |
| `/admin/settings` | barber | Settings |
| `/admin/settings/salon` | barber | Salon membership settings |
| `/admin/billing` | barber | Individual subscription billing |
| `/admin/salon/dashboard` | barber | Salon owner dashboard |
| `/admin/salon/calendar` | barber | Salon owner unified calendar |
| `/admin/salon/billing` | barber | Salon subscription billing |
| `/success` | client | Booking success page |

*\* Requires active subscription or salon seat*

### Backend API Groups

| Group | Base Path | Description |
|---|---|---|
| Auth | `/api/auth` | Register, login, email verification |
| Users | `/api/users` | User profile, barber listing |
| Barbers | `/api/barbers` | Barber profile, client-facing barber data |
| Salons | `/api/salons` | Salon CRUD, membership, staff, dashboard, calendar, public booking |
| Bookings | `/api/bookings` | Create, cancel, reschedule, outcomes, read |
| Services | `/api/services` | Barber services & packages |
| Service Categories | `/api/service-categories` | Service categories |
| Schedules | `/api/schedules` | Weekly schedule, date overrides, non-working days |
| Messages | `/api/messages` | Conversations, messages |
| Notifications | `/api/notifications` | User notifications |
| Reviews | `/api/reviews` | Barber reviews |
| Salon Reviews | `/api/salon-reviews` | Salon reviews |
| Favorites | `/api/favorites` | Barber & salon favorites |
| Events | `/api/events` | Events, registrations, certificates |
| Certificates | `/api/certificates` | Event certificate verification |
| Portfolio | `/api/portfolio` | Portfolio photos |
| Waitlist | `/api/waitlist` | Waitlist entries, offers |
| Subscriptions | `/api/subscriptions` | Plans, subscriptions, seats, payment attempts |
| Loyalty | `/api/loyalty` | Loyalty programs |
| Vouchers | `/api/vouchers` | Discount vouchers |
| Revenue | `/api/revenue` | Revenue analytics |
| Salon Jobs | `/api/salon-jobs` | Job postings, applications |
| Health | `/api/health` | Health check |
| Debug | `/api/debug` | Debug routes (development only) |

---

## Folder Structure

```
hairdressProject/
├── backend/
│   ├── src/
│   │   ├── config/              # DB connection, env helpers
│   │   ├── controllers/         # Route handlers
│   │   ├── middleware/          # Auth, rate limit, subscription enforcement, file upload
│   │   ├── models/              # Mongoose schemas (User, Booking, Service, Subscription, etc.)
│   │   ├── routes/              # Express routers
│   │   ├── services/            # Business logic
│   │   │   ├── payment/         # Payment provider abstraction ( ManualPaymentProvider, factory )
│   │   │   └── salon/           # Salon dashboard, calendar, membership, staff, relationship services
│   │   ├── utils/               # Helpers (schedule, booking, event, salon, media URLs, permissions)
│   │   └── server.js            # Express app entry point
│   ├── cron/                    # node-cron jobs (cleanup, event reminders, pending bookings)
│   ├── migrations/              # Data migration scripts
│   ├── scripts/                 # Utility scripts (grant grace subscriptions)
│   ├── uploads/                 # User-uploaded files (avatars, certifications, events, portfolio, certificates)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── client/              # Client-facing pages & components
│   │   │   ├── components/      # BarberCard, BookingCard, ReviewForm, filters, grids, booking wizard, waitlist
│   │   │   └── pages/           # BarbersPage, SalonsPage, HomePage, BookingPage, FavoritesPage, etc.
│   │   ├── barber/              # Barber dashboard pages & components
│   │   │   ├── components/      # ServicesManager, ScheduleManager, BookingsList, PortfolioManager, etc.
│   │   │   └── pages/           # AdminPage, BillingPage, SalonDashboardPage, SalonCalendarPage, etc.
│   │   ├── features/            # Feature modules (events, messages)
│   │   ├── shared/              # Shared UI, API client, hooks, utils, SubscriptionGuard
│   │   │   └── api/             # Axios client, API modules (subscriptions, salonDashboard, etc.)
│   │   ├── store/               # Redux store, slices, localStorage middleware
│   │   └── pages/               # Cross-role pages (Login, Register, Messages, Events, Certificates)
│   └── .env.example
└── README.md
```

### Key directories explained

- **`frontend/src/client`** — Views for end-users: browsing barbers/salons, booking, reviews, favorites, waitlist.
- **`frontend/src/barber`** — Barber/admin dashboard: manage services, schedule, bookings, calendar, portfolio, events, certificates, billing, salon management.
- **`frontend/src/shared/api/`** — API client modules for subscriptions, salon dashboard, salon calendar, public booking, revenue, portfolio, service categories.
- **`frontend/src/shared/components/`** — Reusable UI including `SubscriptionGuard` (paid-access wrapper), `ProtectedRoute`, `Header`, notifications.
- **`backend/src/services/payment/`** — Payment provider abstraction layer (`ManualPaymentProvider`, factory pattern, provider interface).
- **`backend/src/services/salon/`** — Salon-specific business logic: dashboard aggregation, unified calendar, membership management, staff/relationship services.
- **`backend/src/services/subscriptionService.js`** — Core subscription logic: plans, access checks, seats, payment intent lifecycle, expiration.
- **`backend/src/models/`** — Mongoose schemas including `SubscriptionPlan`, `Subscription`, `SubscriptionSeat`, `PaymentRecord`, `SubscriptionPaymentAttempt`, `WaitlistEntry`, `PortfolioPhoto`, `Event`, `EventRegistration`, `EventCertificate`, `SalonJobPost`, `SalonJobApplication`, `Voucher`, `LoyaltyProgram`, `LoyaltyProgress`.

---

## Local Setup

### Prerequisites
- Node.js >= 18
- MongoDB running locally (default port 27017) or a remote MongoDB URI

### Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env with your values
npm run dev               # starts with nodemon on port 5000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # then edit .env with your values
npm run dev               # starts Vite dev server on port 5173
```

Default ports:
- **Backend:** 5000
- **Frontend:** 5173

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` or `production` |
| `PORT` | Server port | `5000` |
| `TRUST_PROXY` | Set `true` only behind one trusted proxy/load balancer | `false` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/hairbook` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `your-long-random-secret` |
| `CLIENT_URL` | Frontend origin(s) for CORS (comma-separated) | `http://localhost:5173` |
| `APP_PUBLIC_URL` | Public URL of this backend | `https://api.example.com` |
| `EMAIL_PROVIDER` | Email provider (optional) | `resend` or empty |
| `RESEND_API_KEY` | Resend API key | |
| `EMAIL_FROM` | Sender address | `HairBook <noreply@example.com>` |
| `EMAIL_REPLY_TO` | Reply-to address (optional) | |
| `RUN_MIGRATIONS_ON_START` | Run data migrations on every server start | `false` |
| `ENABLE_BOOKING_REMINDERS` | Opt in to automatic booking reminders | `false` |
| `BOOKING_REMINDER_INTERVAL_MS` | Booking reminder scheduler interval | `60000` |
| `ENABLE_WAITLIST_EXPIRATION` | Opt in to automatic past-date waitlist expiration | `false` |
| `WAITLIST_EXPIRATION_INTERVAL_MS` | Waitlist expiration scheduler interval | `3600000` |
| `ENABLE_SUBSCRIPTION_EXPIRATION_CRON` | Opt in to subscription expiration scheduler | `false` |
| `SUBSCRIPTION_EXPIRATION_INTERVAL_MS` | Subscription expiration check interval | `86400000` (24h) |
| `ENABLE_CLEANUP_NON_WORKING_DAYS_CRON` | Nightly cleanup of past non-working days | `false` |
| `ENABLE_EXPIRE_PENDING_BOOKINGS_CRON` | Periodically expire past pending bookings | `false` |
| `ENABLE_EVENT_REMINDERS_CRON` | Send reminders for upcoming events | `false` |
| `EMAIL_VERIFICATION_LOG_URL` | Log verification links instead of sending email (dev only) | `false` |

### Frontend (`frontend/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | Socket.IO server URL | `http://localhost:5000` |
| `VITE_API_ORIGIN` | Backend origin (used for file upload URLs) | `http://localhost:5000` |

> ⚠️ All `VITE_*` variables are exposed to the browser. Never store secrets here.

---

## Scripts

### Backend

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | nodemon, auto-restart |
| Production start | `npm start` | `node src/server.js` |
| Tests | `npm test` | Runs all `*.test.js` files via `node --test` |
| Subscription grace | `npm run subscriptions:grace` | Grant grace subscriptions to existing barbers |
| Migrate salons | `npm run migrate:salons` | Migrate to multiple salon support |
| Fix work history | `npm run migrate:fix-work-history` | Fix work history data |
| Migrate schedule | `npm run migrate:schedule-per-salon` | Migrate schedule to per-salon |

### Frontend

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Vite dev server |
| Build | `npm run build` | Vite production build → `dist/` |
| Lint | `npm run lint` | ESLint |
| Preview | `npm run preview` | Preview production build locally |

---

## Testing Checklist

- [ ] Backend: `npm test` (currently over **1,100 backend tests** covering auth, bookings, events, certificates, reviews, schedules, services, salon membership, salon dashboard, salon calendar, subscription, waitlist, socket auth, availability, and more)
- [ ] Frontend lint: `npm run lint`
- [ ] Frontend build: `npm run build`

```bash
cd backend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

---

## Production Notes

### Environment setup

1. **CLIENT_URL** — Set to your production frontend domain (e.g. `https://app.example.com`). Multiple origins can be comma-separated.

2. **Frontend env before building** — All `VITE_*` variables are baked into the production bundle at build time:
   - `VITE_API_URL` → backend API (e.g. `https://api.example.com/api`)
   - `VITE_SOCKET_URL` → backend Socket.IO (e.g. `https://api.example.com`)
   - `VITE_API_ORIGIN` → backend origin for media URLs (e.g. `https://api.example.com`)

   Set them before running `npm run build`.

3. **JWT_SECRET** — Use a strong, random secret. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Cron/scheduler flags** — All schedulers are disabled by default. Enable only those you need:
   - `ENABLE_BOOKING_REMINDERS`
   - `ENABLE_WAITLIST_EXPIRATION`
   - `ENABLE_SUBSCRIPTION_EXPIRATION_CRON`
   - `ENABLE_CLEANUP_NON_WORKING_DAYS_CRON`
   - `ENABLE_EXPIRE_PENDING_BOOKINGS_CRON`
   - `ENABLE_EVENT_REMINDERS_CRON`

5. **Dev/manual subscription endpoints** — The following endpoints are **disabled in production** and return 403:
   - `POST /api/subscriptions/dev/grant`
   - `POST /api/subscriptions/dev/extend`
   - `POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm`

6. **Payment provider** — A real payment provider is not yet integrated. The system uses a `ManualPaymentProvider` for development. The payment attempt lifecycle (`createPaymentIntent` → pending → confirm) is fully structured and ready for real provider integration via the payment provider factory.

7. **Debug routes** — `POST /api/debug/*` routes are only available in `NODE_ENV=development`.

### Files & directories that must NOT be committed

- `backend/.env` — contains secrets
- `frontend/.env` — contains environment config
- `backend/node_modules/`, `frontend/node_modules/`
- `frontend/dist/` — build output
- `backend/uploads/` — user-uploaded files

### Serving uploads

The backend serves uploaded files via Express static middleware at `/uploads/*` paths for multiple directories: `avatars`, `certifications`, `events`, `certificate-files`, `portfolio`. Configuration uses:
- `dotfiles: "deny"` — prevents serving dotfiles
- `fallthrough: false` — returns 404 instead of falling through
- `index: false` — disables directory listing

### MongoDB

- Provide the connection string via `MONGO_URI` environment variable.
- For MongoDB Atlas, use a `mongodb+srv://` connection string with credentials.
- The server exits immediately if the connection fails.

### SPA routing

The frontend is a single-page application. In production, configure your web server to serve `dist/index.html` for all unmatched routes:

```nginx
location / {
  try_files $uri /index.html;
}
```

### SPA fallback routes

The app uses browser-history routing. Deep-linked routes like:
- `/barbers`, `/barbers/:id/profile`
- `/salons`, `/salons/:salonId/book`
- `/my-bookings`, `/favorites`
- `/admin`, `/admin/salon/dashboard`, `/admin/salon/calendar`
- `/messages`, `/notifications`, `/events`

must all fall back to `index.html` for page reload or direct navigation to work.

### Security notes

- JWT tokens are required for most API routes (except login, register, health, public booking, and public certificate verification).
- Socket.IO connections require a valid JWT token in the handshake auth or Authorization header.
- The `requireBarberSubscription` middleware enforces paid access — unpaid barbers receive `403 SUBSCRIPTION_REQUIRED`.
- Debug routes are only available in development.
- CORS is restricted to `CLIENT_URL` origins in production.

### Upload persistence

The backend stores uploaded files on local disk under `backend/uploads/`. This is **not suitable for multi-instance production deployments**. For production:
- Use a shared filesystem (NFS, EFS) mounted at `backend/uploads/`, **or**
- Replace the multer disk storage with cloud object storage (S3, GCS, R2) and update `getMediaUrl()` and the static middleware accordingly.

### Version control notes

- Always commit `package-lock.json` to ensure reproducible installs.
- Never commit `.env` files — they contain secrets.
- `node_modules/`, `dist/`, and `backend/uploads/` are already excluded via `.gitignore`.

---

## Roadmap / Next Possible Work

The following features are planned or possible future enhancements:

- **Real payment provider integration** — The payment attempt lifecycle (`createPaymentIntent` → pending → confirm) is ready but currently uses manual/dev confirmation. Integrate with Stripe, Idram, Telcell, or other providers via the provider factory.
- **Staff / Chair Renter confirmation flow** — Relationship type changes are saved but the full confirmation UX between owner and barber could be enhanced.
- **Mobile app** — Native or React Native mobile client.
- **Advanced marketing / promotions** — Coupon campaigns, referral programs, targeted promotions.
- **Deposits / no-show payments** — Require a deposit at booking time; charge no-show fees.
- **Advanced analytics** — Deeper business intelligence, trends, forecasting.
- **Email notifications** — The email service (`resend` provider) is configured but many notification types still use in-app notifications only.

---

## Deployment

The frontend and backend can be deployed separately. The backend is a Node.js/Express server; the frontend is a static SPA built with Vite.

### Backend deploy

```bash
cd backend
npm ci                 # clean install from lockfile
npm test               # requires local MongoDB
npm start              # starts Node.js server
```

### Frontend deploy

```bash
cd frontend
npm ci                 # clean install from lockfile
npm run build          # produces static output in dist/
```

Then serve `frontend/dist/` with any static file server, ensuring SPA fallback.

### Quick reference: env variables to set before building

| Context | Variable | Example |
|---|---|---|
| Frontend build | `VITE_API_URL` | `https://api.example.com/api` |
| Frontend build | `VITE_SOCKET_URL` | `https://api.example.com` |
| Frontend build | `VITE_API_ORIGIN` | `https://api.example.com` |
| Backend runtime | `CLIENT_URL` | `https://app.example.com` |
| Backend runtime | `NODE_ENV` | `production` |
| Backend runtime | `MONGO_URI` | `mongodb+srv://...` |
| Backend runtime | `JWT_SECRET` | `<random 64-char hex>` |
| Backend runtime | `PORT` | `5000` |

## Deployment Checklist

- [ ] Backend `npm test` passes (1,100+ tests — requires local MongoDB)
- [ ] Frontend `npm run lint` passes
- [ ] Frontend `npm run build` succeeds
- [ ] `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_API_ORIGIN` set before frontend build
- [ ] `CLIENT_URL`, `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production` set on backend runtime
- [ ] Scheduler flags intentionally set (all `false` by default)
- [ ] Web server configured for SPA fallback (`try_files $uri /index.html`)
- [ ] `backend/uploads/` directory is accessible (or object storage configured)
- [ ] `.env` files excluded from version control
- [ ] `node_modules`, `dist/` excluded from version control
- [ ] `package-lock.json` committed
