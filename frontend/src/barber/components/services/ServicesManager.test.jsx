import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ServicesManager from "./ServicesManager";

const deleteConfirmationState = vi.hoisted(() => ({
  capture: false,
  nullStateCalls: 0,
  setter: null,
  calls: [],
}));

const mutationLockState = vi.hoisted(() => ({
  capture: false,
  falseStateCalls: 0,
  setter: null,
  calls: [],
}));

const modalState = vi.hoisted(() => ({
  capture: false,
  target: null,
  falseStateCalls: 0,
  setter: null,
  calls: [],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useState(initialValue) {
      const state = actual.useState(initialValue);
      const stack = new Error().stack || "";
      if (modalState.capture && stack.includes("ServicesManager.jsx")) {
        if (Array.isArray(initialValue) && initialValue.length === 0) {
          modalState.falseStateCalls = 0;
        }
        const observesShowModal =
          modalState.target === "show" &&
          initialValue === false &&
          ++modalState.falseStateCalls === 1;
        const observesModalError =
          modalState.target === "error" && initialValue === "";
        if (observesShowModal || observesModalError) {
          const [, setState] = state;
          const observedSetter = (value) => {
            modalState.calls.push(value);
            return setState(value);
          };
          modalState.setter = observedSetter;
          return [state[0], observedSetter];
        }
      }
      if (mutationLockState.capture && stack.includes("ServicesManager.jsx")) {
        if (Array.isArray(initialValue) && initialValue.length === 0) {
          mutationLockState.falseStateCalls = 0;
        }
        if (initialValue === false) {
          mutationLockState.falseStateCalls += 1;
          if (mutationLockState.falseStateCalls === 2) {
            const frozenSetter = (value) => {
              mutationLockState.calls.push(value);
            };
            mutationLockState.setter = frozenSetter;
            return [state[0], frozenSetter];
          }
        }
      }
      if (
        deleteConfirmationState.capture &&
        initialValue === null &&
        stack.includes("ServicesManager.jsx")
      ) {
        deleteConfirmationState.nullStateCalls += 1;
        if (deleteConfirmationState.nullStateCalls === 2) {
          const [, setState] = state;
          const observedSetter = (value) => {
            deleteConfirmationState.calls.push(value);
            return setState(value);
          };
          deleteConfirmationState.setter = observedSetter;
          return [state[0], observedSetter];
        }
      }
      return state;
    },
  };
});

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

afterEach(() => {
  vi.resetAllMocks();
  deleteConfirmationState.capture = false;
  deleteConfirmationState.nullStateCalls = 0;
  deleteConfirmationState.setter = null;
  deleteConfirmationState.calls = [];
  mutationLockState.capture = false;
  mutationLockState.falseStateCalls = 0;
  mutationLockState.setter = null;
  mutationLockState.calls = [];
  modalState.capture = false;
  modalState.target = null;
  modalState.falseStateCalls = 0;
  modalState.setter = null;
  modalState.calls = [];
});

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

function ServiceDeleteHarness({ initialService, request }) {
  const [services, setServices] = useState([initialService]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const removeService = async (serviceId) => {
    setIsSaving(true);
    setError("");

    try {
      await request(serviceId);
      setServices((currentServices) => currentServices.filter(
        (service) => service.id !== serviceId
      ));
    } catch (requestError) {
      setError("Could not delete service. Please try again.");
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ServicesManager
      services={services}
      removeService={removeService}
      addService={vi.fn()}
      updateService={vi.fn()}
      error={error}
      isSaving={isSaving}
    />
  );
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
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

  test("accepts only one pending create and releases the lock after success", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const pendingCreate = createDeferred();
    const addService = vi.fn().mockReturnValueOnce(pendingCreate.promise);

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
    const saveButton = screen.getByRole("button", { name: "Saving..." });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(addService).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingCreate.resolve({ id: "service-1" });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("uses the ref guard before mutation-lock state can render disabled controls", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const pendingCreate = createDeferred();
    const addService = vi.fn().mockReturnValueOnce(pendingCreate.promise);
    mutationLockState.capture = true;

    render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );
    expect(mutationLockState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Haircut" } });
    const [priceInput, durationInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "5000" } });
    fireEvent.change(durationInput, { target: { value: "30" } });
    const saveButton = screen.getByRole("button", { name: "Add service" });

    fireEvent.click(saveButton);
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(mutationLockState.calls).toEqual([true]);
    expect(addService).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingCreate.resolve({ id: "service-1" });
      await Promise.resolve();
    });

    expect(mutationLockState.calls).toEqual([true, false]);
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

  test("retains failed delete confirmation and removes the service only after a successful retry", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const failedRequest = createDeferred();
    const request = vi.fn()
      .mockReturnValueOnce(failedRequest.promise)
      .mockResolvedValueOnce({});

    render(<ServiceDeleteHarness initialService={service} request={request} />);

    fireEvent.click(screen.getByTitle("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(request).toHaveBeenCalledTimes(1);
    failedRequest.reject(new Error("temporary failure"));

    expect(await screen.findByText("Could not delete service. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Haircut" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.getByTitle("Edit")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Haircut" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("keeps an open delete confirmation disabled until a pending update settles", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingUpdate = createDeferred();
    const updateService = vi.fn().mockReturnValueOnce(pendingUpdate.promise);
    const removeService = vi.fn().mockResolvedValueOnce({});

    render(
      <ServicesManager
        services={[service]}
        removeService={removeService}
        addService={vi.fn()}
        updateService={updateService}
      />
    );

    fireEvent.click(screen.getByTitle("Delete"));
    fireEvent.click(screen.getByTitle("Deactivate"));

    await waitFor(() => expect(updateService).toHaveBeenCalledWith("service-1", { active: false }));
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(deleteButton);
    expect(removeService).not.toHaveBeenCalled();

    await act(async () => {
      pendingUpdate.resolve({ ...service, active: false });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(removeService).toHaveBeenCalledTimes(1));
  });

  test("blocks other mutations during a pending delete and releases the lock after rejection", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingDelete = createDeferred();
    const removeService = vi.fn()
      .mockReturnValueOnce(pendingDelete.promise)
      .mockResolvedValueOnce({});
    const updateService = vi.fn();

    render(
      <ServicesManager
        services={[service]}
        removeService={removeService}
        addService={vi.fn()}
        updateService={updateService}
      />
    );

    fireEvent.click(screen.getByTitle("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeService).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle("Deactivate")).toBeDisabled();
    expect(screen.getByTitle("Edit")).toBeDisabled();
    fireEvent.click(screen.getByTitle("Deactivate"));
    fireEvent.click(screen.getByTitle("Edit"));
    expect(updateService).not.toHaveBeenCalled();

    await act(async () => {
      pendingDelete.reject(new Error("temporary failure"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled());
    expect(screen.getByTitle("Edit")).toBeEnabled();
    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(removeService).toHaveBeenCalledTimes(2));
  });

  test("does not close or reset local create state after late success unmount", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const pendingCreate = createDeferred();
    const addService = vi.fn().mockReturnValueOnce(pendingCreate.promise);
    modalState.capture = true;
    modalState.target = "show";

    const { unmount } = render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );
    expect(modalState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Haircut" } });
    const [priceInput, durationInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "5000" } });
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(addService).toHaveBeenCalledTimes(1));
    modalState.calls = [];

    unmount();
    await act(async () => {
      pendingCreate.resolve({ id: "service-1" });
      await Promise.resolve();
    });

    expect(modalState.calls).toEqual([]);
  });

  test("does not set a local create error after late failure unmount", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const pendingCreate = createDeferred();
    const addService = vi.fn().mockReturnValueOnce(pendingCreate.promise);
    modalState.capture = true;
    modalState.target = "error";

    const { unmount } = render(
      <ServicesManager
        services={[]}
        removeService={vi.fn()}
        addService={addService}
        updateService={vi.fn()}
      />
    );
    expect(modalState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: /add your first service/i }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Haircut" } });
    const [priceInput, durationInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "5000" } });
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(addService).toHaveBeenCalledTimes(1));
    modalState.calls = [];

    unmount();
    await act(async () => {
      pendingCreate.reject(new Error("temporary failure"));
      await Promise.resolve();
    });

    expect(modalState.calls).toEqual([]);
  });

  test("does not close or reset local edit state after late success unmount", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingUpdate = createDeferred();
    const updateService = vi.fn().mockReturnValueOnce(pendingUpdate.promise);
    modalState.capture = true;
    modalState.target = "show";

    const { unmount } = render(
      <ServicesManager
        services={[service]}
        removeService={vi.fn()}
        addService={vi.fn()}
        updateService={updateService}
      />
    );
    expect(modalState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Save service" }));
    await waitFor(() => expect(updateService).toHaveBeenCalledTimes(1));
    modalState.calls = [];

    unmount();
    await act(async () => {
      pendingUpdate.resolve({ ...service, name: "Updated haircut" });
      await Promise.resolve();
    });

    expect(modalState.calls).toEqual([]);
  });

  test("does not set a local edit error after late failure unmount", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingUpdate = createDeferred();
    const updateService = vi.fn().mockReturnValueOnce(pendingUpdate.promise);
    modalState.capture = true;
    modalState.target = "error";

    const { unmount } = render(
      <ServicesManager
        services={[service]}
        removeService={vi.fn()}
        addService={vi.fn()}
        updateService={updateService}
      />
    );
    expect(modalState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Save service" }));
    await waitFor(() => expect(updateService).toHaveBeenCalledTimes(1));
    modalState.calls = [];

    unmount();
    await act(async () => {
      pendingUpdate.reject(new Error("temporary failure"));
      await Promise.resolve();
    });

    expect(modalState.calls).toEqual([]);
  });

  test("does not attempt delete-confirmation state after late delete success unmount", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingRequest = createDeferred();
    const removeService = vi.fn().mockReturnValueOnce(pendingRequest.promise);

    deleteConfirmationState.capture = true;

    const { unmount } = render(
      <ServicesManager
        services={[service]}
        removeService={removeService}
        addService={vi.fn()}
        updateService={vi.fn()}
      />
    );
    expect(deleteConfirmationState.setter).toEqual(expect.any(Function));

    fireEvent.click(screen.getByTitle("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeService).toHaveBeenCalledTimes(1);
    deleteConfirmationState.calls = [];

    unmount();
    await act(async () => {
      pendingRequest.resolve();
      await Promise.resolve();
    });

    expect(removeService).toHaveBeenCalledTimes(1);
    expect(deleteConfirmationState.calls).toEqual([]);
  });

  test("settles a late delete failure after unmount without unsafe caller updates", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const service = {
      id: "service-1", name: "Haircut", price: 5000, duration: 30,
      active: true, category: "haircut",
    };
    const pendingRequest = createDeferred();
    const removeService = vi.fn().mockReturnValueOnce(pendingRequest.promise);

    const { unmount } = render(
      <ServicesManager
        services={[service]}
        removeService={removeService}
        addService={vi.fn()}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeService).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      pendingRequest.reject(new Error("temporary failure"));
      await Promise.resolve();
    });

    expect(removeService).toHaveBeenCalledTimes(1);
  });
});
