# HairBook — Pro Booking Platform

## Project Overview

HairBook connects clients with beauty professionals and salons. It combines appointment booking, specialist profiles, salon membership and hiring, business reporting, subscriptions, messaging, and professional events.

This README is the high-level product and technical reference for the current implementation. Production code and tests remain authoritative for individual API contracts. Read [AI Project Context](docs/AI_PROJECT_CONTEXT.md) for deeper architecture and implementation guidance; older documentation may describe earlier behavior.

### Contents

- [Core Capabilities](#core-capabilities)
- [Roles, Access & Privacy](#roles-access--privacy)
- [Main Product Workflows](#main-product-workflows)
- [Salon Membership, Jobs & Onboarding](#salon-membership-jobs--onboarding)
- [Booking & Scheduling](#booking--scheduling)
- [Subscriptions, Billing & Paid Access](#subscriptions-billing--paid-access)
- [Messaging, Events, Waitlist & Other Features](#messaging-events-waitlist--other-features)
- [Architecture & Repository Structure](#architecture--repository-structure)
- [Local Development](#local-development)
- [Environment Configuration](#environment-configuration)
- [Testing & Quality](#testing--quality)
- [Production & Deployment](#production--deployment)
- [Security & Operational Invariants](#security--operational-invariants)
- [Roadmap](#roadmap)
- [Additional Documentation](#additional-documentation)

## Core Capabilities

| Area | Implemented capabilities |
|---|---|
| Clients | Discovery, favorites, booking/history, reschedule requests, reviews, waitlist, loyalty progress, messages and notifications |
| Professionals | Profile and onboarding, services/packages, personal and salon schedules, booking management, portfolio, certifications, clients and revenue |
| Salons | Owner/admin management, staff relationships, direct join requests, jobs and applicant onboarding, dashboard, calendar, reports and promotions |
| Billing | Individual subscriptions, salon subscriptions and seats, payment attempts/history, deposit tracking and platform billing operations |
| Events | Public/private events, registration approval and capacity, attendance, event reviews, certificate issuance and verification |

Online charging through a real payment provider is not integrated. Existing payment and media limitations are described below rather than treated as completed production integrations.

## Roles, Access & Privacy

### Business roles

`User.role` has exactly two values: **`client`** and **`barber`**. The latter covers supported beauty professions, not only haircutting. `/admin` is the professional workspace URL, not a global role.

| Scope | Authority |
|---|---|
| Client | Own bookings, favorites, conversations, notifications and registrations |
| Barber | Own professional profile, services, schedules, bookings and business tools, subject to each feature's paid-access checks |
| Salon owner | `Salon.ownerId`; manages that salon and alone can promote/demote its admins |
| Salon admin | Entry in `Salon.admins`; manages that salon's permitted workflows, without ownership powers |
| Staff / chair renter | Membership relationship in `User.salons`; membership alone grants no salon management authority |

Owners cannot remove themselves. Admins can remove ordinary members but cannot remove the owner, themselves, or another admin. Ownership, management, approved membership, accepted relationship terms, and working as a specialist are separate concepts.

### Salon privacy

Owners/admins can access their salon's dashboard, calendar and reports. Booking and revenue queries restrict data to the relevant salon and eligible staff; selecting a foreign barber or chair renter does not grant access to that person's private calendar or reports. Reports additionally require an active salon subscription.

Accepted staff means an approved membership with `relationshipType: "staff"` and `relationshipStatus: "accepted"`. Calendar and seat eligibility additionally require `worksAsSpecialist !== false`. Chair renters retain independent bookings, client information and revenue: management of their salon does not expose their private business movement. Basic membership details and counts are distinct from private metrics.

Client booking reads are self-scoped; other viewers of availability receive a limited booking projection. Treatment records are excluded from client booking responses. Assigned barbers, and eligible managers of the booking's salon, can read reference images and manage private treatment data; manager access requires an accepted staff relationship. Salon management does not confer the assigned barber's booking acceptance/completion powers.

### Platform access

Platform privileges are separate from both business roles and salon membership:

- `User.platformRole === "superuser"` grants the fixed platform capability set.
- `PLATFORM_ADMIN_EMAILS` provides bootstrap/recovery access only for matching **verified emails**. Authenticated user IDs matching `PLATFORM_ADMIN_IDS` also qualify; that ID path does not require email verification.
- `/api/platform/*` checks explicit `billing.read`, `billing.manage`, or `audit.read` capabilities. Unknown capabilities fail closed.
- Platform access does not bypass ordinary salon/business authorization. Normal/public user responses do not expose raw `platformRole`.
- Platform billing mutations require recent authentication and include audit/idempotency controls. Platform Audit is read-only.

The server is authoritative for authorization and resource ownership. Frontend route guards and subscription indicators are UX, not permission grants.

## Main Product Workflows

1. **Client:** discover a professional or salon, select a service and slot, sign in to submit, then follow booking status, request changes, and review completed work.
2. **Professional:** register/sign in, complete professional basics and workplace onboarding, configure services and schedules, obtain applicable paid access, and manage appointments.
3. **Salon manager:** create a salon or use an existing management relationship, configure application policy, review requests/jobs, manage staff and seats, and inspect salon operations.

New professional onboarding supports `independent`, `salon`, and `both` workplaces. `/onboarding` and the professional route guard guide the flow; `/api/barber-onboarding/me` and its finalize endpoint validate completion. Legacy accounts without onboarding state remain compatible. Public readiness also depends on active services and an eligible workplace; paying alone does not make an incomplete profile bookable.

### Main frontend entry points

| Routes | Access / purpose |
|---|---|
| `/register`, `/login`, `/forgot-password`, `/reset-password` | Public authentication pages |
| `/barbers`, `/specialists`, their `/:barberId/profile` routes, `/salons` | Client-authenticated discovery pages; selected discovery APIs are public |
| `/salons/:salonId`, `/salons/:salonId/book` | Public salon/profile and booking-selection pages; submission requires an authenticated client |
| `/booking`, `/booking/:barberId`, `/success` | Client booking flow; `/booking` redirects to discovery |
| `/my-bookings`, `/booking-history`, `/my-waitlist`, `/favorites`, `/profile` | Client account tools |
| `/messages`, `/messages/:userId`, `/notifications`, `/events`, `/my-events` | Authenticated shared pages |
| `/jobs`, `/jobs/applications` | Public job listings; barber-only application history |
| `/certificates/:certificateId` | Public certificate verification |
| `/admin`, `/admin/services`, `/admin/schedule`, `/admin/bookings`, `/admin/booking-history` | Professional workspace; paid checks apply to premium tools |
| `/admin/calendar`, `/admin/calendar/day/:date`, `/admin/clients`, `/admin/portfolio`, `/admin/waitlist`, `/admin/vouchers`, `/admin/revenue` | Professional business tools |
| `/admin/profile`, `/admin/settings/*`, `/admin/jobs`, `/admin/billing` | Profile, settings, jobs and individual billing; settings have feature-specific guards |
| `/admin/salon/dashboard`, `/admin/salon/calendar`, `/admin/salon/billing`, `/admin/salon/reports`, `/admin/salon/promotions` | Salon management pages; API ownership and subscription checks still apply |
| `/admin/platform*` | Capability-protected platform workspace |

## Salon Membership, Jobs & Onboarding

### Membership and direct requests

A barber can create a salon and choose whether to work there as a specialist. Owners/admins manage only their own salons. Canonical memberships live in `User.salons`, with `pending`, `approved`, or `rejected` membership status. Relationship terms separately use `pending`, `accepted`, or `rejected`, and `staff` or `chair_renter` types.

Owners/admins can propose relationship-type changes for approved accepted members other than the owner. The member accepts or rejects in the existing settings flow. A proposal makes the relationship pending; rejection restores previous terms when recorded, otherwise marks it rejected. Accepting a change to/from chair rental clears staff payment settings. Relationship confirmation is already implemented.

Legacy `User.salon` and `User.salonStatus` remain compatibility inputs in relevant membership readers. Missing relationship fields can be interpreted as accepted staff for legacy approved records. Preserve these distinctions when migrating data; do not infer authority from a legacy salon ID alone.

Managers can edit `joinApplicationPolicy` in Salon Settings:

| Policy | Current direct-request behavior |
|---|---|
| `closed` | Blocks creating/reopening direct join requests |
| `job_only` | Blocks creating/reopening direct join requests; applications use active job posts |
| `open` | Allows eligible barbers to create/reopen direct requests |

New salons created through the API start as `job_only`. Missing or unrecognized legacy policy values resolve effectively to `open`; the schema deliberately has no default. Policy currently gates **direct requests**: `closed` does not close job posts, block their application endpoint, cancel existing requests, or invalidate an already accepted onboarding offer.

Direct-request behavior:

- Only barbers may request membership; an already approved member cannot apply again. A duplicate pending request returns the existing request, even after policy changes.
- A barber may have at most **three pending direct requests** across salons. Missing legacy `source` is treated as direct; `source: "job"` is excluded from this cap.
- Rejection or applicant cancellation of a direct request sets a **seven-day reapplication cooldown** for that salon. Existing records without a stored cooldown are not assigned one retroactively.
- Only the requester can cancel. Owners/admins may accept/reject requests for their salons, but cannot decide their own request.
- Acceptance creates approved, accepted staff membership with specialist work enabled. Reopening clears stale relationship/payment fields. Cancellation closes the request without deleting the existing pending membership entry.
- Transactions and a unique pending-request index coordinate concurrent decisions and membership updates. Internal source/cooldown fields are omitted from request serialization.

Leaving removes membership, updates work history and legacy fields, removes salon admin authority when applicable, invalidates accepted join requests, and attempts seat revocation. Owners cannot leave through this flow. Invalidating a previously accepted request on departure does not itself start the rejection/cancellation cooldown. A later direct request must satisfy current policy and eligibility; a job-origin request cannot be reopened through the direct-request endpoint. Seat access rechecks membership even if cleanup fails.

### Jobs and applicant consent

Only a salon's owner/admin can create, edit, close and review its job posts. Barbers can apply to active jobs with a message; one application per job/applicant is enforced, including duplicate-create races. Applicants read their own submissions; managers read applications for their salons.

Application statuses are `pending`, `reviewed`, `accepted`, and `rejected`. First acceptance can capture an immutable onboarding offer. **Acceptance alone does not create membership.** The applicant must separately confirm through `/api/salon-jobs/applications/:applicationId/onboarding/confirm`.

| Accepted job terms | Offered salon relationship |
|---|---|
| Barber, hairdresser, nail artist or makeup artist; full-time, part-time, contract or commission | Accepted staff, working specialist |
| Receptionist with those staff employment types | Accepted staff, non-specialist |
| Supported specialist role with `rent-chair` | Accepted chair renter, working specialist |
| Unsupported mapping | `blocked`; no automatic onboarding offer |

Confirmation verifies applicant ownership, accepted application state, offer integrity, and absence of conflicting membership or pending direct requests. It records consent and creates exactly the offered membership transactionally. It does not create a direct join request or consume that cap. Repeated confirmation is idempotent only while the matching membership still exists; it cannot silently restore membership after leaving.

Historical accepted applications without an offer cannot be reconstructed from mutable job data. Valid accepted offers remain confirmable after job closure or policy changes. Confirmed applications remain accepted and cannot be moved back through manager status actions.

The applicant UI already shows terms, confirmation, confirmed/blocked/legacy states and request errors. The manager application dialog already shows waiting-for-consent, confirmed and unavailable status, and disables status changes after confirmation. Unsupported arrangements require manual follow-up; no separate automatic recovery or onboarding-decline flow is implemented.

## Booking & Scheduling

### Selection and creation

Public salon booking lets visitors inspect available specialists, services and slots without logging in. Confirmation posts to authenticated `/api/bookings` and requires the client to book for themselves. There is no anonymous guest-booking submission. A barber can create a manual appointment only on their own calendar, with client details and an initial `accepted` status; client-created appointments start `pending`.

Bookings select one barber, one active service or package, a workplace, date and time. For salon bookings, the server checks that salon, its accepted working membership, the exact salon schedule and applicable paid coverage. Independent bookings require independent readiness, an address and a personal schedule. Missing salon context represents the independent workflow; it is not permission to borrow another salon's availability.

The server resolves service ownership, duration, price, discounts and deposit policy. Packages contain validated services belonging to that barber; price and duration can be manual or summed, and sum-mode values are resolved again at booking time. Services used by active packages cannot simply be deactivated/deleted without resolving those dependencies.

Schedules support weekly hours, breaks, non-working days and date-specific overrides, with personal and salon scopes. Availability uses Armenia time (`Asia/Yerevan`), validates the full duration and checks overlapping bookings. Persisted minute-level slot holds prevent the same barber being double-booked across instances or salons; a frontend free slot is not a reservation.

### State and changes

| Action | Implemented behavior |
|---|---|
| Accept | Assigned barber changes `pending` to `accepted`, with paid-access checks |
| Complete | Assigned barber changes `accepted` to `completed` |
| Reject | Assigned barber rejects a `pending` or `accepted` booking with a reason |
| Cancel | Booking client cancels their `pending`/`accepted` booking with a reason; assigned barber may cancel their manual booking without a linked client |
| Reschedule | Client requests a new slot on a pending/accepted booking; assigned barber accepts/rejects. Acceptance revalidates availability and moves slot holds |
| Delay | Booking client may delay an accepted booking once by 10 or 20 minutes, through appointment start plus five minutes, subject to availability and same-day limits |
| Expire | Pending appointments past their appointment time become `expired`; stale pending records stop blocking availability through actionable-date filtering |
| No-show / late cancellation | Assigned barber marks a past accepted appointment `no_show` or `late_cancelled`, after its scheduled end |

`accepted` is the normal persisted confirmation state. `confirmed` is a legacy value supported by selected normalization/read/reminder paths, not a new status accepted by the update API. Rescheduling and delay update timing/metadata rather than creating `rescheduled` or `delayed` booking statuses. General date/time edits cannot bypass the client's reschedule-request flow.

Opt-in reminders create in-app notifications for upcoming accepted/legacy-confirmed bookings within the 24-hour and two-hour windows. They use persistent dispatch claims and duplicate controls; scheduler configuration is listed below.

### Deposits, consultation and private records

Deposit settings support fixed/percentage policies and a minimum booking price. Creation snapshots the applicable policy and amount; required deposits begin `pending`. A pending deposit or payment attempt is not paid revenue, and payment state is separate from appointment confirmation. A payment-intent failure can leave an already committed booking with a pending deposit and a safe payment-unavailable response.

The authenticated client booking flow supports reference-image uploads, consultation data and consent. Accepted consent requires a text version and gets a server timestamp; the API also accepts bookings without accepted consent. The public salon selection/submission flow does not send these additional form fields.

Treatment records store formulas, products, technique, outcome and reaction notes for accepted/completed bookings. They are private professional records, separate from reference uploads and portfolio publication. Images are served through the protected booking image endpoint after ownership, eligible salon-manager and file-binding checks. A filename or salon ID alone is not authorization.

## Subscriptions, Billing & Paid Access

Individual subscriptions belong to a barber; salon subscriptions buy capacity for assigned seats. The default plan is monthly, and trial records use a 14-day period. Paid access requires an eligible `active` or `trialing` subscription under current server checks. When `currentPeriodEnd` exists, it must be valid and unexpired; a missing/null value does not by itself invalidate eligibility. This also applies to salon-seat parent subscriptions; seat and membership authorization checks remain independently required and fail closed. Trial creation is idempotent per subscription owner. Owning a salon subscription without a seat does not automatically cover a working member.

| Check | Coverage semantics |
|---|---|
| General professional paid access | A valid individual subscription short-circuits successfully; otherwise all active seats are considered until a valid staff seat is found |
| Valid salon seat | Active seat, eligible active/trialing parent subscription under the period rules above, and approved accepted working-staff membership in that salon |
| Creating a salon booking | Staff requires a matching salon seat; an individual subscription does not replace it. An accepted working chair renter requires their own individual subscription |
| Creating an independent booking | Valid individual subscription, or the booking resolver's seat fallback, plus independent booking-readiness checks |

Expired/revoked seats, invalid membership, non-specialist staff and chair-renter seats do not grant staff-seat coverage. In general access and `/subscriptions/me`, an invalid earlier seat does not hide a later valid seat. The booking resolver currently validates membership after selecting its first matching paid-parent seat, so its fallback is not the same all-seat search. Seats cover their own salon context, not arbitrary salon bookings. Other existing paid-access helpers retain individual-subscription short-circuit behavior; do not treat every helper as identical to the stricter booking-creation rule.

`GET /api/subscriptions/me` reports general access, individual subscription and one valid `salonSeatCoverage` record. `coveredBy` is `individual`, `salon`, `both`, or `null`. This is not a complete inventory of all seats or a guarantee of booking eligibility in every salon. Clients receive `applicability: "not-applicable"` and `hasAccess: false`; they still use client features without subscriptions.

Salon owners/admins manage subscriptions and eligible staff seat assignments. Capacity updates and assignments use transactional counters/unique indexes. Invalid stale active seats may still consume authoritative capacity until revoked even though they grant no access and are excluded from eligible-member displays. Seat increases use payment attempts; direct reductions cannot go below assigned capacity.

### Payments and platform operations

Payment intent creation calculates server-side terms and creates a pending `SubscriptionPaymentAttempt`; it does not activate access. Attempts can be read/cancelled by authorized requesters, and paid finalization coordinates subscription/payment records with duplicate and transaction checks. Deposit attempts use the separate `booking_deposit` purpose. Payment histories are scoped to the individual/payer or currently managed salon as appropriate.

`manual` is the default provider and creates no real charge or checkout URL. `disabled` also leaves payments pending. Neither accepts payment webhooks. `mock`/`test` are rejected in production. A future real adapter must verify signatures and parse events before paid state can be trusted; `PAYMENT_WEBHOOK_SECRET` alone does not enable an integration.

Self-service development endpoints return 403 in production:

- `POST /api/subscriptions/dev/grant`
- `POST /api/subscriptions/dev/extend`
- `POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm`
- `POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm-seat-update`

Separately, capability-protected platform salon billing includes audited manual activation/renewal, seat operations, cancellation and manual-provider payment confirmation. These are privileged operational workflows with recent-authentication checks, not public/self-service dev confirmation or a real online payment integration.

## Messaging, Events, Waitlist & Other Features

| Feature | Behavior and boundaries |
|---|---|
| Messaging | Only client↔barber conversations. A client can initiate with a paid barber or an existing booking relationship; a barber needs a booking relationship or a client-started conversation. Reads/read receipts are participant-scoped |
| Realtime | Socket.IO authenticates `handshake.auth.token` only, validates the current account/auth version, joins `user:<id>`, and handles token expiry/reconnection. Authorization-header tokens are not accepted for socket authentication |
| Notifications | User-scoped reads, read status and deletion; booking, membership, job, event and waitlist workflows generate notifications |
| Events | Barbers create events, optionally salon-associated. Organizers or applicable salon managers manage them; public/private detail visibility and participant lists have separate checks |
| Registrations | Authenticated participants request registration; organizers cannot register for their own event. Pending/approved/rejected/waitlisted/cancelled states, capacity controls and attendance are implemented. Participants cannot cancel an already approved registration through the self-cancellation endpoint |
| Certificates / event reviews | Approved attendance and event timing gate certificate issuance; automatic records, uploaded certificate files, revocation and public verification exist. Event reviews require the requester's verified attendance |
| Waitlist | Clients request unavailable dates/slots, barbers offer alternatives, and client acceptance can convert an offer into an accepted booking after slot/paid-access checks. Decline/cancel and past-date expiration are implemented |
| Services / categories | Barber-owned services and packages, service discounts, and scoped category management; public reads expose active eligible offerings |
| Portfolio / certifications | Profile galleries, professional certifications and before/after portfolio entries. Public portfolio requires active/public entries and publication consent; owner media reads remain protected |
| Favorites / discovery | Barber and salon favorites. Public barber listings and favorite summaries apply paid-access/readiness checks; inactive or incomplete professionals may be hidden |
| Reviews | Barber and salon reviews require the client's matching completed booking, with duplicate protection. Barbers reply to their reviews; salon owner/admins reply to salon reviews |
| Vouchers / promotions | Barber/salon vouchers, public/private visibility, validation, usage/expiry rules and server-side pricing. Salon promotions require management authority and an active salon subscription and target eligible staff rather than chair-renter business |
| Loyalty | Program management, client progress and booking-linked discounts/rewards; reward redemption is coordinated with booking mutations |
| Salon operations | Dashboard metrics/alerts, staff calendar and date-range reports with CSV export, top services, daily trends and staff/salon earnings based on configured payment terms |

Many updates are in-app only. SMTP supports generic transactional email/password reset; email verification retains optional Resend support. Do not assume every notification also sends email.

## Architecture & Repository Structure

| Layer | Current stack |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, Redux Toolkit, Tailwind CSS 3, Axios, Socket.IO Client 4, i18next |
| Backend | Node.js ESM, Express 5, MongoDB/Mongoose 9, JWT/bcrypt, Google ID-token verification, Multer, Socket.IO 4 |
| Infrastructure | Redis via ioredis, Redis rate-limit store and Socket.IO adapter, MongoDB transactions/indexes, local media storage |
| Operations | Helmet, Pino, optional Sentry, node-cron and scheduler leases, SMTP/optional Resend |
| Quality | Node's built-in test runner; Vitest 4, Testing Library/jsdom and ESLint 10 |

Exact dependency versions and overrides are recorded in the two package manifests and lockfiles.

```text
backend/
  src/config/          Runtime validation, database, logging and monitoring
  src/controllers/     HTTP handlers grouped by feature
  src/routes/          Express API groups
  src/middleware/      Authentication, capabilities, paid access, limits and uploads
  src/models/          Persistent product, session, payment, media and lease records
  src/services/        Business workflows, storage and infrastructure
  src/utils/           Shared validation, serialization and domain helpers
  src/server.js        Application assembly and startup
  cron/                Scheduled job entry points
  migrations/          Data migrations
  scripts/             Audits, backfills and operational utilities
  uploads/             Runtime files, including hidden managed-media stores
frontend/
  src/client/          Client pages, booking and discovery
  src/barber/          Professional and salon workspace
  src/features/        Events, jobs, messages and reviews
  src/platform/        Platform billing and Audit
  src/routes/          Route groups
  src/shared/          API/session clients, guards, components and utilities
  src/store/           Redux state
  src/i18n/            Locale resources
  src/pages/           Shared/public pages
  src/test/            Test setup
docs/                  Deeper implementation and deployment guidance
```

API groups under `/api` include `auth`, `users`, `barbers`, `barber-onboarding`, `salons`, `salon-jobs`, `bookings`, `schedules`, `services`, `service-categories`, `subscriptions`, `payments`, `platform`, `revenue`, `messages`, `notifications`, `reviews`, `salon-reviews`, `favorites`, `portfolio`, `events`, `certificates`, `waitlist`, `loyalty`, `vouchers`, and `health`. Read the feature routers for exact endpoint contracts.

## Local Development

### Prerequisites

- Use **Node.js 22.13+ within 22.x, or Node.js 24.x**, with npm. Although the backend manifest declares `>=18.19.0`, locked Mongoose 9 requires `>=20.19.0`; the frontend's Vite, ESLint and jsdom requirements also make the old “Node >=18” instruction insufficient. The chosen versions satisfy the current locked toolchain.
- Use a MongoDB replica set or transaction-capable remote cluster. A standalone local MongoDB is insufficient for booking, membership and other transactional workflows. Use a development database, with required indexes and slot-hold backfill for existing bookings.
- Run Redis when rate limiting is enabled. The example environment enables it. For development without Redis, explicitly set `RATE_LIMIT_ENABLED=false` and leave `REDIS_URL` empty; this does not represent production configuration.

Run each block from the **repository root**, in separate terminals. Subshells keep the calling terminal in that root. Copy environment files only on first setup; preserve existing local configuration.

```bash
(cd backend && npm ci && cp .env.example .env)
# Edit backend/.env using the development values described below.
(cd backend && npm run dev)
```

```bash
(cd frontend && npm ci && cp .env.example .env)
# Edit frontend/.env using the development values described below.
(cd frontend && npm run dev)
```

Backend development runs on port 5000 by default and explicitly sets `NODE_ENV=development`; Vite normally starts on 5173. Both backend start scripts load `src/instrument.js` before the server. The copied backend example starts with production-oriented values and must be configured before use.

## Environment Configuration

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example). Values below are examples/defaults, not credentials. Never commit populated environment files or expose server secrets in `VITE_*` variables.

### Backend runtime

| Variable(s) | Configuration |
|---|---|
| `NODE_ENV`, `PORT` | Explicit supported environment: `development`, `test` or `production`; port defaults to 5000 |
| `MONGO_URI` | Development/production database URI with the transaction topology described above |
| `JWT_SECRET` | Set a strong random secret; production rejects missing/known placeholder values |
| `CLIENT_URL` | Comma-separated frontend origins; local example `http://localhost:5173`. Production requires valid non-loopback origins without paths/credentials |
| `TRUST_PROXY` | Local direct access: `false`. Production requires exactly `true` after normalization and uses one trusted proxy hop |
| `APP_PUBLIC_URL` | Public backend URL used when constructing media URLs |
| `REDIS_URL`, `REDIS_NAMESPACE` | Local Redis example `redis://127.0.0.1:6379`; production requires a valid, reachable Redis URL. Namespace defaults to `hairbook`; separate environments |
| `AUTH_REFRESH_COOKIE_SAME_SITE` | Defaults to `lax`; supported values `lax`, `strict`, `none`. `none` requires Secure cookies |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth web client ID for server-side ID-token verification |
| `PAYMENT_PROVIDER` | Default `manual`; also `disabled`, and development/test-only `mock`/`test` |
| `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_SUCCESS_URL`, `PAYMENT_CANCEL_URL` | Adapter settings; do not enable real payments by themselves |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | SMTP transactional email configuration |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_REPLY_TO` | Optional legacy verification delivery through `resend`; also uses `EMAIL_FROM` |
| `PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_IDS` | Optional platform bootstrap/recovery allowlists; access semantics are described above |
| `EMAIL_VERIFICATION_LOG_URL` | Development-only verification-link logging; keep disabled in production |
| `LOG_LEVEL`, `LOG_PRETTY`, `SERVICE_NAME`, `RELEASE` | Structured logging; pretty output is development-only |
| `SENTRY_ENABLED`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | Optional monitoring, disabled by default |

### Rate limits

If `RATE_LIMIT_ENABLED` is unset, limits default on in production or when `REDIS_URL` is configured, and off otherwise; tests default off when unset. Explicit `true` enables limits and explicit `false` disables them. Enabled limits use Redis, including development: there is no production in-memory fallback. Store failures fail closed rather than allowing the action.

| Settings | Default window / maximum |
|---|---|
| `RATE_LIMIT_AUTH_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX` | 900000 ms / 20 |
| `RATE_LIMIT_PUBLIC_WINDOW_MS`, `RATE_LIMIT_PUBLIC_MAX` | 900000 ms / 120 |
| `RATE_LIMIT_UPLOAD_WINDOW_MS`, `RATE_LIMIT_UPLOAD_MAX` | 900000 ms / 40 |
| `RATE_LIMIT_PAYMENT_WINDOW_MS`, `RATE_LIMIT_PAYMENT_MAX` | 900000 ms / 60 |

Feature routes apply appropriate public, authenticated-user, upload and payment limiters. A limited request returns HTTP 429 with `code: "RATE_LIMITED"`. These settings do not imply a single blanket limiter on every API route.

### Schedulers

| Enable flag | Default | Frequency setting / schedule |
|---|---|---|
| `ENABLE_EXPIRE_PENDING_BOOKINGS_CRON` | Enabled unless exactly `false` | Every five minutes, plus startup catch-up |
| `ENABLE_BOOKING_REMINDERS` | Off; requires exactly `true` | `BOOKING_REMINDER_INTERVAL_MS=60000` |
| `ENABLE_WAITLIST_EXPIRATION` | Off; requires exactly `true` | `WAITLIST_EXPIRATION_INTERVAL_MS=3600000` |
| `ENABLE_SUBSCRIPTION_EXPIRATION_CRON` | Off; requires exactly `true` | `SUBSCRIPTION_EXPIRATION_INTERVAL_MS=86400000` |
| `ENABLE_CLEANUP_NON_WORKING_DAYS_CRON` | Off; requires exactly `true` | Nightly cleanup of past non-working dates |
| `ENABLE_EVENT_REMINDERS_CRON` | Off; requires exactly `true` | Every ten minutes |
| `ENABLE_MEDIA_RECONCILIATION` | Off; requires exactly `true` | `MEDIA_RECONCILIATION_INTERVAL_MS=300000` |

`BOOKING_REMINDER_STALE_CLAIM_TIMEOUT_MS` and `EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS` default to `300000` ms. Keep worker settings consistent. The media reconciliation settings are implemented in code but are not yet included in `.env.example`.

### Frontend build

| Variable | Local value / purpose |
|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | `http://localhost:5000` |
| `VITE_API_ORIGIN` | `http://localhost:5000`, for backend media URLs |
| `VITE_GOOGLE_CLIENT_ID` | Optional public Google OAuth client ID matching the backend configuration |

Vite embeds these values in the bundle. Set deployment values before building; changing runtime environment variables on a static host does not update an existing bundle.

## Testing & Quality

All commands below start at the **repository root**. No root npm script is assumed.

```bash
# Maintained backend package test suite
(cd backend && npm test)

# Focused backend example
(cd backend && node --test src/services/salon/salonJobOnboardingService.test.js)

# All backend *.test.js files in the current source/test locations
(cd backend && node --test --test-concurrency=1 "src/**/*.test.js" "cron/**/*.test.js" "migrations/**/*.test.js" "scripts/**/*.test.js")

# Full frontend suite and a focused example
(cd frontend && npm test)
(cd frontend && npm test -- src/features/jobs/components/JobOnboardingConsentCard.test.jsx)

# Frontend quality gates
(cd frontend && npm run lint)
(cd frontend && npm run build)

git diff --check
```

Backend `npm test` runs selected model tests, then controller, middleware, selected model, route, service, socket and utility tests with serial file concurrency. It **does not include every backend test**: config, cron, migration, script and several other model tests require explicit coverage such as the all-files command above. Do not equate a passing package suite with complete integration coverage.

Many tests mock persistence. Real MongoDB transaction tests are separately gated with `RUN_REAL_MONGO_TRANSACTION_TESTS=true` and `MONGO_URI`; use a disposable test database and inspect the chosen tests' setup/cleanup. A local MongoDB is not a blanket requirement for every unit test, and skipped integration tests do not prove database concurrency behavior.

Frontend `npm test` is `vitest run`; `npm run test:watch` starts watch mode. `npm run lint` uses ESLint and `npm run build` creates `frontend/dist/`; `npm run preview` serves a local build preview. Documentation-only edits need command/link/content validation and `git diff --check`, rather than unrelated large suites.

### Operational scripts

Run scripts from `backend`, or use the same `(cd backend && ...)` convention. Inspect each script before using it against a database; an audit and its optional apply mode are different operations.

| Package script | Purpose |
|---|---|
| `npm run audit:legacy-salons` | Read-only legacy membership audit |
| `npm run audit:subscription-payment-attempts` | Audit payment attempts; optional `-- --apply-indexes` mutates indexes after clean validation |
| `npm run index:barberprofiles:barberId` | Preflight audit by default; `-- --apply` creates/verifies the unique profile owner index |
| `npm run backfill:booking-slot-holds` | Dry-run overlap/hold audit; `-- --write` backfills, and `-- --write --create-indexes` also creates indexes after a successful dry run |
| `npm run migrate:salons` | Legacy multiple-salon migration |
| `npm run migrate:fix-work-history` | Work-history migration |
| `npm run migrate:schedule-per-salon` | Per-salon schedule migration |
| `npm run subscriptions:grace` | Operational grace-subscription grant |

Additional direct scripts cover membership, media and subscription active-seat-count backfills; they do not all have npm aliases. Use their tracked implementations and focused tests for invocation/options.

## Production & Deployment

### Startup and services

Deploy the backend as a Node/Express service from `backend`, with `npm ci` and `npm start`. Deploy the frontend separately using `npm ci` and `npm run build` from `frontend`, publishing `dist`. Apply the environment configuration above before starting/building.

Production startup validates the explicit environment, frontend origins, JWT secret, `TRUST_PROXY=true`, Redis URL and namespace. Run behind a trusted proxy that controls forwarded IP headers: the application trusts **one hop**, not arbitrary forwarded chains. Database or required Redis initialization failures prevent normal startup.

`GET /api/health` is a basic liveness response. Use `GET /api/health/ready` for readiness: it checks shutdown state, database connection/ping and required Redis readiness, returning 503 when unavailable. Startup catch-up failure is logged and pending-expiration scheduled retries remain active; catch-up success is not guaranteed merely because the server starts.

### Transactions, indexes and multiple instances

MongoDB transactions and required unique indexes are correctness dependencies, not optional performance tuning. Booking creation fails closed when transaction/slot-hold protection is unavailable. Audit existing overlapping bookings and backfill holds before enabling the required unique indexes. Subscription/payment/seat, membership and scheduler workflows likewise depend on their transaction and uniqueness constraints; do not assume an old standalone database is ready after merely connecting.

Redis shares rate-limit counters and Socket.IO room/events between instances. Use private access, appropriate ACLs and TLS where available. Keep namespace and security settings consistent within one deployment and distinct between environments. While HTTP long-polling remains enabled (the application default), load-balancer session affinity is required in addition to the Redis adapter. WebSocket-only transport is not enabled by the application.

Scheduled jobs use MongoDB leases, renewal and fencing to coordinate workers. Reminder dispatch records add per-recipient duplicate suppression and stale-claim recovery. Transaction failures or lease loss must stop protected writes; do not replace these controls with process-local locks or promise exactly-once external delivery. Graceful shutdown stops workers and disconnects shared resources.

### Media persistence and serving

Uploads use local disk under `backend/uploads`, including hidden managed-media stores. Managed media uses staging, activation/binding and deletion states; legacy URL compatibility is retained where the owning record still permits access. Persist the entire upload root across restarts and include it with database backups. Multiple instances need shared persistent storage, or a future object-store implementation; no cloud-storage integration is currently configured by an environment flag.

| Media | Implemented handler / access policy |
|---|---|
| Avatars and certification images | `/uploads/avatars/:filename`, `/uploads/certifications/:filename`; public handler verifies record binding and managed-media state |
| Event images | Registered static handler under `/uploads/events`, with dotfiles denied, no directory index and no fallthrough |
| Event certificate files | Registered `/uploads/certificate-files/:filename` handler requires a bound issued certificate |
| Public portfolio images | Registered `/uploads/portfolio/:filename` handler checks active/public status and consent |
| Owner portfolio images | Protected `/api/portfolio/:id/images/:kind`, with owner checks |
| Booking reference images | Protected `/api/bookings/:bookingId/reference-images/:imageName`, with booking ownership/eligible manager and binding checks; never a public upload directory |

**Current routing limitation:** in `server.js`, `/uploads/:kind/:filename` is registered before the event, certificate-file and portfolio handlers. Its profile handler returns 404 for those other kinds instead of passing through, so their ordinary public GET URLs are currently intercepted. Those handlers exist, but public file delivery through these URLs needs a separate routing correction before deployment can rely on it. Do not work around this by exposing the entire upload directory, which would bypass privacy checks.

Opt-in media reconciliation retries eligible failed/deletion work and handles aged staged records through persistent claims. It supports recovery after partial storage/database failures; it is not a backup system or a blanket deletion scan of all uploads. Monitor unresolved failures and enable it deliberately using the scheduler settings above.

### Browser hosting and restricted routes

Serve the frontend with SPA fallback to `index.html` for application routes, including `/salons/:salonId/book` and `/admin/*`. For example, on a frontend-only nginx host:

```nginx
location / {
  try_files $uri /index.html;
}
```

Production CORS is restricted to configured frontend origins and allows credentials. HTTPS and a compatible refresh-cookie SameSite policy are necessary for session refresh; separate origins are not automatically separate sites. Keep cookie protections intact when selecting the deployment domain arrangement.

Debug `/api/debug/*` routes are mounted in **non-production** environments (`development` and `test`), not in production. Separately, `POST /api/bookings/availability-debug` remains mounted in production: it requires authentication and checks the barber/salon relationship and manager privacy boundaries rather than an environment flag. Subscription dev confirmations are blocked in production; privileged platform manual operations remain separately controlled as described in billing.

## Security & Operational Invariants

- **Sessions:** password and optional Google login issue 15-minute access JWTs; the browser keeps access tokens in memory and refreshes through a rotating HttpOnly cookie. Refresh-session records store token hashes, expiry and revocation state, with family reuse detection. Account auth-version changes invalidate older tokens.
- **Cookies:** production uses `__Host-hairbook-refresh` with Secure, HttpOnly, path `/` and no Domain. SameSite defaults to `lax`. Cookie-authentication mutations require an allowed Origin/Referer and `X-HairBook-CSRF: 1`; the frontend session client supplies the header. These endpoints are not callable with an arbitrary cross-origin form.
- **Sensitive account actions:** password reset, logout/all-session invalidation, recent authentication and account deletion are implemented. Account deletion has business/dependency checks rather than unrestricted removal of owned salon data.
- **Authorization/IDOR:** derive identities from authenticated accounts, scope database queries and mutations to the resource, preserve staff/chair-renter privacy, and treat server checks as authoritative. Availability projections, private treatment data, applicant data and media bindings are distinct exposure boundaries.
- **Payments:** client payloads, pending deposits, unsigned webhooks and unavailable transaction infrastructure must not manufacture paid status or access. Preserve payment idempotency and authoritative seat capacity.
- **Concurrency/failures:** retain transactional slot holds, package dependency validation, unique application/request constraints, conditional state transitions and scheduler fences. Some post-commit notifications/cleanup are best-effort or can fail after persistence; an error is not proof that nothing committed. Re-read authoritative state before retrying dependent work.
- **HTTP protections:** Express disables `X-Powered-By`; Helmet sets security headers. CSP and COEP are intentionally disabled. CORP is `same-origin` except designated public-media routes; production HSTS is one year with subdomains and no preload. CORS is not an authorization substitute.
- **Operations:** keep environment secrets, allowlist identities, refresh tokens, upload contents and operational credentials out of source control and public logs. Keep lockfiles; exclude `.env`, `node_modules`, build outputs and uploads.

## Roadmap

- Integrate a real payment provider with checkout, verified webhooks and operational reconciliation; real deposit collection and no-show fee automation remain future work.
- Resolve the public-media routing limitation documented above; object storage remains a future deployment integration.
- Expand unsupported job-onboarding arrangements only with explicit mappings and applicant consent; current applicant confirmation and manager status UX are already implemented.
- Scoped platform roles remain deferred until an operational need exists beyond the current superuser/capability model.
- Native mobile clients, deeper forecasting, referral/targeted marketing and wider email notification coverage remain possible extensions. Existing vouchers, salon promotions, reports and relationship-confirmation UI are implemented foundations, not wholly deferred features.

## Additional Documentation

- [AI Project Context](docs/AI_PROJECT_CONTEXT.md): deeper architecture, workflows and sensitive implementation areas.
- [Production Checklist](docs/PRODUCTION_CHECKLIST.md): operational reference; reconcile older test counts/configuration assumptions with this README and current code.
- [Render Deployment Guide](docs/RENDER_DEPLOYMENT.md): hosting-specific guidance; older Node, infrastructure and upload assumptions need the constraints documented here.
- [Service Category Audit](docs/service-category-audit-2026-05-26.md): historical category analysis.
- [Agent Rules](AGENTS.md): repository change workflow and safety constraints.
