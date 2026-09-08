import { forwardRef, useImperativeHandle } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useServiceManagement } from "./useServiceManagement";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("../api/axios", () => ({
  default: { post: mocks.post, put: mocks.put },
}));

const Harness = forwardRef((props, ref) => {
  const actions = useServiceManagement(props);
  useImperativeHandle(ref, () => actions, [actions]);
  return null;
});

const servicePayload = {
  name: "Haircut",
  price: 5000,
  duration: 30,
};

function renderHookHarness() {
  const ref = { current: null };
  const dispatch = vi.fn();
  const setNewService = vi.fn();
  const setDataError = vi.fn();
  const setIsSaving = vi.fn();

  render(
    <Harness
      ref={ref}
      currentUserId="barber-1"
      dispatch={dispatch}
      newService={{ name: "", price: "", duration: "" }}
      setNewService={setNewService}
      setDataError={setDataError}
      setIsSaving={setIsSaving}
    />
  );

  return { ref, dispatch, setNewService, setDataError, setIsSaving };
}

describe("useServiceManagement addService", () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.put.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  test("propagates a rejected create after reporting a safe error and settling saving", async () => {
    const error = { response: { data: { message: "Could not create service" } } };
    mocks.post.mockRejectedValueOnce(error);
    const { ref, dispatch, setDataError, setIsSaving, setNewService } = renderHookHarness();

    let receivedError;
    await act(async () => {
      try {
        await ref.current.addService(servicePayload);
      } catch (requestError) {
        receivedError = requestError;
      }
    });

    expect(receivedError).toBe(error);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setNewService).not.toHaveBeenCalled();
    expect(setDataError).toHaveBeenNthCalledWith(1, "");
    expect(setDataError).toHaveBeenLastCalledWith("Could not create service");
    expect(setIsSaving.mock.calls).toEqual([[true], [false]]);
  });

  test("dispatches and resets the new-service fields after a successful create", async () => {
    const createdService = { _id: "service-1", barberId: "barber-1", ...servicePayload };
    mocks.post.mockResolvedValueOnce({ data: createdService });
    const { ref, dispatch, setDataError, setIsSaving, setNewService } = renderHookHarness();

    await act(async () => {
      await ref.current.addService(servicePayload);
    });

    expect(mocks.post).toHaveBeenCalledWith("/services", {
      barberId: "barber-1",
      name: "Haircut",
      description: "",
      category: "other",
      tags: [],
      type: "single",
      active: true,
      price: 5000,
      duration: 30,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: "services/addService",
      payload: createdService,
    });
    expect(setNewService).toHaveBeenCalledWith({ name: "", price: "", duration: "" });
    expect(setDataError).toHaveBeenCalledWith("");
    expect(setIsSaving.mock.calls).toEqual([[true], [false]]);
  });

  test("creates a zero-price service like any other valid service", async () => {
    const zeroPricePayload = { ...servicePayload, price: 0 };
    const createdService = { _id: "service-free", barberId: "barber-1", ...zeroPricePayload };
    mocks.post.mockResolvedValueOnce({ data: createdService });
    const { ref, dispatch, setIsSaving } = renderHookHarness();

    await act(async () => {
      await ref.current.addService(zeroPricePayload);
    });

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ price: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: "services/addService",
      payload: createdService,
    });
    expect(setIsSaving.mock.calls).toEqual([[true], [false]]);
  });

  test.each([
    ["blank", ""],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["positive infinity", Infinity],
    ["negative infinity", -Infinity],
    ["malformed", "not-a-price"],
  ])("rejects %s prices without creating a service", async (_label, price) => {
    const { ref, dispatch, setDataError, setIsSaving, setNewService } = renderHookHarness();
    let receivedError;

    await act(async () => {
      try {
        await ref.current.addService({ ...servicePayload, price });
      } catch (error) {
        receivedError = error;
      }
    });

    expect(receivedError).toMatchObject({ message: "Price must be a non-negative number." });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setNewService).not.toHaveBeenCalled();
    expect(setDataError).toHaveBeenCalledWith("Price must be a non-negative number.");
    expect(setIsSaving).not.toHaveBeenCalled();
  });
});

describe("useServiceManagement updateService", () => {
  test("propagates a rejected update after reporting a safe error and settling saving", async () => {
    const error = { response: { data: { message: "Could not update service" } } };
    mocks.put.mockRejectedValueOnce(error);
    const { ref, dispatch, setDataError, setIsSaving } = renderHookHarness();
    let receivedError;

    await act(async () => {
      try {
        await ref.current.updateService("service-1", { active: false });
      } catch (requestError) {
        receivedError = requestError;
      }
    });

    expect(receivedError).toBe(error);
    expect(mocks.put).toHaveBeenCalledWith("/services/service-1", { active: false });
    expect(dispatch).not.toHaveBeenCalled();
    expect(setDataError).toHaveBeenNthCalledWith(1, "");
    expect(setDataError).toHaveBeenLastCalledWith("Could not update service");
    expect(setIsSaving.mock.calls).toEqual([[true], [false]]);
  });

  test("dispatches a successful update and settles saving", async () => {
    const updatedService = { _id: "service-1", ...servicePayload, active: false };
    mocks.put.mockResolvedValueOnce({ data: updatedService });
    const { ref, dispatch, setDataError, setIsSaving } = renderHookHarness();

    await act(async () => {
      await ref.current.updateService("service-1", { active: false });
    });

    expect(mocks.put).toHaveBeenCalledWith("/services/service-1", { active: false });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: "services/updateService",
      payload: updatedService,
    });
    expect(setDataError).toHaveBeenCalledWith("");
    expect(setIsSaving.mock.calls).toEqual([[true], [false]]);
  });
});
