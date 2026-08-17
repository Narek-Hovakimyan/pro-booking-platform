import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AvatarUploadButton from "./AvatarUploadButton";
import api from "@/shared/api/axios";

vi.mock("@/shared/api/axios", () => ({
  default: { put: vi.fn() },
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

describe("AvatarUploadButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports the upload lock until a successful upload finishes", async () => {
    const request = deferred();
    const onUploaded = vi.fn();
    const onUploadStateChange = vi.fn();
    api.put.mockReturnValue(request.promise);
    const user = userEvent.setup();
    const { container } = render(
      <AvatarUploadButton
        onUploaded={onUploaded}
        onUploadStateChange={onUploadStateChange}
        uploadUrl="/barbers/profile/barber-1"
      />
    );

    await user.upload(
      container.querySelector('input[type="file"]'),
      new File(["avatar"], "avatar.jpg", { type: "image/jpeg" })
    );

    expect(onUploadStateChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Uploading..." })).toBeDisabled();

    request.resolve({ data: { imageUrl: "/uploads/avatars/new.jpg" } });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith({ imageUrl: "/uploads/avatars/new.jpg" });
      expect(onUploadStateChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("releases the upload lock after a failed upload", async () => {
    const onUploadStateChange = vi.fn();
    api.put.mockRejectedValue({ response: { data: { message: "Upload failed" } } });
    const user = userEvent.setup();
    const { container } = render(
      <AvatarUploadButton
        onUploadStateChange={onUploadStateChange}
        uploadUrl="/barbers/profile/barber-1"
      />
    );

    await user.upload(
      container.querySelector('input[type="file"]'),
      new File(["avatar"], "avatar.jpg", { type: "image/jpeg" })
    );

    await waitFor(() => {
      expect(onUploadStateChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });
  });
});
