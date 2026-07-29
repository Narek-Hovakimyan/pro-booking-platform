import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PortfolioPhotoFormModal from "./PortfolioPhotoFormModal";
import {
  getPortfolioImageBlob,
  updatePortfolioPhoto,
} from "@/shared/api/portfolio";

vi.mock("@/shared/api/portfolio", () => ({
  createPortfolioPhoto: vi.fn(),
  getPortfolioImageBlob: vi.fn(),
  updatePortfolioPhoto: vi.fn(),
}));

const editingItem = {
  _id: "64c000000000000000000301",
  beforeUrl: "/uploads/portfolio/private-before.jpg",
  afterUrl: "/uploads/portfolio/private-after.jpg",
  caption: "Classic fade",
  category: "Haircut",
  tags: ["fade"],
  isPublic: false,
  consentConfirmed: false,
};

describe("PortfolioPhotoFormModal", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads edit previews through the protected blob API and revokes them on close", async () => {
    const onClose = vi.fn();

    createObjectURL.mockReturnValueOnce("blob:before-close").mockReturnValueOnce("blob:after-close");
    getPortfolioImageBlob
      .mockResolvedValueOnce(new Blob(["before-close"]))
      .mockResolvedValueOnce(new Blob(["after-close"]));

    const user = userEvent.setup();
    render(
      <PortfolioPhotoFormModal
        open
        editingItem={editingItem}
        isSaving={false}
        onClose={onClose}
        onSaveComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getPortfolioImageBlob).toHaveBeenCalledWith(editingItem._id, "before");
      expect(getPortfolioImageBlob).toHaveBeenCalledWith(editingItem._id, "after");
    });

    await waitFor(() => {
      expect(screen.getByAltText("Current before")).toHaveAttribute("src", "blob:before-close");
      expect(screen.getByAltText("Current after")).toHaveAttribute("src", "blob:after-close");
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:before-close");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:after-close");
  });

  it("revokes authenticated preview URLs after a successful metadata save", async () => {
    const onSaveComplete = vi.fn();

    createObjectURL.mockReturnValueOnce("blob:before-save").mockReturnValueOnce("blob:after-save");
    getPortfolioImageBlob
      .mockResolvedValueOnce(new Blob(["before-save"]))
      .mockResolvedValueOnce(new Blob(["after-save"]));
    updatePortfolioPhoto.mockResolvedValue({ ...editingItem, caption: "Updated" });

    const user = userEvent.setup();
    render(
      <PortfolioPhotoFormModal
        open
        editingItem={editingItem}
        isSaving={false}
        onClose={vi.fn()}
        onSaveComplete={onSaveComplete}
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText("Current before")).toHaveAttribute("src", "blob:before-save");
      expect(screen.getByAltText("Current after")).toHaveAttribute("src", "blob:after-save");
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updatePortfolioPhoto).toHaveBeenCalledWith(editingItem._id, {
        caption: "Classic fade",
        category: "Haircut",
        tags: ["fade"],
        isPublic: false,
        consentConfirmed: false,
      });
      expect(onSaveComplete).toHaveBeenCalledWith({ ...editingItem, caption: "Updated" });
    });

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:before-save");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:after-save");
  });

  it("replaces preview URLs on item change and cleans partial loads on unmount", async () => {
    createObjectURL
      .mockReturnValueOnce("blob:before-first")
      .mockReturnValueOnce("blob:after-first")
      .mockReturnValueOnce("blob:before-second");
    getPortfolioImageBlob
      .mockResolvedValueOnce(new Blob(["before-first"]))
      .mockResolvedValueOnce(new Blob(["after-first"]))
      .mockResolvedValueOnce(new Blob(["before-second"]))
      .mockRejectedValueOnce(new Error("after blocked"));

    const { rerender, unmount } = render(
      <PortfolioPhotoFormModal
        open
        editingItem={editingItem}
        isSaving={false}
        onClose={vi.fn()}
        onSaveComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText("Current before")).toHaveAttribute("src", "blob:before-first");
      expect(screen.getByAltText("Current after")).toHaveAttribute("src", "blob:after-first");
    });

    rerender(
      <PortfolioPhotoFormModal
        open
        editingItem={{
          ...editingItem,
          _id: "64c000000000000000000302",
          beforeUrl: "/uploads/portfolio/private-before-2.jpg",
          afterUrl: "/uploads/portfolio/private-after-2.jpg",
        }}
        isSaving={false}
        onClose={vi.fn()}
        onSaveComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getPortfolioImageBlob).toHaveBeenCalledWith("64c000000000000000000302", "before");
      expect(getPortfolioImageBlob).toHaveBeenCalledWith("64c000000000000000000302", "after");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:before-first");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:after-first");
    });

    await waitFor(() => {
      expect(screen.getByAltText("Current before")).toHaveAttribute("src", "blob:before-second");
      expect(screen.queryByAltText("Current after")).toBeNull();
    });

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:before-second");
  });

  it("cleans locally selected upload previews on replacement and unmount", async () => {
    createObjectURL
      .mockReturnValueOnce("blob:before-first")
      .mockReturnValueOnce("blob:before-second")
      .mockReturnValueOnce("blob:after-first");

    const user = userEvent.setup();
    const { container, unmount } = render(
      <PortfolioPhotoFormModal
        open
        editingItem={null}
        isSaving={false}
        onClose={vi.fn()}
        onSaveComplete={vi.fn()}
      />
    );

    const [beforeInput, afterInput] = container.querySelectorAll('input[type="file"]');
    await user.upload(beforeInput, new File(["before-1"], "before-1.jpg", { type: "image/jpeg" }));
    await user.upload(beforeInput, new File(["before-2"], "before-2.jpg", { type: "image/jpeg" }));
    await user.upload(afterInput, new File(["after-1"], "after-1.jpg", { type: "image/jpeg" }));

    expect(screen.getByAltText("Before preview")).toHaveAttribute("src", "blob:before-second");
    expect(screen.getByAltText("After preview")).toHaveAttribute("src", "blob:after-first");
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:before-first")).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:before-second");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:after-first");

    unmount();

    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:before-second")).toHaveLength(1);
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:after-first")).toHaveLength(1);
  });
});
