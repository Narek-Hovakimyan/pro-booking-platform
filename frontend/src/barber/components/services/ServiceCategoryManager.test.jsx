import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ServiceCategoryManager from "./ServiceCategoryManager";

const fetchServiceCategories = vi.fn();
const createServiceCategory = vi.fn();
const renameServiceCategory = vi.fn();
const setServiceCategoryActive = vi.fn();
const deleteServiceCategory = vi.fn();

vi.mock("@/shared/api/serviceCategories", () => ({
  fetchServiceCategories: (...args) => fetchServiceCategories(...args),
  createServiceCategory: (...args) => createServiceCategory(...args),
  renameServiceCategory: (...args) => renameServiceCategory(...args),
  setServiceCategoryActive: (...args) => setServiceCategoryActive(...args),
  deleteServiceCategory: (...args) => deleteServiceCategory(...args),
}));

const activeCategory = { id: "active-category", name: "Active Category", source: "custom", active: true };
const renderManager = (overrides = {}) => render(
  <ServiceCategoryManager
    barberId="barber-1"
    form={{ categoryType: "custom", customCategoryId: "", ...overrides.form }}
    isSaving={false}
    {...overrides}
  />
);

afterEach(() => vi.resetAllMocks());

describe("ServiceCategoryManager", () => {
  test("retains the current inactive category without offering it for new assignments", async () => {
    fetchServiceCategories.mockResolvedValue([activeCategory]);

    renderManager({
      form: {
        categoryType: "custom",
        customCategoryId: "inactive-category",
        currentCustomCategory: { id: "inactive-category", name: "Archived Color", active: false },
      },
    });

    expect(await screen.findByText("Archived Color (Inactive)")).toBeInTheDocument();
    expect(screen.getByText(/retained for this service/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Archived Color (Inactive)" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Active Category" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Reactivate selected category" })).toBeInTheDocument();
  });

  test("retains an active existing category omitted from the barber-scoped list", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const onCustomCategoryIdChange = vi.fn();

    renderManager({
      form: {
        categoryType: "custom",
        customCategoryId: "salon-category",
        currentCustomCategory: {
          id: "salon-category",
          name: "Salon Color",
          active: true,
        },
      },
      onCustomCategoryIdChange,
    });

    const option = await screen.findByRole("option", { name: "Salon Color" });
    expect(option).not.toBeDisabled();
    expect(option.parentElement).toHaveValue("salon-category");
    expect(onCustomCategoryIdChange).not.toHaveBeenCalledWith("");
  });

  test("does not duplicate a retained category when the fetched list includes it", async () => {
    const salonCategory = {
      id: "salon-category",
      name: "Salon Color",
      source: "custom",
      active: true,
    };
    fetchServiceCategories.mockResolvedValue([salonCategory]);

    renderManager({
      form: {
        categoryType: "custom",
        customCategoryId: salonCategory.id,
        currentCustomCategory: salonCategory,
      },
    });

    await screen.findByRole("option", { name: "Salon Color" });
    expect(screen.getAllByRole("option", { name: "Salon Color" })).toHaveLength(1);
  });

  test("does not carry an edit-only retained category into create mode", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const initialProps = {
      form: {
        categoryType: "custom",
        customCategoryId: "salon-category",
        currentCustomCategory: {
          id: "salon-category",
          name: "Salon Color",
          active: true,
        },
      },
    };
    const { rerender } = renderManager(initialProps);

    expect(await screen.findByRole("option", { name: "Salon Color" })).toBeInTheDocument();
    rerender(
      <ServiceCategoryManager
        barberId="barber-1"
        form={{ categoryType: "custom", customCategoryId: "" }}
        isSaving={false}
      />
    );

    expect(screen.queryByRole("option", { name: "Salon Color" })).not.toBeInTheDocument();
  });

  test("does not retain an unavailable existing category", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    const onCustomCategoryIdChange = vi.fn();

    renderManager({
      form: {
        categoryType: "custom",
        customCategoryId: "missing-category",
        currentCustomCategory: {
          id: "missing-category",
          name: "Unavailable custom category",
          active: false,
          missing: true,
        },
      },
      onCustomCategoryIdChange,
    });

    await waitFor(() => expect(onCustomCategoryIdChange).toHaveBeenCalledWith(""));
    expect(screen.queryByRole("option", { name: /Unavailable custom category/ })).not.toBeInTheDocument();
  });

  test("marks a missing legacy category as unavailable", async () => {
    fetchServiceCategories.mockResolvedValue([]);

    renderManager({
      form: {
        categoryType: "custom",
        customCategoryId: "missing-category",
        currentCustomCategory: { id: "missing-category", name: "Unavailable custom category", active: false, missing: true },
      },
    });

    expect(await screen.findByText(/category is unavailable/i)).toBeInTheDocument();
  });

  test("confirms deactivation, refreshes categories, and clears a new-service selection", async () => {
    fetchServiceCategories
      .mockResolvedValueOnce([activeCategory])
      .mockResolvedValueOnce([]);
    setServiceCategoryActive.mockResolvedValue({ ...activeCategory, active: false });
    const onCustomCategoryIdChange = vi.fn();

    renderManager({
      form: { categoryType: "custom", customCategoryId: activeCategory.id },
      onCustomCategoryIdChange,
    });

    await screen.findByRole("option", { name: "Active Category" });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate selected category" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setServiceCategoryActive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate selected category" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(setServiceCategoryActive).toHaveBeenCalledWith(activeCategory.id, false));
    expect(await screen.findByText("Active Category (Inactive)")).toBeInTheDocument();
    expect(onCustomCategoryIdChange).toHaveBeenCalledWith("");
    await waitFor(() => expect(fetchServiceCategories).toHaveBeenCalledTimes(2));
  });

  test("reactivates a retained inactive category and preserves its selected ID", async () => {
    const inactive = { id: "inactive-category", name: "Archived Color", source: "custom", active: false };
    fetchServiceCategories.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...inactive, active: true }]);
    setServiceCategoryActive.mockResolvedValue({ ...inactive, active: true });
    const onCustomCategoryIdChange = vi.fn();

    renderManager({
      form: { categoryType: "custom", customCategoryId: inactive.id, currentCustomCategory: inactive },
      onCustomCategoryIdChange,
    });

    await screen.findByRole("button", { name: "Reactivate selected category" });
    fireEvent.click(screen.getByRole("button", { name: "Reactivate selected category" }));
    await waitFor(() => expect(setServiceCategoryActive).toHaveBeenCalledWith(inactive.id, true));
    expect(onCustomCategoryIdChange).toHaveBeenCalledWith(inactive.id);
    expect(await screen.findByRole("option", { name: "Archived Color" })).not.toBeDisabled();
  });

  test("renames the selected category and refreshes the parent category cache", async () => {
    const renamed = { ...activeCategory, name: "Color" };
    fetchServiceCategories.mockResolvedValueOnce([activeCategory]).mockResolvedValueOnce([renamed]);
    renameServiceCategory.mockResolvedValue(renamed);
    const onCustomCategoriesChange = vi.fn();

    renderManager({
      form: { categoryType: "custom", customCategoryId: activeCategory.id },
      onCustomCategoriesChange,
    });

    await screen.findByRole("button", { name: "Rename selected category" });
    fireEvent.click(screen.getByRole("button", { name: "Rename selected category" }));
    fireEvent.change(screen.getByLabelText("Rename custom category"), { target: { value: "Color" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(renameServiceCategory).toHaveBeenCalledWith(activeCategory.id, "Color"));
    expect(await screen.findByRole("option", { name: "Color" })).toBeInTheDocument();
    await waitFor(() => expect(onCustomCategoriesChange).toHaveBeenLastCalledWith([renamed]));
  });

  test("keeps the backend lifecycle error and does not remove the category after delete fails", async () => {
    fetchServiceCategories.mockResolvedValue([activeCategory]);
    deleteServiceCategory.mockRejectedValue({ response: { data: { message: "Category is still in use" } } });

    renderManager({ form: { categoryType: "custom", customCategoryId: activeCategory.id } });

    await screen.findByRole("button", { name: "Delete selected category" });
    fireEvent.click(screen.getByRole("button", { name: "Delete selected category" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Category is still in use");
    expect(screen.getByRole("option", { name: "Active Category" })).toBeInTheDocument();
  });

  test("prevents rapid Enter submissions from creating duplicate categories", async () => {
    fetchServiceCategories.mockResolvedValue([]);
    let resolveCreate;
    createServiceCategory.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    renderManager();

    await screen.findByRole("button", { name: /add custom category/i });
    fireEvent.click(screen.getByRole("button", { name: /add custom category/i }));
    const input = screen.getByLabelText("New custom category name");
    fireEvent.change(input, { target: { value: "Color" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createServiceCategory).toHaveBeenCalledTimes(1);
    resolveCreate({ id: "color", name: "Color", source: "custom", active: true });
    expect(await screen.findByRole("option", { name: "Color" })).toBeInTheDocument();
  });
});
