import BarberCard from "@/client/components/BarberCard";
import EmptyState from "@/shared/components/common/EmptyState";
import { Card, CardContent } from "@/shared/components/ui/card";
import { serviceCategories } from "@/shared/data/serviceCategories";

export default function SalonSpecialistsSection({
  currentUser,
  favorites,
  onToggleFavorite,
  reviews,
  salon,
  selectedCategory,
  services,
  setSelectedCategory,
  specialists,
}) {
  return (
    <Card className="rounded-2xl border-neutral-200/80 shadow-card sm:rounded-3xl">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 inline-flex rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
              Specialists
            </p>
            <h2 className="break-words text-2xl font-bold text-neutral-950">
              Specialists at {salon?.name}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Select a specialist to view their profile or book an appointment.
            </p>
          </div>

          <label className="grid gap-1.5 text-sm font-semibold text-neutral-800 sm:w-60">
            Service category
            <select
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal text-neutral-800 shadow-sm focus:border-brand-500 focus:ring-brand-500/20"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {serviceCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!specialists.length ? (
          <EmptyState
            className="border-brand-100 bg-brand-50/40"
            description={
              selectedCategory
                ? "No approved specialists in this salon have active services in this category."
                : "This salon does not have approved specialists yet."
            }
            title={
              selectedCategory
                ? "No matching specialists"
                : "No specialists in this salon"
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {specialists.map((barber) => (
              <BarberCard
                barber={barber}
                bookingSalon={salon}
                currentUser={currentUser}
                favorites={favorites}
                key={barber.id || barber._id}
                onToggleFavorite={onToggleFavorite}
                reviews={reviews}
                services={services}
                showAvailability={false}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
