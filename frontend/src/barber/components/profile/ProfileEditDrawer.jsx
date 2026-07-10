import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import Drawer from "@/shared/components/common/Drawer";
import AccountEmailSection from "@/shared/components/AccountEmailSection";
import ProfileFormCard from "@/barber/components/profile/ProfileFormCard";

export default function ProfileEditDrawer({
  isOpen,
  onClose,
  profile,
  updateField,
  saveProfile,
  isProfileSaving,
  profileError,
  currentUser,
  saved,
  email,
  emailVerified,
  emailVerifiedAt,
  isEmailSaving,
  isSending,
  emailMessage,
  emailError,
  onEmailChange,
  saveEmail,
  resendVerification,
  hasEmailChanges,
  handleAvatarUploaded,
}) {
  return (
    <Drawer
      description="Update the details clients see before booking."
      isOpen={isOpen}
      onClose={onClose}
      title="Edit profile"
    >
      <ProfileFormCard
        profile={profile}
        isProfileSaving={isProfileSaving}
        saved={saved}
        profileError={profileError}
        currentUser={currentUser}
        onUpdateField={updateField}
        onSaveProfile={saveProfile}
        onAvatarUploaded={handleAvatarUploaded}
        editable={true}
      />

      <Card className="rounded-2xl">
        <CardContent className="space-y-5 p-4">
          <AccountEmailSection
            email={email}
            emailVerified={emailVerified}
            emailVerifiedAt={emailVerifiedAt}
            isSaving={isEmailSaving}
            isSending={isSending}
            message={emailMessage}
            error={emailError}
            onEmailChange={onEmailChange}
            onResend={resendVerification}
          />

          <Button
            className="w-full"
            disabled={!hasEmailChanges || isEmailSaving}
            variant="outline"
            onClick={saveEmail}
          >
            {isEmailSaving ? "Saving..." : "Save email"}
          </Button>
        </CardContent>
      </Card>
    </Drawer>
  );
}
