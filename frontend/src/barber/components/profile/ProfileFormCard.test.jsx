import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ProfileFormCard from "./ProfileFormCard";

vi.mock("@/shared/components/AvatarUploadButton", () => ({
  default: ({ onUploaded, onUploadStateChange }) => (
    <div>
      <button type="button" onClick={() => onUploadStateChange?.(true)}>Start avatar upload</button>
      <button
        type="button"
        onClick={() => {
          onUploaded?.({ imageUrl: "/uploads/avatars/new.jpg" });
          onUploadStateChange?.(false);
        }}
      >
        Finish avatar upload
      </button>
      <button type="button" onClick={() => onUploadStateChange?.(false)}>Fail avatar upload</button>
    </div>
  ),
}));

const profile = {
  name: "Barber",
  phone: "+37400000000",
  bio: "Bio",
  city: "Yerevan",
  address: "Address",
  instagram: "",
  profession: "barber",
  barberType: "unisex",
  imageUrl: "",
};

const renderCard = () => {
  const onAvatarUploaded = vi.fn();
  const onSaveProfile = vi.fn((event) => event.preventDefault());
  render(
    <ProfileFormCard
      currentUser={{ id: "barber-1" }}
      isProfileSaving={false}
      onAvatarUploaded={onAvatarUploaded}
      onSaveProfile={onSaveProfile}
      onUpdateField={vi.fn()}
      profile={profile}
      profileError=""
      saved={false}
    />
  );
  return { onAvatarUploaded, onSaveProfile };
};

describe("ProfileFormCard avatar upload lock", () => {
  it("blocks stale profile edits and submission while an avatar upload is active", async () => {
    const { onSaveProfile } = renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Start avatar upload" }));

    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it("re-enables saving after upload success and forwards the authoritative image response", async () => {
    const { onAvatarUploaded, onSaveProfile } = renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Start avatar upload" }));
    await user.click(screen.getByRole("button", { name: "Finish avatar upload" }));

    expect(onAvatarUploaded).toHaveBeenCalledWith({ imageUrl: "/uploads/avatars/new.jpg" });
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
  });

  it("re-enables normal profile saving after upload failure", async () => {
    const { onSaveProfile } = renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Start avatar upload" }));
    await user.click(screen.getByRole("button", { name: "Fail avatar upload" }));

    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
  });
});
