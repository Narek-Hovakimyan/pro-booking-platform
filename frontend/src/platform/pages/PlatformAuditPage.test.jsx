import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import PlatformAuditPage from "./PlatformAuditPage";

const mocks = vi.hoisted(() => ({ getAuditLogs: vi.fn() }));

vi.mock("@/shared/api/platformAudit", () => ({
  getPlatformAuditLogs: mocks.getAuditLogs,
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const safeLog = {
  id: "audit-1",
  createdAt: "2026-02-01T10:00:00.000Z",
  action: "salon_subscription.seat_count_update",
  actor: { id: "actor-1", name: "Platform Operator" },
  salon: { id: "salon-1", name: "Salon One" },
  note: "Payment confirmed",
  changes: { before: { seatCount: 2 }, after: { seatCount: 3 } },
};

const renderPage = () => renderWithProviders(<PlatformAuditPage />, {
  initialEntries: ["/admin/platform/audit"],
  preloadedState: { auth: { currentUser: { canAccessPlatform: true }, isAuthenticated: true } },
});

beforeEach(() => mocks.getAuditLogs.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("PlatformAuditPage", () => {
  it("shows loading while the audit request is pending", async () => {
    const pending = deferred();
    mocks.getAuditLogs.mockReturnValueOnce(pending.promise);
    const { container } = renderPage();

    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(1));
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("No audit records match these filters.")).not.toBeInTheDocument();
  });

  it("renders only the safe audit DTO and safe missing references", async () => {
    mocks.getAuditLogs.mockResolvedValue({
      auditLogs: [{ ...safeLog, targetUser: { id: "deleted-user", name: null, missing: true } }],
      total: 1,
    });
    renderPage();

    expect(await screen.findByText("Platform Operator")).toBeInTheDocument();
    expect(screen.getByText("Target: Deleted user")).toBeInTheDocument();
    expect(screen.getByText("2 → 3")).toBeInTheDocument();
    expect(screen.queryByText("requestIp")).not.toBeInTheDocument();
  });

  it("renders empty and safe change fallback states", async () => {
    mocks.getAuditLogs.mockResolvedValueOnce({
      auditLogs: [{ ...safeLog, changes: null }],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText("No safe change details available")).toBeInTheDocument();
  });

  it("renders an empty result without treating it as an error", async () => {
    mocks.getAuditLogs.mockResolvedValueOnce({ auditLogs: [], total: 0 });
    renderPage();

    expect(await screen.findByText("No audit records match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load platform audit history.")).not.toBeInTheDocument();
  });

  it("renders a safe API error", async () => {
    mocks.getAuditLogs.mockRejectedValueOnce({
      response: { data: { message: "Audit service unavailable" } },
    });
    renderPage();

    expect(await screen.findByText("Audit service unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No audit records match these filters.")).not.toBeInTheDocument();
  });

  it("invalidates an older filter response", async () => {
    const first = deferred();
    const second = deferred();
    mocks.getAuditLogs.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    renderPage();
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "salon_subscription.activate" } });
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(2));
    second.resolve({ auditLogs: [{ ...safeLog, id: "fresh", note: "Fresh" }], total: 1 });
    expect(await screen.findByText("Fresh")).toBeInTheDocument();

    await act(async () => {
      first.resolve({ auditLogs: [{ ...safeLog, id: "stale", note: "Stale" }], total: 1 });
      await Promise.resolve();
    });
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("ignores a late response after unmount", async () => {
    const pending = deferred();
    mocks.getAuditLogs.mockReturnValueOnce(pending.promise);
    const { unmount } = renderPage();
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      pending.resolve({ auditLogs: [{ ...safeLog, note: "Late response" }], total: 1 });
      await Promise.resolve();
    });

    expect(screen.queryByText("Late response")).not.toBeInTheDocument();
  });

  it("sends action/date filters and paginates safely", async () => {
    mocks.getAuditLogs.mockResolvedValue({ auditLogs: [safeLog], total: 40 });
    renderPage();
    await screen.findByText("Payment confirmed");

    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "salon_subscription.activate" },
    });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-02" } });
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      action: "salon_subscription.activate",
      from: "2026-02-01",
      to: "2026-02-02",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenLastCalledWith({
      page: 2,
      limit: 20,
      action: "salon_subscription.activate",
      from: "2026-02-01",
      to: "2026-02-02",
    }));
  });

});
