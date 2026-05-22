# HairBook — Barber Booking Platform

A full-stack web application where clients can browse barbers and salons, book appointments, send messages, and leave reviews. Barbers can manage their services, schedule, bookings, multi-salon memberships, events, and certificates.

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
| **node-cron** | Scheduled tasks (booking expiry, reminders) |
| **node:test** (built-in) | Testing |

---

## Folder Structure

```
hairdressProject/
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection, env helpers
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/      # Auth, file upload
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # Express routers
│   │   ├── services/       # Business logic (booking expiry, reminders, salon membership)
│   │   └── utils/          # Helpers (schedule, booking, event, salon, barber profile, permissions)
│   ├── cron/               # node-cron jobs
│   ├── migrations/         # Data migration scripts
│   ├── uploads/            # User-uploaded files (avatars, certs, events)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── client/         # Client-facing pages & components
│   │   │   ├── components/ # BookingCard, BarberCard, ReviewForm, filters, grids
│   │   │   ├── pages/      # BarbersPage, SalonsPage, HomePage, etc.
│   │   │   └── utils/
│   │   ├── barber/         # Barber dashboard pages & components
│   │   │   ├── components/ # ServicesManager, ScheduleManager, BookingsList, etc.
│   │   │   └── pages/      # AdminPage, BarberProfilePage, CalendarPage, MyEventsPage
│   │   ├── features/       # Feature modules (events, messages)
│   │   ├── shared/         # Shared UI, API client, hooks, utils
│   │   ├── store/          # Redux store, slices, localStorage middleware
│   │   └── pages/          # Cross-role pages (Login, Register, Messages, Notifications, Events, Certificate)
│   └── .env.example
└── README.md
```

### Key directories explained

- **`frontend/src/client`** — Views for end-users: browsing barbers/salons, booking, reviews.
- **`frontend/src/barber`** — Barber/admin dashboard: manage services, schedule, bookings, events, certificates, settings.
- **`frontend/src/shared`** — Reusable components, API client (Axios), hooks, utility functions (dates, time, availability, media URLs).
- **`frontend/src/features`** — Self-contained feature modules (messages with chat panels, events with registration flow).
- **`frontend/src/store`** — Redux Toolkit store with slices for auth, bookings, services, schedule, reviews, favorites, users, messages.
- **`backend/src/controllers`** — Express route handlers for auth, bookings, events, certificates, reviews, salons, schedules, services, messages.
- **`backend/src/models`** — Mongoose schemas for User, BarberProfile, Booking, Event, EventRegistration, EventCertificate, Salon, Schedule, Service, Message, Review, Notification, etc.
- **`backend/src/routes`** — Express routers. Debug routes are only mounted in non-production.
- **`backend/src/services`** — Business logic for booking expiration, event reminders, salon membership management.
- **`backend/src/utils`** — Helper functions for schedule calculations, booking date/time, event logic, salon permissions, profile utilities.

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

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` or `production` |
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/hairbook` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `your-long-random-secret` |
| `CLIENT_URL` | Frontend origin(s) for CORS (comma-separated) | `http://localhost:5173` |
| `RUN_MIGRATIONS_ON_START` | Run data migrations on every server start | `false` |
| `ENABLE_BOOKING_REMINDERS` | Opt in to automatic smart booking reminders | `false` |
| `BOOKING_REMINDER_INTERVAL_MS` | Smart booking reminder scheduler interval | `60000` |
| `ENABLE_WAITLIST_EXPIRATION` | Opt in to automatic past-date waitlist expiration | `false` |
| `WAITLIST_EXPIRATION_INTERVAL_MS` | Waitlist expiration scheduler interval | `3600000` |

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

| Script | Command |
|---|---|
| Dev server | `npm run dev` (nodemon, auto-restart) |
| Production start | `npm start` (plain `node src/server.js`) |
| Tests | `npm test` (runs all `*.test.js` files via `node --test`) |

### Frontend

| Script | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` (Vite production build → `dist/`) |
| Lint | `npm run lint` (ESLint) |
| Preview | `npm run preview` (preview production build locally) |

---

## Important Product Flows

### Client
- Register / login as a client
- Browse barbers with filters (city, service, specialty, price, rating)
- Browse salons
- Book an appointment (select barber → service → salon → date/time → confirm)
- View own bookings (upcoming / past)
- Cancel or reschedule own bookings
- Send messages to barbers
- Leave reviews for completed bookings
- Leave salon reviews for completed bookings with salon association

### Barber
- Manage personal profile, gallery, certifications
- Manage services (create, edit, delete)
- Manage schedule per salon (weekly schedule, date overrides, non-working days)
- Accept / reject / complete bookings
- View bookings in a calendar timeline
- Create events (with optional salon association, capacity, registration, certificates)
- Manage event registrations (approve, reject, waitlist, check-in)
- Issue event certificates (auto-generated or uploaded PDF)
- View dashboard analytics

### Events
- Barbers create events (title, date, time, capacity, location, certificate settings)
- Clients register for events (status: pending)
- Organizer approves, rejects, or moves registrations to waitlist
- Organizer marks participants as attended (check-in)
- After the event ends, organizer can issue certificates to attended participants
- Certificates can be auto-generated or uploaded as PDF files
- Certificates have a public verification page
- Past events are hidden from the public page but remain visible to the organizer

---

## Testing Checklist

- [ ] Backend: `npm test` (117 tests covering auth, bookings, events, certificates, reviews, schedules, services, salon membership, socket auth, availability)
- [ ] Frontend lint: `npm run lint`
- [ ] Frontend build: `npm run build`

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

4. **RUN_MIGRATIONS_ON_START** — Keep `false` in production unless you intentionally need to run migrations.

5. **Booking reminders** — Smart booking reminders are opt-in. Set `ENABLE_BOOKING_REMINDERS=true` to start the scheduler, and tune `BOOKING_REMINDER_INTERVAL_MS` if needed. The scheduler waits until the first interval before running and skips ticks while a previous reminder run is still active.

6. **Waitlist expiration** — Past-date waitlist expiration is opt-in. Set `ENABLE_WAITLIST_EXPIRATION=true` to start the scheduler, and tune `WAITLIST_EXPIRATION_INTERVAL_MS` if needed. The scheduler waits until the first interval before running and skips ticks while a previous expiration run is still active.

### Files & directories that must NOT be committed

- `backend/.env` — contains secrets
- `frontend/.env` — contains environment config
- `backend/node_modules/`, `frontend/node_modules/`
- `frontend/dist/` — build output
- `backend/uploads/` — user-uploaded files (avatars, certifications, events, certificate files)

### Serving uploads

The backend serves uploaded files via Express static middleware at `/uploads/*` paths. If you deploy behind a reverse proxy (nginx, Caddy), you may need to configure it to forward or serve the `uploads/` directory directly. The static middleware uses:
- `dotfiles: "deny"` — prevents serving dotfiles (e.g. `.env`)
- `fallthrough: false` — returns 404 instead of falling through to other routes
- `index: false` — disables directory listing

### MongoDB

- Provide the connection string via `MONGO_URI` environment variable.
- For MongoDB Atlas (MongoDB in the cloud), use a `mongodb+srv://` connection string with credentials.
- The server exits immediately if the connection fails.

### SPA routing

The frontend is a single-page application built with Vite. In production, configure your web server (nginx, Caddy) to serve `dist/index.html` for all unmatched routes so that React Router handles client-side navigation. Example nginx config:

```nginx
location / {
  try_files $uri /index.html;
}
```

Vite's dev server handles this automatically.

### Security notes

- JWT tokens are required for most API routes (except login, register, health, and public certificate verification).
- Socket.IO connections require a valid JWT token in the handshake auth or Authorization header.
- Debug routes (`/api/debug/*`) are only available in development (`NODE_ENV !== "production"`).
- CORS is restricted to `CLIENT_URL` origins in production. In development, common localhost origins are also allowed.

---

## Current Cleanup State

### Frontend
Components extracted and organized into dedicated directories:
- **Events** — Registration flow, approval, waitlist, check-in, certificates
- **Booking** — Multi-step booking wizard (service, date/time, client details, confirmation)
- **Messages** — Thread list + chat panel
- **Schedule** — Weekly schedule editor, date overrides, non-working days
- **Calendar** — Timeline view for barber bookings
- **Barbers** — Cards, filters panel, grid layout
- **Salons** — Cards, filters panel, grid layout

### Backend
Services and helpers extracted for:
- Event creation, registration, certificates, reminders
- Booking creation, expiration, reminders
- Schedule per-salon and personal
- Salon membership management and permissions
- Barber profile and salon utilities

---

## Deployment Checklist

- [ ] Backend `npm test` passes (117 tests)
- [ ] Frontend `npm run lint` passes
- [ ] Frontend `npm run build` succeeds
- [ ] `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_API_ORIGIN` set before build
- [ ] `CLIENT_URL` set on backend
- [ ] `JWT_SECRET` set to a strong random value
- [ ] `MONGO_URI` pointing to production database
- [ ] `NODE_ENV=production` on backend
- [ ] `RUN_MIGRATIONS_ON_START=false`
- [ ] `ENABLE_BOOKING_REMINDERS` intentionally set (`false` by default)
- [ ] `ENABLE_WAITLIST_EXPIRATION` intentionally set (`false` by default)
- [ ] Web server configured for SPA routing (`try_files $uri /index.html`)
- [ ] `backend/uploads/` directory is accessible (or reverse proxy configured)
- [ ] `.env` files excluded from version control
- [ ] `node_modules` excluded from version control
- [ ] `dist/` excluded from version control
- [ ] Backend has `.gitignore` (created)
