# Salon UI/UX Improvement Plan

## Changes (UI only - no logic, no API, no salonId changes)

### 1. `SalonsGrid.jsx`
- Replace `UserRound` -> `Store` icon for salon image fallback
- Add `Star` filled color-coded rating display with badge
- Minor spacing polish

### 2. `SalonsPage.jsx` (detail view)
- Add salon favorite button in detail hero section
- Add "Book with a barber" header + subtext above barbers section
- Better salon detail loading UX (skeleton-like state)
- Improve hero layout with CTA: "View barbers" / "Book with a barber"

### 3. `SalonProfilePage.jsx`
- Add salon favorite button
- Add "Book with a barber" section header
- Loading skeleton instead of text
- Use `EmptyState` for no-barbers case
- Add fallback redirect explanation

### 4. `BarberCard.jsx`
- Add salon context badge when `bookingSalon` is provided ("At {salonName}")
- Show salon name inside card when relevant

### 5. `ClientBooking.jsx`
- Add salon context banner: "Booking at [Salon Name]" across all steps

### NOT changed:
- Routes, API calls, redux, salonId, booking payload, availability, schedule, favorite API logic
