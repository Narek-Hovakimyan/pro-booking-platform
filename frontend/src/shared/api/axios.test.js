import { AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const STORAGE_KEY = "hairbook-redux-state";

function persistToken(token) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ auth: { token, currentUser: { id: "user-1" } } })
  );
}

async function importApi() {
  vi.resetModules();
  return (await import("./axios")).default;
}

async function captureRequest(api, requestConfig = {}) {
  let capturedConfig;
  const response = await api.request({
    url: "/contract",
    method: "post",
    ...requestConfig,
    adapter: async (config) => {
      capturedConfig = config;
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });

  return { capturedConfig, response };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Axios Bearer interceptor", () => {
  test("omits Authorization when storage is empty", async () => {
    const api = await importApi();
    const { capturedConfig } = await captureRequest(api);

    expect(capturedConfig.headers.has("Authorization")).toBe(false);
  });

  test("adds Authorization from a valid persisted auth token", async () => {
    persistToken("stored-token");
    const api = await importApi();

    const { capturedConfig } = await captureRequest(api);

    expect(capturedConfig.headers.get("Authorization")).toBe("Bearer stored-token");
  });

  test("malformed or incomplete storage does not add Authorization and request proceeds", async () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    const api = await importApi();

    const malformed = await captureRequest(api);
    expect(malformed.response.status).toBe(200);
    expect(malformed.capturedConfig.headers.has("Authorization")).toBe(false);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { currentUser: { id: "u1" } } }));
    const incomplete = await captureRequest(api);
    expect(incomplete.capturedConfig.headers.has("Authorization")).toBe(false);
  });

  test("reads the token for each request instead of capturing it at import", async () => {
    persistToken("first-token");
    const api = await importApi();

    const first = await captureRequest(api);
    persistToken("second-token");
    const second = await captureRequest(api);

    expect(first.capturedConfig.headers.get("Authorization")).toBe("Bearer first-token");
    expect(second.capturedConfig.headers.get("Authorization")).toBe("Bearer second-token");
  });

  test.each([
    ["plain Authorization", { Authorization: "Bearer caller-token" }],
    ["plain lowercase authorization", { authorization: "Bearer lower-token" }],
    [
      "AxiosHeaders Authorization",
      new AxiosHeaders({ Authorization: "Bearer axios-token" }),
    ],
    [
      "AxiosHeaders lowercase authorization",
      new AxiosHeaders({ authorization: "Bearer axios-lower-token" }),
    ],
  ])("preserves existing caller credentials: %s", async (_label, headers) => {
    persistToken("stored-token");
    const expected = headers.get?.("Authorization") ?? headers.Authorization ?? headers.authorization;
    const api = await importApi();

    const { capturedConfig } = await captureRequest(api, { headers });

    expect(capturedConfig.headers.get("Authorization")).toBe(expected);
  });

  test("FormData requests remove the JSON Content-Type, keep payload, and still apply Authorization", async () => {
    persistToken("form-token");
    const api = await importApi();
    const formData = new FormData();
    formData.append("avatar", new Blob(["avatar"]), "avatar.txt");

    const { capturedConfig } = await captureRequest(api, {
      data: formData,
      headers: { "Content-Type": "application/json" },
    });

    expect(capturedConfig.data).toBe(formData);
    expect(capturedConfig.headers.get("Content-Type")).not.toBe("application/json");
    expect(capturedConfig.headers.get("Authorization")).toBe("Bearer form-token");
  });

  test("FormData interceptor removes JSON Content-Type before adapter processing", async () => {
    persistToken("direct-form-token");
    vi.resetModules();

    let requestInterceptor;
    const apiMock = {
      interceptors: {
        request: {
          use: vi.fn((callback) => {
            requestInterceptor = callback;
          }),
        },
      },
    };
    const createMock = vi.fn(() => apiMock);

    vi.doMock("axios", () => ({
      default: {
        create: createMock,
      },
    }));

    try {
      await import("./axios");

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(apiMock.interceptors.request.use).toHaveBeenCalledTimes(1);
      expect(requestInterceptor).toEqual(expect.any(Function));

      const formData = new FormData();
      formData.append("avatar", new Blob(["avatar"]), "avatar.txt");
      const observableHeaders = {
        values: new Map([["Content-Type", "application/json"]]),
        has: vi.fn((name) => observableHeaders.values.has(name)),
        set: vi.fn((name, value) => observableHeaders.values.set(name, value)),
        delete: vi.fn((name) => observableHeaders.values.delete(name)),
      };

      const intercepted = requestInterceptor({
        data: formData,
        headers: observableHeaders,
      });

      expect(intercepted.data).toBe(formData);
      expect(observableHeaders.delete).toHaveBeenCalledTimes(1);
      expect(observableHeaders.delete).toHaveBeenCalledWith("Content-Type");
      expect(observableHeaders.values.has("Content-Type")).toBe(false);
      expect(observableHeaders.values.get("Authorization")).toBe(
        "Bearer direct-form-token"
      );

      const plainHeaders = {
        "Content-Type": "application/json",
        "content-type": "application/json",
        Accept: "application/json",
      };

      requestInterceptor({
        data: formData,
        headers: plainHeaders,
      });

      expect(plainHeaders).toEqual({
        Accept: "application/json",
        Authorization: "Bearer direct-form-token",
      });
    } finally {
      vi.doUnmock("axios");
      vi.resetModules();
    }
  });
});
