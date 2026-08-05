import { Percent, SlidersHorizontal } from "lucide-react";

import ClientLoyaltyDrawer from "./ClientLoyaltyDrawer";
import ClientsList from "./ClientsList";
import LoyaltyDiscountDrawer from "./LoyaltyDiscountDrawer";
import useClientsData from "./useClientsData";
import ClientsFiltersPanel from "@/barber/components/clients/ClientsFiltersPanel";
import Drawer from "@/shared/components/common/Drawer";
import { Button } from "@/shared/components/ui/button";

export default function ClientsPage() {
  const {
    clients,
    searchQuery,
    setSearchQuery,
    visitType,
    setVisitType,
    upcomingFilter,
    setUpcomingFilter,
    lastVisitFilter,
    setLastVisitFilter,
    totalSpentRange,
    setTotalSpentRange,
    clearFilters,
    isFilterDrawerOpen,
    setIsFilterDrawerOpen,
    isLoyaltySettingsOpen,
    openLoyaltySettings,
    closeLoyaltySettings,
    loyaltySettingsDraft,
    updateLoyaltySettingsDraft,
    isSavingLoyaltySettings,
    loyaltySettingsError,
    saveLoyaltySettings,
    selectedClient,
    openClientDetails,
    closeClientDetails,
    loyaltyDraft,
    setLoyaltyDraft,
    isSavingLoyalty,
    loyaltyError,
    saveClientLoyalty,
    isLoading,
    error,
    filterChips,
    filteredClients,
    hasActiveFilters,
    activeFiltersCount,
    openMessage,
  } = useClientsData();

  const handleTotalSpentRangeChange = (field, value) => {
    setTotalSpentRange((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Clients
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Clients who have booked with you.
          </p>
        </div>

        <div className="grid gap-2 sm:flex sm:items-center">
          <Button
            className="relative w-full sm:w-auto"
            onClick={() => setIsFilterDrawerOpen(true)}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          <Button
            className="w-full gap-2 sm:w-auto"
            onClick={openLoyaltySettings}
            variant="outline"
          >
            <Percent className="h-4 w-4" />
            Loyalty discount
          </Button>
          {hasActiveFilters && (
            <Button
              className="w-full sm:w-auto"
              onClick={clearFilters}
              variant="outline"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <Drawer
        closeLabel="Close filters"
        description="Refine the client list instantly."
        footer={
          <>
            <Button onClick={() => setIsFilterDrawerOpen(false)}>
              Apply filters
            </Button>
            <Button onClick={clearFilters} variant="outline">
              Clear filters
            </Button>
          </>
        }
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title="Filters"
      >
        <ClientsFiltersPanel
          filterChips={filterChips}
          lastVisitFilter={lastVisitFilter}
          onLastVisitFilterChange={setLastVisitFilter}
          onSearchChange={setSearchQuery}
          onTotalSpentRangeChange={handleTotalSpentRangeChange}
          onUpcomingFilterChange={setUpcomingFilter}
          onVisitTypeChange={setVisitType}
          searchQuery={searchQuery}
          totalSpentRange={totalSpentRange}
          upcomingFilter={upcomingFilter}
          visitType={visitType}
        />
      </Drawer>

      <LoyaltyDiscountDrawer
        isOpen={isLoyaltySettingsOpen}
        isSavingLoyaltySettings={isSavingLoyaltySettings}
        loyaltySettingsDraft={loyaltySettingsDraft}
        loyaltySettingsError={loyaltySettingsError}
        onClose={closeLoyaltySettings}
        onSave={saveLoyaltySettings}
        updateLoyaltySettingsDraft={updateLoyaltySettingsDraft}
      />

      <ClientLoyaltyDrawer
        isSavingLoyalty={isSavingLoyalty}
        loyaltyDraft={loyaltyDraft}
        loyaltyError={loyaltyError}
        onClose={closeClientDetails}
        onSave={saveClientLoyalty}
        selectedClient={selectedClient}
        setLoyaltyDraft={setLoyaltyDraft}
      />

      <ClientsList
        clients={clients}
        error={error}
        filteredClients={filteredClients}
        isLoading={isLoading}
        onOpenClientDetails={openClientDetails}
        onOpenMessage={openMessage}
      />
    </div>
  );
}
