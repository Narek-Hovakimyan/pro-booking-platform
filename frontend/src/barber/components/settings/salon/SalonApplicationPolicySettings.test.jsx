import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { updateSalonJoinApplicationPolicy } from "@/shared/api/salonMembership";
import SalonApplicationPolicySettings from "./SalonApplicationPolicySettings";

vi.mock("@/shared/api/salonMembership", () => ({
  updateSalonJoinApplicationPolicy: vi.fn(),
}));

const salonA = { id: "salon-a", name: "First Salon", joinApplicationPolicy: "open" };
const salonB = { id: "salon-b", name: "Second Salon", joinApplicationPolicy: "closed" };

const renderSettings = (salons = [salonA]) =>
  renderWithProviders(<SalonApplicationPolicySettings salons={salons} />);

beforeEach(() => {
  updateSalonJoinApplicationPolicy.mockResolvedValue({ data: { joinApplicationPolicy: "open" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

it("maps accessible application controls to the policy values", () => {
  renderSettings();

  expect(screen.getByRole("radio", { name: /Anyone looking to join/ })).toBeChecked();
  expect(screen.getByRole("radio", { name: /Off/ })).toHaveAttribute("value", "closed");
  expect(screen.getByRole("radio", { name: /Only through job posts/ })).toHaveAttribute("value", "job_only");
});

it("uses open for legacy managed salons without a policy", () => {
  renderSettings([{ id: "legacy", name: "Legacy Salon" }]);

  expect(screen.getByRole("radio", { name: /Anyone looking to join/ })).toBeChecked();
});

it("renders the stored policy and reconciles an authoritative same-salon refresh", () => {
  const view = renderSettings([salonB]);
  expect(screen.getByRole("radio", { name: /Off/ })).toBeChecked();

  view.rerender(
    <SalonApplicationPolicySettings
      salons={[{ ...salonB, joinApplicationPolicy: "job_only" }]}
    />
  );
  expect(screen.getByRole("radio", { name: /Only through job posts/ })).toBeChecked();
});

it("uses the server-returned policy after a successful scoped update", async () => {
  updateSalonJoinApplicationPolicy.mockResolvedValue({ data: { joinApplicationPolicy: "job_only" } });
  renderSettings();
  fireEvent.click(screen.getByRole("radio", { name: /Off/ }));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));
  });

  expect(updateSalonJoinApplicationPolicy).toHaveBeenCalledWith("salon-a", "closed");
  expect(screen.getByRole("radio", { name: /Only through job posts/ })).toBeChecked();
  expect(screen.getByText("Application settings saved.")).toBeVisible();
});

it("uses a refreshed authoritative policy after a failed update", async () => {
  updateSalonJoinApplicationPolicy.mockRejectedValue({ response: { data: { message: "Not allowed to manage this salon" } } });
  const view = renderSettings();
  fireEvent.click(screen.getByRole("radio", { name: /Off/ }));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));
  });

  expect(screen.getByText("Not allowed to manage this salon")).toBeVisible();
  view.rerender(
    <SalonApplicationPolicySettings
      salons={[{ ...salonA, joinApplicationPolicy: "job_only" }]}
    />
  );
  expect(screen.getByRole("radio", { name: /Only through job posts/ })).toBeChecked();
});

it("does not leak a local selection when managed salon identity changes", () => {
  const view = renderSettings();
  fireEvent.click(screen.getByRole("radio", { name: /Off/ }));
  expect(screen.getByRole("radio", { name: /Off/ })).toBeChecked();

  view.rerender(
    <SalonApplicationPolicySettings
      salons={[{ ...salonB, joinApplicationPolicy: "job_only" }]}
    />
  );
  expect(screen.getByRole("radio", { name: /Only through job posts/ })).toBeChecked();
});

it("keeps an in-flight mutation visible when a stale parent refresh arrives", async () => {
  let resolve;
  updateSalonJoinApplicationPolicy.mockReturnValue(new Promise((nextResolve) => { resolve = nextResolve; }));
  const view = renderSettings();
  fireEvent.click(screen.getByRole("radio", { name: /Off/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));

  view.rerender(
    <SalonApplicationPolicySettings
      salons={[{ ...salonA, joinApplicationPolicy: "job_only" }]}
    />
  );
  expect(screen.getByRole("radio", { name: /Off/ })).toBeChecked();

  await act(async () => {
    resolve({ data: { joinApplicationPolicy: "closed" } });
  });
});

it("scopes independent saves by salon id and prevents duplicate submissions", async () => {
  let resolve;
  updateSalonJoinApplicationPolicy.mockReturnValue(new Promise((nextResolve) => { resolve = nextResolve; }));
  renderSettings([salonA, salonB]);
  fireEvent.click(screen.getAllByRole("radio", { name: /Only through job posts/ })[1]);
  const saves = screen.getAllByRole("button", { name: "Save application settings" });
  fireEvent.click(saves[1]);
  fireEvent.click(saves[1]);

  expect(updateSalonJoinApplicationPolicy).toHaveBeenCalledTimes(1);
  expect(updateSalonJoinApplicationPolicy).toHaveBeenCalledWith("salon-b", "job_only");
  await act(async () => {
    resolve({ data: { joinApplicationPolicy: "job_only" } });
  });
});
