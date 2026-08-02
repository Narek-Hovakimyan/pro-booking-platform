import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ClientDetailsStep from "./ClientDetailsStep";
import { formatCurrency } from "@/platform/utils/billingFormatters";

function createFile(name, { type = "image/png", size = 1024, lastModified = 1 } = {}) {
  const file = new File(["preview"], name, { type, lastModified });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function freezeFile(file) {
  return Object.preventExtensions(file);
}

function renderStep(props = {}) {
  return render(
    <ClientDetailsStep
      client={{ name: "Ani", phone: "+374 99 000000", note: "" }}
      onChange={vi.fn()}
      onBack={vi.fn()}
      onContinue={vi.fn()}
      canConfirm
      {...props}
    />
  );
}

function ReferenceFilesHarness({ initialFiles = [], onPayloadChange = vi.fn() }) {
  const [files, setFiles] = useState(initialFiles);

  const handleFilesChange = (nextFiles) => {
    onPayloadChange(nextFiles);
    setFiles(nextFiles);
  };

  return (
    <ClientDetailsStep
      client={{ name: "Ani", phone: "+374 99 000000", note: "" }}
      onChange={vi.fn()}
      onBack={vi.fn()}
      onContinue={vi.fn()}
      canConfirm
      referenceFiles={files}
      onReferenceFilesChange={handleFilesChange}
    />
  );
}

function StrictModeExternalStep(props = {}) {
  return (
    <StrictMode>
      <ClientDetailsStep
        client={{ name: "Ani", phone: "+374 99 000000", note: "" }}
        onChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        canConfirm
        {...props}
      />
    </StrictMode>
  );
}

describe("ClientDetailsStep UI consistency", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURL.mockImplementation((file) => `blob:${file.name}:${createObjectURL.mock.calls.length + 1}`);
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("renders the English heading and formats applied discounts in AMD", async () => {
    const user = userEvent.setup();
    const { container } = renderStep({
      voucherPreview: { code: "SAVE10", title: "Summer promo" },
      discountPreview: 1500,
    });

    expect(
      screen.getByRole("heading", { name: "Enter your details" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /promo code/i }));
    expect(screen.getByText(`Promo -${formatCurrency(1500)}`)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("դր");
  });

  it("keeps reference preview identity stable when removing the middle file", async () => {
    const user = userEvent.setup();
    const onPayloadChange = vi.fn();
    render(<ReferenceFilesHarness onPayloadChange={onPayloadChange} />);

    const first = createFile("first.png", { size: 100, lastModified: 11 });
    const middle = createFile("middle.png", { size: 200, lastModified: 22 });
    const last = createFile("last.png", { size: 300, lastModified: 33 });

    await user.upload(screen.getByLabelText("Add reference photos"), [
      first,
      middle,
      last,
    ]);

    expect(onPayloadChange).toHaveBeenLastCalledWith([first, middle, last]);
    expect(screen.getAllByRole("img", { name: /reference/i })).toHaveLength(3);
    const lastPreview = screen.getByAltText("Reference 3");

    await user.click(
      screen.getByRole("button", { name: "Remove reference image 2" })
    );

    expect(onPayloadChange).toHaveBeenLastCalledWith([first, last]);
    expect(screen.getAllByRole("img", { name: /reference/i })).toHaveLength(2);
    expect(screen.getByAltText("Reference 1")).toHaveAttribute(
      "src",
      expect.stringContaining("first.png")
    );
    expect(screen.getByAltText("Reference 2")).toHaveAttribute(
      "src",
      expect.stringContaining("last.png")
    );
    expect(screen.getByAltText("Reference 2")).toBe(lastPreview);
  });

  it("keeps identical file previews uniquely keyed and stable after removal", async () => {
    const user = userEvent.setup();
    const onPayloadChange = vi.fn();
    render(<ReferenceFilesHarness onPayloadChange={onPayloadChange} />);

    const first = createFile("duplicate.png", {
      size: 444,
      lastModified: 44,
    });
    const second = createFile("duplicate.png", {
      size: 444,
      lastModified: 44,
    });

    await user.upload(screen.getByLabelText("Add reference photos"), [
      first,
      second,
    ]);

    expect(onPayloadChange).toHaveBeenLastCalledWith([first, second]);
    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes("Encountered two children with the same key")
      )
    ).toBe(false);

    const secondPreview = screen.getByAltText("Reference 2");

    await user.click(
      screen.getByRole("button", { name: "Remove reference image 1" })
    );

    expect(onPayloadChange).toHaveBeenLastCalledWith([second]);
    expect(screen.getByAltText("Reference 1")).toBe(secondPreview);
  });

  it("keeps frozen external duplicate-metadata files uniquely keyed and stable when removing the first duplicate", async () => {
    const user = userEvent.setup();
    const onPayloadChange = vi.fn();
    const first = freezeFile(
      createFile("duplicate.png", { size: 444, lastModified: 44 })
    );
    const second = freezeFile(
      createFile("duplicate.png", { size: 444, lastModified: 44 })
    );

    render(
      <ReferenceFilesHarness
        initialFiles={[first, second]}
        onPayloadChange={onPayloadChange}
      />
    );

    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes("Encountered two children with the same key")
      )
    ).toBe(false);

    const secondPreview = screen.getByAltText("Reference 2");
    await user.click(
      screen.getByRole("button", { name: "Remove reference image 1" })
    );

    expect(onPayloadChange).toHaveBeenLastCalledWith([second]);
    expect(screen.getByAltText("Reference 1")).toBe(secondPreview);
  });

  it("keeps frozen external duplicate-metadata files stable when removing the second duplicate", async () => {
    const user = userEvent.setup();
    const onPayloadChange = vi.fn();
    const first = freezeFile(
      createFile("duplicate.png", { size: 444, lastModified: 44 })
    );
    const second = freezeFile(
      createFile("duplicate.png", { size: 444, lastModified: 44 })
    );

    render(
      <ReferenceFilesHarness
        initialFiles={[first, second]}
        onPayloadChange={onPayloadChange}
      />
    );

    const firstPreview = screen.getAllByRole("img", { name: /reference/i })[0];
    await user.click(
      screen.getAllByRole("button", { name: /remove reference image/i })[1]
    );

    expect(onPayloadChange).toHaveBeenLastCalledWith([first]);
    expect(screen.getByAltText("Reference 1")).toBe(firstPreview);
  });

  it("assigns distinct stable keys to repeated references of the same file object", async () => {
    const user = userEvent.setup();
    const shared = createFile("shared.png", { size: 321, lastModified: 9 });
    const onPayloadChange = vi.fn();
    render(
      <ReferenceFilesHarness
        initialFiles={[shared, shared]}
        onPayloadChange={onPayloadChange}
      />
    );

    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes("Encountered two children with the same key")
      )
    ).toBe(false);

    const secondPreview = screen.getByAltText("Reference 2");
    await user.click(
      screen.getByRole("button", { name: "Remove reference image 1" })
    );

    expect(onPayloadChange).toHaveBeenLastCalledWith([shared]);
    expect(screen.getByAltText("Reference 1")).toBe(secondPreview);
  });

  it("creates and cleans up reference preview object URLs", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReferenceFilesHarness />);

    const first = createFile("first.png", { lastModified: 11 });
    const second = createFile("second.png", { lastModified: 22 });
    const third = createFile("third.png", { lastModified: 33 });

    await user.upload(screen.getByLabelText("Add reference photos"), [
      first,
      second,
      third,
    ]);

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(first);
      expect(createObjectURL).toHaveBeenCalledWith(second);
      expect(createObjectURL).toHaveBeenCalledWith(third);
    });

    await user.click(
      screen.getByRole("button", { name: "Remove reference image 2" })
    );

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith(expect.stringContaining("second.png"));
    });

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith(expect.stringContaining("first.png"));
    expect(revokeObjectURL).toHaveBeenCalledWith(expect.stringContaining("third.png"));
  });

  it("cleans up StrictMode object URLs without leaks for external files", async () => {
    const first = createFile("strict.png", { size: 210, lastModified: 12 });
    const second = createFile("strict.png", { size: 210, lastModified: 12 });
    const { unmount } = render(
      <StrictModeExternalStep
        referenceFiles={[first, second]}
        onReferenceFilesChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });


  it("renders public voucher codes and applies the selected code", async () => {
    const user = userEvent.setup();
    const onApplyVoucher = vi.fn();
    renderStep({
      publicVouchers: [
        { code: "WELCOME10" },
        { code: "SAVE20" },
      ],
      onApplyVoucher,
    });

    await user.click(screen.getByRole("button", { name: /promo code/i }));
    expect(screen.getByRole("button", { name: /welcome10/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save20/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save20/i }));

    expect(onApplyVoucher).toHaveBeenCalledWith("SAVE20");
  });
});
