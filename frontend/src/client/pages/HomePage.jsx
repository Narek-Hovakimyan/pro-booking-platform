import {
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  MapPin,
  Scissors,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const BENEFITS = [
  {
    icon: CalendarCheck,
    title: "Book online, skip the phone",
    description:
      "Browse availability in real time and book your appointment instantly — no more back-and-forth calls.",
  },
  {
    icon: UserRound,
    title: "Compare specialists & salons",
    description:
      "View profiles, specialties, prices, and reviews to find the perfect match for your style.",
  },
  {
    icon: Star,
    title: "Real reviews from real clients",
    description:
      "See honest ratings and feedback before you book. Only verified bookings can leave a review.",
  },
  {
    icon: Sparkles,
    title: "Events & certificates",
    description:
      "Barbers can host events, manage attendance, issue certificates — clients earn verified credentials.",
  },
];

const STEPS = [
  {
    step: 1,
    icon: UserRound,
    title: "Choose a specialist or salon",
    description:
      "Browse through specialists, check their work, read reviews, and find the right professional for you.",
  },
  {
    step: 2,
    icon: CalendarDays,
    title: "Pick a service and time",
    description:
      "Select the service you need, see available time slots, and pick what works best for your schedule.",
  },
  {
    step: 3,
    icon: CheckCheck,
    title: "Confirm your booking",
    description:
      "Review your appointment details and confirm. You'll get a notification and can message your specialist.",
  },
];

export default function HomePage({ startBooking }) {
  const { currentUser } = useSelector((state) => state.auth);
  const canBook = currentUser?.role === "client";
  const isBarber = currentUser?.role === "barber";

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-12">
      {/* ═══════════════════════════════════════════════════════════════════
         HERO SECTION
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.06)_0%,_transparent_60%)]" />

        <div className="relative px-5 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium tracking-wide text-neutral-300">
                Salon & specialist booking platform
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Book your next
              <br />
              <span className="bg-gradient-to-r from-amber-300 to-amber-400 bg-clip-text text-transparent">
                haircut appointment
              </span>
              <br />
              without calling
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-400 sm:text-lg">
              Browse specialists and salons in your city, check real-time availability,
              read reviews, and book your appointment — all in one place.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                as={Link}
                className="min-w-[180px]"
                onClick={startBooking}
                size="lg"
                to={canBook ? "/barbers" : "/register"}
              >
                <Scissors className="mr-2 h-4 w-4" />
                {canBook ? "Find a specialist" : "Get started"}
              </Button>
              <Button
                as={Link}
                className="min-w-[160px]"
                size="lg"
                to={canBook ? "/salons" : "/register"}
                variant="secondary"
              >
                <MapPin className="mr-2 h-4 w-4" />
                Browse salons
              </Button>
            </div>

            {/* Auth hint */}
            {!currentUser && (
              <p className="mt-4 text-xs text-neutral-500">
                Already have an account?{" "}
                <Link className="font-medium text-amber-400 hover:underline" to="/login">
                  Log in
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         WHY HAIRBOOK — BENEFITS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Why use HairBook?
          </h2>
          <p className="mt-2 text-neutral-500">
            Everything you need for a seamless booking experience.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <Card
              className="rounded-2xl border-neutral-200 transition-shadow hover:shadow-md sm:rounded-3xl"
              key={benefit.title}
            >
              <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                  <benefit.icon className="h-5 w-5 text-neutral-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-neutral-950">{benefit.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                    {benefit.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         HOW IT WORKS
      ═══════════════════════════════════════════════════════════════════ */}
      {!isBarber && (
        <section>
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              How it works
            </h2>
            <p className="mt-2 text-neutral-500">
              Booking your appointment takes just a few clicks.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <Card
                className="relative rounded-2xl border-neutral-200 sm:rounded-3xl"
                key={step.step}
              >
                <CardContent className="space-y-4 p-5 text-center sm:p-6">
                  {/* Step number badge */}
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950 text-sm font-bold text-white">
                    {step.step}
                  </div>
                  <step.icon className="mx-auto h-7 w-7 text-neutral-500" />
                  <div>
                    <h3 className="font-semibold text-neutral-950">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
         CLIENT / BARBER SPLIT
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Built for everyone
          </h2>
          <p className="mt-2 text-neutral-500">
            Whether you're booking or managing, HairBook has you covered.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* For Clients */}
          <Card className="overflow-hidden rounded-2xl border-neutral-200 transition-shadow hover:shadow-md sm:rounded-3xl">
            <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-500" />
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <UserRound className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-neutral-950">
                  For clients
                </h3>
              </div>

              <ul className="space-y-2.5 text-sm text-neutral-600">
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Browse specialists and salons with real profiles and photos
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Book appointments in real time without calling
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Message your specialist directly
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Leave reviews and save your favorite specialists
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Earn verified event certificates
                </li>
              </ul>

              <Button
                as={Link}
                className="w-full"
                onClick={startBooking}
                size="lg"
                to={canBook ? "/barbers" : "/register"}
              >
                {canBook ? "Find a specialist" : "Create client account"}
              </Button>
            </CardContent>
          </Card>

          {/* For Barbers */}
          <Card className="overflow-hidden rounded-2xl border-neutral-200 transition-shadow hover:shadow-md sm:rounded-3xl">
            <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-600" />
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Scissors className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-neutral-950">
                  For salon staff
                </h3>
              </div>

              <ul className="space-y-2.5 text-sm text-neutral-600">
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Manage your services, schedule, and pricing
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Accept or reject bookings with one click
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  View your calendar and daily timeline
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Create events, manage attendance, issue certificates
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Communicate with clients via direct messages
                </li>
              </ul>

              {!currentUser ? (
                <Button
                  as={Link}
                  className="w-full"
                  size="lg"
                  to="/register"
                  variant="outline"
                >
                  Create staff account
                </Button>
              ) : isBarber ? (
                <Button
                  as={Link}
                  className="w-full"
                  size="lg"
                  to="/admin"
                >
                  Go to dashboard
                </Button>
              ) : (
                <Button
                  as={Link}
                  className="w-full"
                  size="lg"
                  to="/register"
                  variant="outline"
                >
                  Switch to staff account
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         FOOTER CTA
      ═══════════════════════════════════════════════════════════════════ */}
      {canBook && (
        <section className="text-center">
          <Card className="rounded-2xl border-neutral-200 bg-gradient-to-br from-neutral-50 to-white sm:rounded-3xl">
            <CardContent className="space-y-4 p-8 sm:p-10">
              <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                Ready to book?
              </h2>
              <p className="text-neutral-500">
                Find your next specialist or salon and book in seconds.
              </p>
              <Button
                as={Link}
                className="min-w-[200px]"
                onClick={startBooking}
                size="lg"
                to="/barbers"
              >
                <Scissors className="mr-2 h-4 w-4" />
                Book now
              </Button>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
