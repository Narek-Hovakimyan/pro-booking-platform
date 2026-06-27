# AI Project Context — HairBook / Barber Booking Platform

This document is a handoff for future AI agents working on this repository. It is documentation only. Use the codebase as the source of truth before making changes, and update this file when code behavior materially changes.

## 1. Project overview

HairBook is an active web application for beauty-service booking. It supports clients booking specialists, specialists managing services/schedules/bookings, and salon owners/admins managing salon staff, calendars, reports, billing seats, jobs, promotions, and events.

Main user types:

- `client`: can browse specialists/salons, book appointments, manage their bookings, favorite salons/specialists, message users, register for events, and leave reviews for completed bookings.
- `barber`: the business-user role for specialists and salon managers. Despite the name, the app supports multiple professions through `profession` and `barberType`.
- Salon owner/admin: still `role: "barber"` at the auth level, with salon-scoped management rights through `Salon.ownerId` or `Salon.admins`.
- Salon staff/chair renter: a barber connected to a salon through `User.salons[]`, with `relationshipType` and `relationshipStatus`.
- Platform admin: optional platform-level access through `User.platformRole === "admin"` or allowlist env vars; separate from `role`.

Current development status:

- This is an active web app with many implemented workflows and tests, not a finished production SaaS unless code proves a specific area is complete.
- Payment/provider work is a foundation with manual/mock/disabled providers and webhook plumbing. Do not claim real third-party payment processing is complete unless code and configuration prove it.
- There is no mobile app in this repository.

Current behavior:

- Frontend is a Vite React app under `frontend/`.
- Backend is an Express/Mongoose API under `backend/`.
- Realtime messaging/notifications use Socket.IO with JWT-authenticated user rooms.

Do not break:

- Backend-authoritative booking pricing, discounts, subscriptions, schedule validation, salon-scoped permissions, and upload access controls.
- Exact `salonId` context in salon booking, schedules, reports, and billing.

## 2. Tech stack

Frontend:

- React 19, Vite, React Router, Redux Toolkit, React Redux.
- Axios API client in `frontend/src/shared/api/axios.js`.
- Socket.IO client in `frontend/src/shared/lib/socket.js`.
- Tailwind CSS with shared UI helpers/components in `frontend/src/shared/components/ui/`.
- `lucide-react` icons.
- i18next/react-i18next is installed.

Backend:

- Node.js ESM modules.
- Express 5 API in `backend/src/server.js`.
- MongoDB with Mongoose models.
- JWT auth in `backend/src/middleware/authMiddleware.js`.
- Socket.IO server in `backend/src/socket.js`.
- Multer uploads in `backend/src/middleware/uploadMiddleware.js`.
- Rate limiting in `backend/src/middleware/rateLimitMiddleware.js`.
- Cron/schedulers for reminders, subscription expiration, waitlist expiration, non-working day cleanup, and pending booking expiration.

Database:

- MongoDB via `MONGO_URI`.
- Mongoose schemas under `backend/src/models/`.

Realtime/messaging:

- Socket.IO authenticates using JWT from socket auth or Authorization header.
- Users join room `user:<userId>`.
- Backend emits booking updates, notifications, and `newMessage` events.

Upload/media handling:

- Avatars: `backend/uploads/avatars` served at `/uploads/avatars`.
- Certifications: `backend/uploads/certifications` served at `/uploads/certifications`.
- Events: `backend/uploads/events` served at `/uploads/events`.
- Certificate files: `backend/uploads/certificate-files` served at `/uploads/certificate-files`.
- Portfolio: `backend/uploads/portfolio` served at `/uploads/portfolio`.
- Booking reference images: stored in `backend/uploads/booking-references`, but not publicly mounted; fetched through protected booking image route.
- Image uploads allow JPEG/PNG/WEBP. Certificate file uploads allow PDF/JPEG/PNG/WEBP.

Test tools/scripts:

- Backend uses Node's built-in test runner.
- Frontend uses ESLint and Vite build.

Styling/UI approach:

- Tailwind utility classes, neutral backgrounds, white cards, rounded UI, soft borders/shadows, purple/pink accent gradients in redesigned admin areas.
- Shared UI primitives include `Button`, `Card`, `Drawer`, `ConfirmModal`, `EmptyState`, `LoadingSkeletons`, and badges.

## 3. Repository structure

- `backend/`: Express API, Mongoose models, controllers, routes, services, middleware, cron jobs, migrations, scripts, and upload folders.
- `backend/src/models`: Mongoose schemas for users, salons, bookings, schedules, services, portfolio photos, reviews, messages, notifications, events, subscriptions, payments, vouchers, loyalty, waitlist, jobs, and platform audit logs.
- `backend/src/controllers`: HTTP controller logic. This is where route handlers enforce much of the business behavior.
- `backend/src/routes`: Express route registration and middleware order. Route order matters for static paths before `/:id` paths.
- `backend/src/services`: shared domain logic for booking pricing, reminders, side effects, subscriptions, payments, salon admin/dashboard/calendar/reports/staff, client reliability, and notifications.
- `backend/src/middleware`: auth, platform access, subscription gates, upload validation, and rate limiting.
- `backend/src/utils`: pure helpers for booking dates/slots, schedule normalization, salon permissions/serialization, media URL safety, event utilities, and controller errors.
- `backend/cron`: cron entry points for cleanup/reminders/expiration.
- `backend/migrations`: one-off data migrations for salons/work history/schedules.
- `backend/scripts`: one-off operational scripts.
- `backend/uploads`: local upload storage used by backend static serving and protected file reads.
- `frontend/`: Vite React app.
- `frontend/src/barber`: specialist/admin-facing pages, components, hooks, and utils.
- `frontend/src/client`: client-facing booking/search/profile/favorites/waitlist pages and components.
- `frontend/src/shared`: shared API clients, components, hooks, utilities, and data constants.
- `frontend/src/features`: feature-specific components/utils are present for jobs and events.
- `frontend/src/platform`: platform admin billing pages.
- `uploads/`: repo-root upload folders also exist. Backend code uses `process.cwd()/uploads`, so runtime cwd determines which upload root is active. Verify server cwd before changing media behavior.

## 4. How to run the project

Backend (`backend/package.json`):

- Install: `npm install`
- Development: `npm run dev`
- Production start: `npm start`
- Tests: `npm test`
- Migrations/scripts:
  - `npm run migrate:salons`
  - `npm run migrate:fix-work-history`
  - `npm run migrate:schedule-per-salon`
  - `npm run subscriptions:grace`

Frontend (`frontend/package.json`):

- Install: `npm install`
- Development: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Preview: `npm run preview`

Environment variable names only:

- Backend: `MONGO_URI`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `CLIENT_URL`, `TRUST_PROXY`, `RATE_LIMIT_ENABLED`, `APP_PUBLIC_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_VERIFICATION_LOG_URL`, `RESEND_API_KEY`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `ALLOW_DEV_PAYMENT_CONFIRM`, `PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_IDS`, `ENABLE_CLEANUP_NON_WORKING_DAYS_CRON`, `ENABLE_EXPIRE_PENDING_BOOKINGS_CRON`, `ENABLE_EVENT_REMINDERS_CRON`.
- Frontend: `VITE_API_URL`, `VITE_API_ORIGIN`, `VITE_SOCKET_URL`, `DEV`.

Do not put real credentials, URLs, tokens, emails, or keys in docs.

## 5. Main roles and access model

Application auth roles:

- `User.role` is either `client` or `barber`.
- Platform admin access is separate: `platformRole: "admin"` or configured allowlists in platform middleware.

Salon access:

- A salon is owned by `Salon.ownerId`.
- Salon admins are listed in `Salon.admins`.
- Owner/admin management is salon-scoped. A user can manage one salon and not another.
- `getManageableSalonQuery` intentionally means owner/admin only; approved staff or chair renters are not management users.

Salon membership:

- Current multi-salon membership is stored in `User.salons[]`.
- Legacy fields `User.salon` and `User.salonStatus` are still used as fallback.
- Membership statuses include `pending`, `approved`, and `rejected`.
- Join request documents use `SalonJoinRequest.status` values `pending`, `accepted`, `rejected`, `cancelled`.
- Relationship fields include `relationshipType: "staff" | "chair_renter"`, `relationshipStatus: "pending" | "accepted" | "rejected"`, `worksAsSpecialist`, and `staffPayment`.

Important rules:

- Owner/admin is salon-scoped. Always check the exact salon.
- Owner is not automatically a bookable specialist unless `worksAsSpecialist` supports it. `createSalon` accepts `ownerWorksAsSpecialist`; public salon listing uses `isBookableSalonSpecialist`.
- Owner must not appear as editable staff/chair_renter specialist. Staff payment and relationship type updates reject salon owner targets.
- Chair renter privacy must be preserved. Chair renters are excluded from salon subscription seats and salon staff earnings reporting.
- Exact `salonId` context matters for schedules, services access, bookings, public salon booking, reports, subscriptions, and billing.
- `worksAsSpecialist === false` excludes a member from staff/specialist listing.

## 6. Frontend route map

Routes are defined in `frontend/src/App.jsx`.

- `/`: `frontend/src/client/pages/HomePage.jsx`; redirects barbers to `/admin`, clients see home. Do not break role-based redirect.
- `/register`: `frontend/src/pages/RegisterPage.jsx`; registration.
- `/login`: `frontend/src/pages/LoginPage.jsx`; login.
- `/barbers` and `/specialists`: `frontend/src/client/pages/BarbersPage.jsx`; protected client discovery. High risk: availability, paid-access filtering, favorites.
- `/barbers/:barberId/profile` and `/specialists/:barberId/profile`: `frontend/src/client/pages/ClientBarberProfilePage.jsx`; protected client view of specialist profile, services, reviews, portfolio.
- `/salons`: `frontend/src/client/pages/SalonsPage.jsx`; protected salon discovery.
- `/salons/:salonId`: `frontend/src/pages/SalonProfilePage.jsx`; public salon profile.
- `/salons/:salonId/book`: `frontend/src/pages/SalonPublicBookingPage.jsx`; public salon booking flow. High risk: selected `salonId`, specialist schedule, promo code, deposit display, and backend-created booking.
- `/booking`: redirects protected clients to `/barbers`.
- `/booking/:barberId`: `frontend/src/client/pages/BookingPage.jsx`; protected client booking with selected specialist. High risk: quote/booking payload, reference images, consultation/consent, schedule slots.
- `/success`: `frontend/src/client/pages/SuccessPage.jsx`; protected client success page.
- `/my-bookings`: `frontend/src/client/pages/MyBookingsPage.jsx`; protected client booking management, cancellation, review actions, reschedule.
- `/my-waitlist`: `frontend/src/client/pages/MyWaitlistPage.jsx`; protected client waitlist.
- `/favorites`: `frontend/src/client/pages/FavoritesPage.jsx`; protected client favorites.
- `/profile`: `frontend/src/client/pages/ClientProfilePage.jsx`; protected client profile.
- `/messages` and `/messages/:userId`: `frontend/src/pages/MessagesPage.jsx`; protected messaging. High risk: conversation identity and realtime updates.
- `/notifications`: `frontend/src/pages/NotificationsPage.jsx`; protected notifications.
- `/jobs`: `frontend/src/pages/JobsPage.jsx`; public/semi-public salon job listings.
- `/jobs/applications`: `frontend/src/pages/MyJobApplicationsPage.jsx`; protected barber job application tracking.
- `/events`: `frontend/src/pages/EventsPage.jsx`; protected event discovery/management/registration.
- `/my-events`: `frontend/src/barber/pages/MyEventsPage.jsx`; protected event registrations/organized events/certificates.
- `/certificates/:certificateId`: `frontend/src/pages/CertificatePage.jsx`; public certificate display by certificate id.

Admin/specialist routes:

- `/admin`: `frontend/src/barber/pages/AdminPage.jsx` -> `frontend/src/barber/components/AdminPanel.jsx`; dashboard section. High risk: current user data loading and section routing.
- `/admin/services`: `AdminPage` services section; subscription-gated. Uses `ServicesManager`. Do not break package services, discounts, custom categories, active status.
- `/admin/schedule`: `AdminPage` schedule section; subscription-gated. Uses `ScheduleManager`. High risk: non-working days, overrides, per-salon schedules.
- `/admin/settings`: `AdminPage` settings section. Uses `BarberSettings`.
- `/admin/settings/salon`: salon settings subsection.
- `/admin/settings/default-schedule`: default schedule subsection.
- `/admin/settings/certifications`: certifications subsection.
- `/admin/settings/deposit`: deposit settings subsection.
- `/admin/bookings`: `AdminPage` bookings section; subscription-gated. Uses `BookingsList`. High risk: booking status lifecycle.
- `/admin/clients`: `frontend/src/barber/pages/ClientsPage.jsx`; subscription-gated client CRM/loyalty.
- `/admin/portfolio`: portfolio section; subscription-gated. Uses `PortfolioManager`.
- `/admin/waitlist`: waitlist section; subscription-gated.
- `/admin/jobs`: salon jobs management.
- `/admin/vouchers`: vouchers section; subscription-gated.
- `/admin/salon/promotions`: salon promotion manager section.
- `/admin/calendar`: `frontend/src/barber/pages/BarberCalendarPage.jsx`; subscription-gated calendar.
- `/admin/calendar/day/:date`: `frontend/src/barber/pages/BarberCalendarDayPage.jsx`; subscription-gated calendar day.
- `/admin/profile`: `frontend/src/barber/pages/BarberProfilePage.jsx`; redesigned profile management. High risk: avatar/profile upload, email verification, work history, public profile fields.
- `/admin/revenue`: `frontend/src/barber/pages/RevenuePage.jsx`; subscription-gated personal revenue.
- `/admin/billing`: `frontend/src/barber/pages/BillingPage.jsx`; personal subscription billing.
- `/admin/salon/billing`: `frontend/src/barber/pages/SalonBillingPage.jsx`; salon subscription/seat billing.
- `/admin/salon/dashboard`: `frontend/src/barber/pages/SalonDashboardPage.jsx`; salon owner/admin dashboard.
- `/admin/salon/calendar`: `frontend/src/barber/pages/SalonCalendarPage.jsx`; salon calendar.
- `/admin/salon/reports`: `frontend/src/barber/pages/SalonReportsPage.jsx`; salon reports/CSV export.
- `/admin/platform/billing`: `frontend/src/platform/pages/PlatformBillingPage.jsx`; protected platform billing UI, backend also requires platform admin.
- `/admin/platform/billing/salons/:salonId`: `frontend/src/platform/pages/PlatformSalonBillingDetailPage.jsx`; platform salon billing detail.

Do not break:

- `ProtectedRoute` role gates and `SubscriptionGuard` gates.
- Loading/empty/error states in admin and client workflows.
- Mobile layout constraints in booking, admin dashboard, profile, and salon pages.

## 7. Backend API map

Routes are mounted in `backend/src/server.js`.

Auth/user/profile:

- `backend/src/routes/authRoutes.js` -> `authController.js`: `POST /api/auth/register`, `POST /api/auth/login`; auth rate limiter applied first.
- `backend/src/routes/userRoutes.js` -> `userController.js`: `/api/users/me`, profile update with avatar upload, email verification, public barber list.
- `backend/src/routes/barberRoutes.js` -> `barberProfileController.js`, `barberClientController.js`, `certificationController.js`, `depositSettingsController.js`: public barber profiles/card summary, profile upsert with avatar, client CRM, loyalty settings, certifications, deposit settings, salon default schedule.
- Important access: `protect` for private profile and upload writes; `requireBarberSubscription` for CRM/certification upload routes; public barber endpoints must not expose passwords or platform internals.

Bookings:

- `backend/src/routes/bookingRoutes.js` -> `bookingController.js`, `bookingReadController.js`, `bookingRescheduleController.js`, `bookingOutcomeController.js`, `bookingAnalyticsController.js`.
- Purpose: quote price, create booking, read client/barber bookings, update lifecycle, reschedule request, delay, protected reference image access, no-show/late-cancel outcomes, treatment record, availability debug.
- Important access: clients create only for themselves; barbers create manual bookings only for their own calendar; assigned barber handles accept/complete/reject; clients cancel their own bookings; subscription gates apply to barber management.

Schedules:

- `backend/src/routes/scheduleRoutes.js` -> `scheduleController.js`.
- `GET /api/schedules/:barberId` legacy primary schedule.
- `GET /api/schedules/:barberId/:salonId` per-salon schedule.
- `PUT /api/schedules` legacy write intentionally rejects and requires salon route.
- `PUT /api/schedules/:barberId/:salonId` saves per-salon schedule.
- Important access: only barber can edit own schedule, and only for approved/accepted salon context.

Salons, staff, membership:

- `backend/src/routes/salonRoutes.js` -> `salonController.js`, `salonMembershipController.js`, `salonStaffController.js`, `salonDashboardController.js`, `salonCalendarController.js`, `salonReportController.js`, `publicSalonBookingController.js`, `salonPromotionController.js`, `depositSettingsController.js`.
- Purpose: public salon list/profile, manageable salons, join requests, owner/admin requests, staff/admins, dashboard/calendar/reports/export, public booking payload, promotions, deposit/payment settings.
- Important access: owner/admin only for management, reports, staff payment, promotions, dashboard/calendar. Staff can view staff list only if approved member/owner/admin.

Services:

- `backend/src/routes/serviceRoutes.js` -> `serviceController.js`.
- Public service list by barber; create/update/delete subscription-gated for barbers.
- Important access: public service list hides unpaid/expired barbers; services belong to the authenticated barber; service price/duration validation is backend-side.

Service categories:

- `backend/src/routes/serviceCategoryRoutes.js` -> `serviceCategoryController.js`.
- Lists system/custom categories and allows protected create/update/delete.

Portfolio:

- `backend/src/routes/portfolioPhotoRoutes.js` -> `portfolioPhotoController.js`.
- Public portfolio by barber; protected own portfolio management; uploads before/after images.
- Important access: only owner barber can manage; public requires `active`, `isPublic`, and `consentConfirmed`.

Reviews:

- `backend/src/routes/reviewRoutes.js` -> `reviewController.js`.
- Barber reviews, create verified booking review, barber reply/delete reply.
- `backend/src/routes/salonReviewRoutes.js` -> `salonReviewController.js`.
- Important access: review requires completed own booking; reply requires owning barber or salon management depending review type.

Messages and notifications:

- `backend/src/routes/messageRoutes.js` -> `messageController.js`; protected conversations and message creation with rate limit.
- `backend/src/routes/notificationRoutes.js` -> `notificationController.js`; protected notification read/delete.
- Important access: only authenticated user reads their messages/notifications.

Events/certificates:

- `backend/src/routes/eventRoutes.js` -> `eventController.js`, `eventRegistrationController.js`, `certificateController.js`, `eventReviewController.js`.
- `backend/src/routes/certificateRoutes.js` -> `certificateController.js`.
- Purpose: events, registration approval/waitlist/rejection, attendance, certificate issuance/upload, public verification.
- Important access: event creation requires salon owner/admin or approved salon membership; event updates/registration management/certificates require organizer or salon owner/admin.

Subscriptions/billing/payment:

- `backend/src/routes/subscriptionRoutes.js` -> `subscriptionController.js`, `subscriptionService.js`, `paymentAttemptService.js`.
- `backend/src/routes/paymentRoutes.js` -> `paymentController.js`; raw webhook route is mounted before JSON parser.
- `backend/src/routes/platformRoutes.js` -> `platformBillingController.js`; platform admin only.
- Important access: exact ownerType/ownerId checks; salon billing owner/admin only; platform billing platform admin only.

Reports/export:

- Salon reports are under `backend/src/routes/salonRoutes.js`: `/api/salons/:salonId/reports` and `/api/salons/:salonId/reports/export`.
- Implemented by `backend/src/services/salon/salonReportService.js`.
- Important access: owner/admin only, active salon subscription required, exact `salonId`, chair renters excluded from staff earnings.

Other:

- Favorites: `favoriteRoutes.js`.
- Loyalty: `loyaltyRoutes.js`.
- Vouchers: `voucherRoutes.js`.
- Revenue: `revenueRoutes.js`.
- Waitlist: `waitlistRoutes.js`.
- Jobs: `salonJobRoutes.js`.
- Health: `healthRoutes.js`.
- Debug: `debugRoutes.js`, mounted only outside production.

## 8. Data models overview

User (`backend/src/models/User.js`):

- Auth/profile user with `role`, phone, email verification fields, city/avatar, profession, salon legacy fields, `salons[]`, loyalty discount settings, work history, optional `platformRole`.
- `salons[]` stores salon membership status, primary flag, default schedule, relationship type/status, `worksAsSpecialist`, request metadata, and staff payment settings.
- Sensitive fields like password and email verification token hash must not be exposed.

Salon (`backend/src/models/Salon.js`):

- Salon profile with name/city/address/phone/image, ownerId, admins.

Booking (`backend/src/models/Booking.js`):

- Appointment between `barberId`, optional `clientId`, `serviceId`, optional `salonId`.
- Stores service snapshot fields: serviceName, duration, price/final price fields, discounts, voucher/loyalty snapshots.
- Statuses include `pending`, `accepted`, `confirmed`, `completed`, `cancelled`, `rejected`, `expired`, `no_show`, `late_cancelled`.
- Includes consultation, consent, referenceImages, rescheduleRequest, treatmentRecord, deposit/payment fields, refund fields.

Schedule (`backend/src/models/Schedule.js`):

- Per-barber per-salon schedule with unique `{ barberId, salonId }`.
- Fields: weeklySchedule, dateSchedules, scheduleOverrides, nonWorkingDays, defaultSchedule.

Service (`backend/src/models/Service.js`):

- Barber-owned service with name, price, duration, description, category/customCategoryId, tags, active flag, type `single`/`package`, included services, package price/duration modes, discountType/discountValue.

PortfolioPhoto (`backend/src/models/PortfolioPhoto.js`):

- Before/after images with barberId, optional salonId/serviceId, category/caption/tags/sortOrder, `isPublic`, `consentConfirmed`, `active`.

Review (`backend/src/models/Review.js`):

- One review per booking, client/barber refs, rating/comment, `isVerified`, optional barber reply.

Notification (`backend/src/models/Notification.js`):

- User notification with type/message/read flag/data refs. TTL index deletes after 180 days.

Message (`backend/src/models/Message.js`):

- Direct messages with senderId, receiverId, text, isRead, createdAt.

Event / EventRegistration / EventCertificate:

- `Event`: title/description/type/instructor/date/time/duration/price/maxParticipants/location/salonId/organizer/visibility/status/certificate flags.
- `EventRegistration`: event/user, legacy barberId, status `pending|approved|rejected|cancelled|waitlisted`, message/rejection, attendance, certificate link.
- `EventCertificate`: issued certificate with event/registration/user/organizer/salon snapshot, certificateId, verificationCode, status, optional uploaded file data.

Subscription / SubscriptionPaymentAttempt / SubscriptionSeat / PaymentRecord:

- `Subscription`: ownerType `barber|salon`, ownerId, payerId, plan, status, seats, price, period, provider ids.
- `SubscriptionPaymentAttempt`: payment attempt for subscription or booking deposit, provider fields, amount/currency, status, metadata, expiration and processed events.
- `SubscriptionSeat`: salon subscription seat assigned to barber, active/revoked.
- `PaymentRecord`: historical subscription payment record.

PaymentTransaction / PaymentEvent:

- `PaymentTransaction`: general payment/deposit/subscription/refund transaction foundation with ownerType `booking|subscription`.
- `PaymentEvent`: provider webhook/event record with rawPayload `select: false`.

Other important models:

- `Voucher`, `LoyaltyProgram`, `LoyaltyProgress`, `Favorite`, `SalonFavorite`, `SalonReview`, `ServiceCategory`, `ClientRelationship`, `WaitlistEntry`, `SalonJobPost`, `SalonJobApplication`, `PlatformAuditLog`.

## 9. Booking workflow

Booking creation:

- Client booking uses `POST /api/bookings`; manual barber-created booking also uses this route with `createdBy: "barber"`.
- Client must be authenticated as `client` and create only for their own `clientId`.
- Manual booking must be authenticated as assigned barber and creates status `accepted`.
- For barbers in multiple approved salons, `salonId` is required; otherwise primary/only approved salon may be inferred.
- Backend validates selected salon exists, barber works in it, and paid access/seat access is active.
- Backend validates service belongs to barber and is active.
- Backend validates slot with schedule, non-working day, break, past-time, far-future, and booking conflict checks.
- Booking creation is guarded by an in-process lock keyed by barber/date to reduce double-booking races.

Statuses:

- Blocking statuses for slot conflicts: `pending`, `accepted`, `confirmed`.
- Non-blocking examples: `rejected`, `cancelled`, `expired`; tests also cover these.
- Completion is only from `accepted`.
- Rejection/cancellation require reason strings and are limited to 300 chars.
- `confirmed` is normalized as accepted in some helpers.

Consultation, consent, reference images:

- Booking create parses consultation/consent, including JSON string values from multipart form submissions.
- Up to 5 reference images can be uploaded on booking creation.
- Reference images are private: stored in booking-references and fetched through `GET /api/bookings/:bookingId/reference-images/:imageName` with auth.

Reschedule behavior:

- Clients cannot directly change date/time on pending/accepted bookings through generic update; they must use reschedule request routes.
- Reschedule request status is `pending|accepted|rejected|cancelled`.
- Direct rescheduling path still exists in update logic but is blocked for clients on active bookings; verify in code before changing.

Cancellation/rejection:

- Client can cancel own pending/accepted booking with reason.
- Assigned barber can reject pending/accepted booking with reason.
- Manual booking with no client can be cancelled by assigned barber.
- Cancel/reject restores voucher usage and notifies waitlist for released slots.

Review eligibility:

- Completing a booking creates a review request notification if no review exists.
- Client can review only their own completed booking.
- Booking has `reviewed` flag and `Review` has unique index by bookingId.

Payment/pricing snapshots:

- Booking stores original/service/final price, service discount, voucher/promotion, loyalty snapshots, deposit/payment status fields.
- Current behavior computes price in backend using service discount, voucher, and loyalty logic.

Do not break:

- Frontend is not the source of truth for price, payment, or discounts.
- Preserve backend-authoritative pricing and snapshots.
- Do not mutate the Service price because a booking received a discount/loyalty/voucher.

## 10. Schedule and availability workflow

Default schedule:

- User/salon entry/default schedule uses start/end and optional break fields.
- Schedule defaults can live on Schedule model and `User.salons[].defaultSchedule`.

Weekly schedule:

- `weeklySchedule` is day-keyed (`mon`, `tue`, etc.) with `working`, `from`, `to`, `breakFrom`, `breakTo`.
- Explicit weekly day off (`working: false`) must remain off and not fall through to default hours.

Salon-specific schedule:

- Current write path is per-salon: `PUT /api/schedules/:barberId/:salonId`.
- Legacy `PUT /api/schedules` returns error requiring salonId.
- `Schedule` has unique compound index `{ barberId, salonId }`.

Non-working days/date overrides/breaks:

- `nonWorkingDays` stores explicit date keys.
- `scheduleOverrides` can set a date working or non-working. Saving overrides adjusts nonWorkingDays accordingly.
- `dateSchedules` exists for compatibility/older UI paths.
- Break ranges block slots when service duration crosses break.

Slot generation:

- Backend `validateBookingSlot` is authoritative.
- Frontend `frontend/src/shared/utils/slots.js` generates 10-minute interval slots for UI.
- Slot checks account for service duration, past slots, working hours, breaks, and blocking bookings.

First available slot:

- `frontend/src/shared/utils/availability.js` searches across approved salons day-by-day and returns earliest time across salons for each day.
- Public barber/salon discovery also has backend availability serialization; verify specific endpoint before changing.

Important bugs/rules:

- Explicit non-working days must not fall back incorrectly to default schedule.
- Explicit weekly day off must not fall back incorrectly.
- Old auto-closed weekly schedules are normalized; verify tests before changing schedule normalization.
- Salon context must not leak schedules across salons.
- Conflict checks intentionally check all bookings for a barber across salons to avoid double-booking.

## 11. Salon management workflow

Salon creation/ownership:

- `POST /api/salons` creates a salon owned by authenticated barber.
- Owner is added to `User.salons[]` as approved with `relationshipType: "staff"`, `relationshipStatus: "accepted"`, and configurable `worksAsSpecialist`.
- Legacy salon fields are updated only when there is no primary salon.

Manageable salons:

- `/api/salons/mine/manageable` returns salons where user is owner or admin.
- Approved staff and chair renters are not manageable by default.

Join request/approval:

- Barber requests join via `/api/salons/:salonId/join-requests`.
- Owner/admin sees pending requests and accepts/rejects.
- Accepting updates `SalonJoinRequest`, `User.salons[]`, primary flag for first approved salon, legacy fields when needed, work history, and notifications.
- Leaving salon removes membership, updates work history/legacy fields, revokes salon seats, and notifies owner. Owner cannot leave without transferring/deleting ownership.

Staff vs chair_renter:

- Owner/admin can request relationship type changes for approved members except the owner.
- Member must accept/reject pending relationship request.
- Staff payment settings apply only to accepted `staff` members, not chair renters or owner.
- Chair renters remain independently billed and excluded from salon subscription seat assignment.

Owner exclusion:

- Owner cannot receive staff payment settings.
- Owner relationship type cannot be changed.
- Owner should not appear as editable staff/chair_renter specialist.

Chair renter privacy expectations:

- Do not include chair renter revenue in salon staff earnings.
- Do not count chair renters against salon subscription seats.
- Avoid exposing chair renter private payment/client details to salon reports/admins unless code explicitly allows it.

## 12. Services workflow

Service creation/edit/delete:

- Routes: `GET /api/services/:barberId`, `POST /api/services`, `PUT /api/services/:id`, `DELETE /api/services/:id`.
- Writes require `protect` and `requireBarberSubscription`.
- Services are barber-owned; create/update/delete must not allow editing another barber's service.

Price/duration:

- Backend validates price non-negative and duration positive.
- Package services can auto-calculate price/duration from included single services when package modes are `sum`.
- Package services must include at least two active single services and cannot include another package.

Visibility/status:

- `active` controls availability. Public/service lookup uses active service checks during booking.

Discount interactions:

- Service discount fields: `discountType: "none"|"percent"|"fixed"`, `discountValue`.
- Backend calculates discounted service price in `calculateServiceDiscountedPrice`.
- Booking pricing then applies voucher or loyalty according to backend service logic.

Important:

- Service price must not mutate because of booking discount, loyalty, voucher, or promotion unless code explicitly says otherwise.
- Keep service discount validation backend-side even if frontend validates too.

## 13. Portfolio/gallery workflow

Portfolio photos:

- Model: `PortfolioPhoto`.
- Routes: `GET /api/portfolio/barber/:barberId`, `GET /api/portfolio/me`, `POST /api/portfolio`, `PUT /api/portfolio/:id`, `DELETE /api/portfolio/:id`.
- Frontend management: `frontend/src/barber/components/PortfolioManager.jsx`, modal `PortfolioPhotoFormModal.jsx`, profile gallery sections.

Upload behavior:

- Create requires both `beforeImage` and `afterImage`.
- Portfolio uploads allow JPEG/PNG/WEBP and are limited to 10 MB per file.
- Files are stored under `/uploads/portfolio`.
- Unexpected create failures clean up uploaded files.
- Delete is soft-delete (`active = false`) and intentionally does not delete files.

Visibility/consent:

- Public listing requires `active: true`, `isPublic: true`, and `consentConfirmed: true`.
- Controller rejects public photo create/update if consent is not confirmed.
- Optional `salonId` is accepted only when the barber is associated with that salon; otherwise it is dropped/null.
- Optional `serviceId` must belong to the barber and be active.

Display:

- Admin/profile display uses portfolio API and gallery sections.
- Public display uses public portfolio endpoint and should never show private/non-consented photos.

## 14. Reviews and replies

Barber reviews:

- Client can create a review only for their own completed booking.
- Rating must be numeric 1 to 5.
- Review barberId must match booking.barberId.
- One review per booking via unique index.
- Reviews are serialized with client name and `isVerified` true by default.

Replies:

- Only the reviewed barber can add/delete reply on barber review.
- Reply stores message, repliedBy, updatedAt.
- Delete clears reply fields.

Salon reviews:

- `salonReviewRoutes.js` supports salon review listing/check/create/reply/delete reply.
- Verify exact owner/admin/client rules in `salonReviewController.js` before changing.

Important UI states:

- Preserve review request notification flow after completed booking.
- Preserve empty/loading/error states in review sections.
- Do not let users review incomplete bookings or another user's booking.

## 15. Messages and notifications

Messages:

- Direct messages are simple user-to-user conversations.
- Send route requires `receiverId` and text, rejects self-message, validates receiver ObjectId/existence, and limits text to 5000 chars.
- Sending creates a `message_received` notification and emits `newMessage` to both sender and receiver Socket.IO rooms.
- Conversation reads mark messages from the other user to current user as read.

Notifications:

- Notification routes are protected and operate on the authenticated user's notifications.
- Notifications include booking, message, event, job, salon, loyalty, voucher, waitlist data refs.
- Notification documents expire after 180 days.

Realtime behavior:

- Socket server requires valid JWT.
- Socket joins authenticated `user:<id>` room.
- Client connects when current user/token exist and disconnects otherwise.

Privacy/access expectations:

- Do not expose conversations or notifications across users.
- Do not trust frontend user IDs for access; backend uses token user.
- Keep notification data minimal and avoid internal payment/provider details.

## 16. Events and certificates

Event creation:

- Events can be associated with a salon or be off-site.
- Creating an event requires authenticated `barber`.
- With `salonId`, creator must be salon owner/admin or approved salon barber.
- Without `salonId`, creator must have at least one manageable salon.
- Event required fields include title, instructor, date, time, duration, location.
- Event image upload supports JPEG/PNG/WEBP.

Organizer rules:

- Event updates/cancellation/attendance/registrations/certificates require organizer or salon owner/admin.
- Organizer cannot register for their own event.

Registration states:

- `pending`, `approved`, `rejected`, `cancelled`, `waitlisted`.
- Registration is waitlisted automatically when approved registration count meets maxParticipants.
- Participant can cancel pending/waitlisted registrations; approved cancellation by participant is rejected.
- Organizer/admin can approve/reject/waitlist and check in approved participants.

Certificates:

- Certificates require event `certificatesEnabled`.
- Participant must be approved, attended, and event must have ended.
- Certificate can be auto-generated or uploaded.
- Public verification route: `GET /api/certificates/verify/:verificationCode`.
- Certificate display by certificate id: `GET /api/certificates/:certificateId`.
- Revoke route requires auth and management authorization.

Reminders/cron:

- `backend/cron/eventReminders.js` and `backend/src/services/eventReminders.js` implement event reminders when enabled.

## 17. Salon reports and earnings

Access rules:

- Salon reports require owner/admin access for the exact salon.
- Salon reports require active salon subscription. Active/trialing but expired must not unlock access.
- Date range query params `from` and `to` are required and must be `YYYY-MM-DD`.

Filtering:

- Reports query exact `salonId`.
- Appointment-period views prefer `bookingDate` with `dayKey` fallback for old records.
- Optional `barberId` filter must remain constrained to eligible salon staff.

Chair renter privacy:

- Reports separate staff and chair renter membership.
- Staff earnings use accepted working staff only.
- Chair renters are excluded from staff earnings/reports aggregation.

Revenue:

- Gross revenue uses completed bookings.
- Revenue amount prefers `finalPrice` when discount/voucher markers exist, otherwise `price`.
- Summary includes total bookings, completed bookings, gross revenue, staff earnings total, salon earnings total, and fixed pay proration count.

Staff earnings:

- Staff payment type `commission`: staff/salon percentages must add to 100.
- Staff payment type `fixed`: supports daily/weekly/monthly fixed amounts.
- Fixed pay is prorated:
  - Daily uses unique completed booking dates.
  - Weekly/monthly prorate by report range days/month fractions.
- No configured payment means staff earnings 0 and salon earnings gross revenue.

CSV export:

- `/api/salons/:salonId/reports/export?format=csv`.
- CSV cells are protected against formula injection by prefixing risky values.

Do not break:

- Exact salon filtering.
- Subscription gate.
- Chair renter exclusion.
- Backend-generated CSV.

## 18. Subscription and billing

Personal/barber subscription:

- Individual barber subscription can unlock barber features globally if active/trialing and unexpired.
- `requireBarberSubscription` allows non-barber roles through but blocks unpaid barbers with `SUBSCRIPTION_REQUIRED`.

Salon subscription:

- Salon subscriptions have ownerType `salon`, seatCount, pricePerSeat, totalPrice, currentPeriodStart/End, provider fields.
- Salon owner/admin can manage salon subscription/payment attempts and seats.
- Salon subscription seats can unlock accepted staff members for that salon.

Salon seat/member checks:

- Seat assignment is only for accepted staff members.
- Chair renters remain independently billed.
- Active seat counts filter out chair renters/non-accepted members.
- A barber can have individual access or matching salon seat access.

Expired/trialing/active:

- Paid statuses are `trialing` and `active`, but access also checks period end.
- `serializeSubscriptionStatus` marks expired when period ended.
- Active/trialing but expired must not unlock access where code enforces period checks.

Payment attempts:

- `SubscriptionPaymentAttempt` supports statuses `pending`, `requires_action`, `paid`, `failed`, `cancelled`, `refunded`, `expired`.
- Payment attempt expiry default is 24 hours.
- Manual/dev confirmation exists, with production restrictions.
- Platform admin can manually manage/confirm salon billing in platform billing routes.

Exact salon subscription gate:

- `barberHasPaidSeatAccessForSalon(barberId, salonId)` requires matching active seat and active parent subscription.
- Public salon/service/booking flows must keep exact salon access checks.

## 19. Payment readiness foundation

Already implemented:

- Booking deposit snapshot fields on `Booking`: deposit required/amount/status/mode/value/policy, currency, paidAmount, paymentStatus, paymentProvider, transaction/refund ids.
- `SubscriptionPaymentAttempt` supports `purpose: "booking_deposit"` as well as subscription attempts.
- `PaymentTransaction` general model for booking/subscription payment/refund transactions.
- `PaymentEvent` model for webhook event records with raw payload hidden by default.
- Payment provider interface and providers under `backend/src/services/payment/`: disabled, manual, mock.
- Webhook route `POST /api/payments/webhook` mounted with raw body before JSON parser.
- Safe payment metadata builder for booking deposit response fallback.

Future/verify before claiming:

- Do not claim real Stripe/Idram/Telcell/bank provider integration is complete unless provider code and production config prove it.
- Online deposit payment may be disabled/manual; frontend public booking page can show "Deposit is required, but online payment is not enabled yet."
- Verify current provider with `PAYMENT_PROVIDER` and provider factory before changing payment UI.

Important:

- Internal payment references must not be exposed to public/client responses unless explicitly serialized as safe fields.
- `PaymentEvent.rawPayload` is `select: false`; do not expose it.
- Webhook signatures/secrets must not be documented with real values.

## 20. Security and privacy rules

Auth and roles:

- Protected routes use `protect` JWT middleware.
- Optional public/auth hybrid routes use `optionalAuth`.
- Platform routes require `protect` plus `requirePlatformAdmin`.
- Subscription-gated barber features use `requireBarberSubscription`.

Salon-scoped access:

- Owner/admin checks must use exact `salonId`.
- Approved salon membership is not management permission.
- Staff/chair_renter permissions differ by workflow.

Private booking reference images:

- Do not statically serve `booking-references`.
- Use protected controller route and verify requested image belongs to booking and requester is authorized.

Upload validation:

- Allowed image types/extensions are enforced.
- File size limits vary by upload type.
- Generated filenames use timestamps/random suffixes, not original path.
- `deleteUploadedFile` protects against path traversal by resolving paths inside `process.cwd()/uploads`.

Static upload serving:

- Static upload middleware denies dotfiles, disables indexes, and serves only selected public folders.
- Certificate files are public by file URL once issued; verify intended behavior before changing.

Internal fields not to expose:

- Passwords.
- Email verification token hashes and verification timing internals unless already safe.
- `platformRole` in public barber lists.
- Payment raw payloads, provider secrets, webhook secrets, internal idempotency/provider refs where not safe.
- ClientRelationship internal notes outside barber CRM owner view.

Chair renter privacy:

- Do not include chair renter private earnings/client/revenue details in owner/admin reports unless code explicitly changes that rule.
- Do not count chair renters as salon subscription seats.

No secrets in docs:

- Never include MongoDB URI, JWT secret, payment keys, Resend key, emails, tokens, or real credentials.

## 21. UI/design direction

Current visual direction:

- `/admin/profile` is redesigned around a polished admin profile layout with white cards, rounded UI, soft borders, lucide icons, gallery/certification/review/work-history sections, and drawer-based editing.
- `/admin` dashboard uses modern admin cards/actions and links into salon management where available.
- `/admin/salon/dashboard` is redesigned with white cards, stat widgets, alerts, neutral background, and responsive owner/admin dashboard layout.
- Global background is pale neutral with subtle radial lightness; many admin surfaces use white rounded cards and soft shadows.
- Purple/pink gradient accents appear in redesigned admin areas and calls to action.
- Mobile responsiveness is important; routes use constrained max-width container and responsive spacing.

Pages still more neutral or mixed:

- Some older components/pages still use simpler Tailwind card/table layouts or legacy Vite styles (`frontend/src/App.css` contains leftover starter-style CSS).
- Verify page-specific styling before broad design changes.

Design rules for future changes:

- Do not change behavior while styling.
- Preserve loading, empty, error, disabled, and saved states.
- Preserve form validation and API payload shape.
- Do not remove mobile wrapping or overflow protections.
- Avoid broad restyles that change workflows, data loading, or role gates.

## 22. Testing and quality gates

Real commands:

- Backend tests: `cd backend && npm test`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`

Other real scripts:

- Backend dev/start: `npm run dev`, `npm start`.
- Frontend dev/preview: `npm run dev`, `npm run preview`.
- Backend migrations/scripts listed in section 4.

Current test status:

- Review on 2026-06-27: `cd frontend && npm run lint`, `cd frontend && npm run build`, and `cd backend && npm test` passed for this documentation-only handoff.
- Verify in the current workspace before changing code because test status can become stale as the codebase changes.

Do not invent test commands. If you add or change code later, run the relevant real commands above.

## 23. Known high-risk areas

- Booking lifecycle: many status transitions have role checks, notifications, voucher restoration, waitlist side effects, loyalty, review requests, and slot locks.
- Pricing/discount/payment: backend must remain authoritative; booking snapshots, vouchers, service discounts, loyalty, deposit/payment attempts interact.
- Schedule availability: explicit non-working days and weekly days off must not fall back incorrectly; salon-specific schedules must remain isolated; conflicts check across all salons for the barber.
- Salon permissions: owner/admin is exact salon-scoped; staff/chair_renter are not managers.
- Chair renter privacy: reports, billing seats, staff payment settings, and dashboard data must not leak chair renter private revenue/payment data.
- Subscriptions/billing: active/trialing must also be unexpired; seats apply only to accepted staff and matching salon.
- Reports/earnings: exact salonId, appointment date range, CSV injection protection, fixed pay proration, and revenue amount rules are easy to regress.
- Uploads/media access: file type/size/path traversal protections and private booking reference images are security-sensitive.
- Review replies: only owning barber/salon manager should reply; completed own booking is required for reviews.
- Profile image upload: shared avatar upload path updates auth/profile state and public display.
- Route ordering: Express static routes must stay before `/:id` routes in several route files.
- Platform admin: do not confuse platformRole with salon owner/admin or app role.

## 24. Safe change workflow for future AI

- Inspect relevant files first; do not assume from names alone.
- Keep changes narrow and local to the requested workflow.
- Do not change backend unless the user request requires backend behavior changes.
- Do not change API contracts casually; verify all frontend callers and tests if you must.
- Do not add fake data or seed-like defaults unless requested.
- Preserve existing behavior, especially role checks, exact salon filtering, subscriptions, pricing, schedule validation, and privacy constraints.
- Add or update focused tests for behavior changes in risky areas.
- Run relevant quality gates: backend `npm test`, frontend `npm run lint`, frontend `npm run build`.
- Produce a concise final report with files changed, checks run, and residual uncertainty.
- Do not commit or push unless the user explicitly asks.
- Never create task_progress/status/checklist files.

## 25. Common mistakes to avoid

- Broad rewrites of controllers, services, route maps, Redux state, or admin components.
- Changing auth, role, owner/admin, or subscription checks while "only styling".
- Using frontend calculations as source of truth for money.
- Exposing internal fields such as password, platformRole in public responses, payment raw payloads, provider internals, verification tokens, or client internal notes.
- Treating salon owner as editable staff/chair_renter.
- Leaking chair_renter revenue, payment, seat, or client data to salon owner/admin reports.
- Ignoring exact `salonId` in schedules, bookings, reports, subscriptions, services, and public salon booking.
- Breaking mobile layout or removing overflow protections.
- Removing empty/loading/error states.
- Breaking Express route ordering by putting `/:id` before static paths.
- Claiming payment provider integration is complete when only foundation/manual/mock/disabled support exists.
- Claiming a mobile app exists.
- Editing README or application code for documentation-only tasks.
- Committing or pushing without explicit user request.
