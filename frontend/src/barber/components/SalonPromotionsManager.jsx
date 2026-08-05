import SettingsCard from "./settings/SettingsCard";
import PromotionFormModal from "./PromotionFormModal";
import PromotionList from "./PromotionList";
import useSalonPromotionsData from "./useSalonPromotionsData";

export default function SalonPromotionsManager({ salonId, salonName }) {
  const promotionsData = useSalonPromotionsData({ salonId });

  return (
    <SettingsCard
      title="Salon Promotions"
      description={`Manage discount promotions for ${salonName || "this salon"}.`}
    >
      <PromotionList
        copiedId={promotionsData.copiedId}
        createButtonRef={promotionsData.createButtonRef}
        editButtonRefs={promotionsData.editButtonRefs}
        error={promotionsData.error}
        loading={promotionsData.loading}
        onCopyCode={promotionsData.copyCode}
        onCreatePromotion={promotionsData.openCreateModal}
        onEditPromotion={promotionsData.openEditModal}
        onToggleActive={promotionsData.handleToggleActive}
        promotions={promotionsData.promotions}
        successMsg={promotionsData.successMsg}
      />

      <PromotionFormModal
        dialogRef={promotionsData.dialogRef}
        editingPromotion={promotionsData.editingPromotion}
        form={promotionsData.form}
        handleField={promotionsData.handleField}
        handleSave={promotionsData.handleSave}
        handleToggleBarber={promotionsData.handleToggleBarber}
        handleToggleService={promotionsData.handleToggleService}
        modalError={promotionsData.modalError}
        modalId={promotionsData.modalId}
        onClose={promotionsData.closeModal}
        saving={promotionsData.saving}
        showModal={promotionsData.showModal}
        triggerRef={promotionsData.triggerRef}
        uniqueBarbers={promotionsData.uniqueBarbers}
        uniqueServices={promotionsData.uniqueServices}
      />
    </SettingsCard>
  );
}
