import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ServicesManager from "./ServicesManager";

const fetchServiceCategories = vi.fn();
const setServiceCategoryActive = vi.fn();

vi.mock("react-redux", () => ({
  useSelector: (selector) => selector({ auth: { currentUser: { id: "barber-1" } } }),
}));

vi.mock("@/shared/api/serviceCategories", () => ({
  fetchServiceCategories: (...args) => fetchServiceCategories(...args),
  createServiceCategory: vi.fn(),
  setServiceCategoryActive: (...args) => setServiceCategoryActive(...args),
}));

afterEach(() => vi.resetAllMocks());

function ServiceToggleHarness({ initialService, request }) {
  const [services, setServices] = useState([initialService]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const updateService = async (serviceId, payload) => {
    setIsSaving(true);
    setError("");

    try {
      const updatedService = await request(serviceId, payload);
      setServices((currentServices) => currentServices.map((service) =>
        service.id === serviceId ? updatedService : service
      ));
    } catch (requestError) {
      setError("Could not update service. Please try again.");
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ServicesManager
      services={services}
      removeService={vi.fn()}
      addService={vi.fn()}
      updateService={updateService}
      error={error}
      isSaving={isSaving}
    />
  );
}

describe("ServicesManager", () => {
  test("editing retains an owner-visible inactive custom category", async () => {
    fetchServiceCategories.mockResolvedValue([]);

    render(
      <ServicesManager
        services={[{
          id: "service-1",
          name: "Color",
          price: 8000,
          duration: 60,
          active: true,
          category: "other",
          customCategoryId: {
            _id: "inactive-category",
            name: "Archived Color",
            active: false,
          },
        }]}
        removeService={vi.fn()}
        addService={vi.fn()}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("Edit"));

    expect(await screen.findByText("Archived Color (Inactive)")).toBeInTheDocument();
    expect(screen.getByText(/retained for this service/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save service" })).not.toBeDisabled();
  });

  test("clears a deactivated new-service category and blocks submission", async () => {
    const activeCategory = { id: "active-category", name: "Active Category", source: "custom", active: true };
    fetchServiceCategories
      .mockResolvedValueOnce([activeCategory])
      .mockResolvedValueOnce([activeCategory])
      .mockResolvedValueOnce([]);
    setServiceCategoryActive.mockResolvedValue({ ...activeCategory, active: false });
    const addService = vi.fn();

    render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.click(screen.getByRole("button", { name: "Custom category" }));
    const categorySelect = (await screen.findByRole("option", { name: "Active Category" })).parentElement;
    fireEvent.change(categorySelect, { target: { value: activeCategory.id } });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate selected category" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(setServiceCategoryActive).toHaveBeenCalledWith(activeCategory.id, false));
    await waitFor(() => expect(categorySelect).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Add service" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(addService).not.toHaveBeenCalled();
  });

  test("marks legacy unavailable package members and blocks saving them", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const addService = vi.fn();
    render(
      <ServicesManager
        services={[
          { id: "active-member", name: "Cut", price: 4000, duration: 30, active: true, type: "single", category: "haircut" },
          { id: "inactive-member", name: "Legacy beard", price: 3000, duration: 20, active: false, type: "single", category: "beard" },
          {
            id: "legacy-package", name: "Legacy package", price: 7000, duration: 50,
            active: true, type: "package", category: "other",
            includedServiceIds: ["active-member", "inactive-member"],
          },
        ]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByTitle("Edit")[1]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable package member: inactive-member");
    expect(screen.getByRole("button", { name: "Save service" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save service" }));
    expect(addService).not.toHaveBeenCalled();
  });

  test("retains the add-service form after a rejected create and closes it only after retry succeeds", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const addService = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ id: "service-1" });

    render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Haircut" } });
    const [priceInput, durationInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "5000" } });
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => expect(addService).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Could not create service.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Service name")).toHaveValue("Haircut");
    expect(priceInput).toHaveValue(5000);
    expect(durationInput).toHaveValue(30);
    expect(screen.getByRole("button", { name: "Add service" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(addService).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    expect(screen.getByLabelText("Service name")).toHaveValue("");
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(null);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(null);
  });

  test("creates a zero-price service once and closes the dialog after success", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const addService = vi.fn().mockResolvedValueOnce({ id: "service-free" });

    render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Consultation" } });
    const [priceInput, durationInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "0" } });
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => expect(addService).toHaveBeenCalledTimes(1));
    expect(addService.mock.calls[0][0]).toMatchObject({
      name: "Consultation",
      price: 0,
      duration: 30,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("keeps the dialog open for blank, negative, or malformed prices without creating a service", () => {
    fetchServiceCategories.mockResolvedValue([]);
    const addService = vi.fn();

    for (const price of ["", "-1", "not-a-price"]) {
      const { unmount } = render(
        <ServicesManager
          services={[]}
          removeService={vi.fn()}
          addService={addService}
          updateService={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
      fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Consultation" } });
      const [, durationInput] = screen.getAllByRole("spinbutton");
      fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: price } });
      fireEvent.change(durationInput, { target: { value: "30" } });
      fireEvent.click(screen.getByRole("button", { name: "Add service" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Price must be a non-negative number.")).toBeInTheDocument();
      expect(screen.getByLabelText("Service name")).toHaveValue("Consultation");
      unmount();
    }

    expect(addService).not.toHaveBeenCalled();
  });

  test("contains a failed deactivation, preserves the active service, and allows a successful retry", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const activeService = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ ...activeService, active: false });

    render(<ServiceToggleHarness initialService={activeService} request={request} />);

    const toggle = screen.getByTitle("Deactivate");
    fireEvent.click(toggle);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenLastCalledWith("service-1", { active: false });
    expect(await screen.findByText("Could not update service. Please try again.")).toBeInTheDocument();
    expect(screen.getByTitle("Deactivate")).toBeEnabled();

    fireEvent.click(screen.getByTitle("Deactivate"));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenLastCalledWith("service-1", { active: false });
    expect(screen.queryByText("Could not update service. Please try again.")).not.toBeInTheDocument();
    expect(screen.getByTitle("Activate")).toBeEnabled();
  });

  test("activates an inactive service through the shared toggle path", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const inactiveService = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: false, category: "haircut",
    };
    const request = vi.fn().mockResolvedValueOnce({ ...inactiveService, active: true });

    render(<ServiceToggleHarness initialService={inactiveService} request={request} />);

    fireEvent.click(screen.getByTitle("Activate"));

    await waitFor(() => expect(request).toHaveBeenCalledWith("service-1", { active: true }));
    expect(screen.getByTitle("Deactivate")).toBeEnabled();
  });
});
