import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CertificationsManager from "./CertificationsManager";
import api from "@/shared/api/axios";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const baseUser = {
  id: "barber-1",
  role: "barber",
  name: "Test Barber",
};

const existingCertification = {
  _id: "cert-1",
  title: "Master Barber",
  issuedBy: "Academy",
  issueDate: "2024-01-10T00:00:00.000Z",
  imageUrl: "/uploads/certifications/current-certificate.webp",
};

function renderManager() {
  return renderWithProviders(<CertificationsManager />, {
    preloadedState: {
      auth: {
        currentUser: baseUser,
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

function createFile(name, { type = "image/png", size = 1024 } = {}) {
  const file = new File(["preview"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("CertificationsManager object URL cleanup", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: { _id: "cert-new", title: "Saved" } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the previous preview URL before replacing it with a new valid image", async () => {
    createObjectURL
      .mockReturnValueOnce("blob:first-preview")
      .mockReturnValueOnce("blob:second-preview");

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));

    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("first.png"));
    await user.upload(input, createFile("second.png"));

    expect(screen.getByAltText("Certificate preview")).toHaveAttribute(
      "src",
      "blob:second-preview"
    );
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:first-preview")).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:second-preview");
  });

  it("revokes the preview URL when removing the selected image", async () => {
    createObjectURL.mockReturnValueOnce("blob:remove-preview");

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("remove.png"));

    await user.click(screen.getByRole("button", { name: "Remove image" }));

    expect(screen.queryByAltText("Certificate preview")).toBeNull();
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:remove-preview")).toHaveLength(1);
  });

  it("revokes the preview URL when closing the modal without saving", async () => {
    createObjectURL.mockReturnValueOnce("blob:close-preview");

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("close.png"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByAltText("Certificate preview")).toBeNull();
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:close-preview")).toHaveLength(1);
  });

  it("revokes the preview URL after a successful save resets the modal", async () => {
    createObjectURL.mockReturnValueOnce("blob:save-preview");

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("save.png"));
    await user.type(screen.getByLabelText("Title"), "Color Specialist");
    await user.type(screen.getByLabelText("Issued by"), "Studio Academy");
    await user.type(screen.getByLabelText("Issue date"), "2024-02-10");
    await user.click(screen.getByRole("button", { name: "Add certification" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByAltText("Certificate preview")).toBeNull();
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:save-preview")).toHaveLength(1);
  });

  it("keeps the preview after a failed save and revokes it only when the modal closes", async () => {
    createObjectURL.mockReturnValueOnce("blob:failed-save-preview");
    api.post.mockRejectedValueOnce({
      response: { data: { message: "Save failed" } },
    });

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("failed-save.png"));
    await user.type(screen.getByLabelText("Title"), "Color Specialist");
    await user.type(screen.getByLabelText("Issued by"), "Studio Academy");
    await user.type(screen.getByLabelText("Issue date"), "2024-02-10");
    await user.click(screen.getByRole("button", { name: "Add certification" }));

    expect(await screen.findByText("Save failed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.getByAltText("Certificate preview")).toHaveAttribute(
      "src",
      "blob:failed-save-preview"
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      revokeObjectURL.mock.calls.filter(([url]) => url === "blob:failed-save-preview")
    ).toHaveLength(1);
  });

  it("revokes any remaining local preview URL on unmount", async () => {
    createObjectURL.mockReturnValueOnce("blob:unmount-preview");

    const user = userEvent.setup();
    const { container, unmount } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("unmount.png"));

    unmount();

    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:unmount-preview")).toHaveLength(1);
  });

  it("keeps the current preview when invalid files are selected", async () => {
    createObjectURL.mockReturnValueOnce("blob:valid-preview");

    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(await screen.findByRole("button", { name: /add certification/i }));
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, createFile("valid.png"));
    await user.upload(input, createFile("wrong-type.gif", { type: "image/gif" }));
    await user.upload(input, createFile("too-large.png", { size: 6 * 1024 * 1024 }));

    expect(screen.getByAltText("Certificate preview")).toHaveAttribute(
      "src",
      "blob:valid-preview"
    );
    expect(screen.getByText("Image must be 5MB or smaller")).toBeVisible();
    expect(screen.queryByText("Only JPEG, PNG, and WEBP images are allowed")).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("never revokes backend media URLs while editing existing certifications", async () => {
    api.get.mockResolvedValue({ data: [existingCertification] });

    const user = userEvent.setup();
    const { unmount } = renderManager();

    await user.click(await screen.findByRole("button", { name: "Edit certification" }));
    expect(await screen.findByAltText("Current certificate")).toHaveAttribute(
      "src",
      expect.stringContaining(existingCertification.imageUrl)
    );
    const revokeCallCount = revokeObjectURL.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    unmount();

    expect(revokeObjectURL).not.toHaveBeenCalledWith(
      expect.stringContaining(existingCertification.imageUrl)
    );
    expect(revokeObjectURL.mock.calls).toHaveLength(revokeCallCount);
  });
});
