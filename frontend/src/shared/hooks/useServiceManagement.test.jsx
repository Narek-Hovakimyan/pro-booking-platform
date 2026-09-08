import { forwardRef, useImperativeHandle } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useServiceManagement } from "./useServiceManagement";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("../api/axios", () => ({
  default: { post: mocks.post },
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
  beforeEach(() => mocks.post.mockReset());
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
});
