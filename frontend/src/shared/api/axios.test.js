import { AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

async function importApi() {
  vi.resetModules();
  return (await import("./axios")).default;
}

async function importApiWithToken(token) {
  const api = await importApi();
  const tokenStore = await import("@/shared/auth/accessTokenStore");

  if (token) {
    tokenStore.setAccessToken(token);
  } else {
    tokenStore.clearAccessToken();
  }

  return { api, tokenStore };
}

async function importInterceptorHarness({
  requestRefreshSession = vi.fn(),
  applyRefreshedAuthSession = vi.fn(),
  expireCurrentAuthSession = vi.fn(),
} = {}) {
  vi.resetModules();

  let requestInterceptor;
  let responseRejected;
  const apiMock = {
    interceptors: {
      request: {
        use: vi.fn((callback) => {
          requestInterceptor = callback;
        }),
      },
      response: {
        use: vi.fn((_fulfilled, rejected) => {
          responseRejected = rejected;
        }),
      },
    },
    request: vi.fn(),
  };
  const createMock = vi.fn(() => apiMock);

  vi.doMock("axios", () => ({
    default: {
      create: createMock,
    },
  }));
  vi.doMock("./authSession", () => ({
    requestRefreshSession,
    applyRefreshedAuthSession,
    expireCurrentAuthSession,
  }));

  await import("./axios");
  const tokenStore = await import("@/shared/auth/accessTokenStore");

  return {
    apiMock,
    createMock,
    requestInterceptor,
    responseRejected,
    requestRefreshSession,
    applyRefreshedAuthSession,
    expireCurrentAuthSession,
    tokenStore,
  };
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
  test("creates a credentialed client with the fixed CSRF protocol header", async () => {
    const api = await importApi();
    const { capturedConfig } = await captureRequest(api);

    expect(capturedConfig.baseURL).toMatch(/\/api$/);
    expect(capturedConfig.withCredentials).toBe(true);
    expect(capturedConfig.headers.get("Content-Type")).toBe("application/json");
    expect(capturedConfig.headers.get("Accept")).toBe("application/json");
    expect(capturedConfig.headers.get("X-Hairbook-CSRF")).toBe("1");
  });

  test("omits Authorization when storage is empty", async () => {
    const { api } = await importApiWithToken(null);
    const { capturedConfig } = await captureRequest(api);

    expect(capturedConfig.headers.has("Authorization")).toBe(false);
  });

  test("adds Authorization from a valid persisted auth token", async () => {
    const { api } = await importApiWithToken("stored-token");

    const { capturedConfig } = await captureRequest(api);

    expect(capturedConfig.headers.get("Authorization")).toBe("Bearer stored-token");
  });

  test("missing memory token does not add Authorization and request proceeds", async () => {
    const { api } = await importApiWithToken(null);

    const request = await captureRequest(api);
    expect(request.response.status).toBe(200);
    expect(request.capturedConfig.headers.has("Authorization")).toBe(false);
  });

  test("reads the token for each request instead of capturing it at import", async () => {
    const { api, tokenStore } = await importApiWithToken("first-token");

    const first = await captureRequest(api);
    tokenStore.setAccessToken("second-token");
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
    const { api } = await importApiWithToken("stored-token");
    const expected = headers.get?.("Authorization") ?? headers.Authorization ?? headers.authorization;

    const { capturedConfig } = await captureRequest(api, { headers });

    expect(capturedConfig.headers.get("Authorization")).toBe(expected);
  });

  test.each([
    ["application/json"],
    ["multipart/form-data"],
    ["text/plain"],
  ])(
    "FormData requests remove %s Content-Type, keep payload, and still apply Authorization",
    async (contentType) => {
      const { api } = await importApiWithToken("form-token");
      const formData = new FormData();
      formData.append("avatar", new Blob(["avatar"]), "avatar.txt");

      const { capturedConfig } = await captureRequest(api, {
        data: formData,
        headers: {
          "Content-Type": contentType,
          "X-Custom-Trace": "trace-1",
        },
      });

      expect(capturedConfig.data).toBe(formData);
      expect(capturedConfig.headers.get("X-Hairbook-CSRF")).toBe("1");
      expect(capturedConfig.headers.get("Authorization")).toBe(
        "Bearer form-token"
      );
      expect(capturedConfig.headers.get("Accept")).toBe("application/json");
      expect(capturedConfig.headers.get("X-Custom-Trace")).toBe("trace-1");
    }
  );

  test("FormData interceptor removes JSON Content-Type before adapter processing", async () => {
    vi.resetModules();

    let requestInterceptor;
    let responseInterceptor;
    const bareAuthApiMock = {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post: vi.fn(),
    };
    const apiMock = {
      interceptors: {
        request: {
          use: vi.fn((callback) => {
            requestInterceptor = callback;
          }),
        },
        response: {
          use: vi.fn((callback) => {
            responseInterceptor = callback;
          }),
        },
      },
      post: vi.fn(),
    };
    const createMock = vi
      .fn()
      .mockReturnValueOnce(bareAuthApiMock)
      .mockReturnValueOnce(apiMock);

    vi.doMock("axios", () => ({
      default: {
        create: createMock,
      },
    }));

    try {
      await import("./axios");
      const tokenStore = await import("@/shared/auth/accessTokenStore");
      tokenStore.setAccessToken("direct-form-token");

      expect(createMock).toHaveBeenCalledTimes(2);
      expect(apiMock.interceptors.request.use).toHaveBeenCalledTimes(1);
      expect(apiMock.interceptors.response.use).toHaveBeenCalledTimes(1);
      expect(requestInterceptor).toEqual(expect.any(Function));
      expect(responseInterceptor).toEqual(expect.any(Function));

      const formData = new FormData();
      formData.append("avatar", new Blob(["avatar"]), "avatar.txt");
      const observableHeaders = {
        values: new Map([
          ["Content-Type", "application/json"],
          ["X-Hairbook-CSRF", "1"],
          ["Accept", "application/json"],
          ["X-Custom-Trace", "trace-1"],
        ]),
        get: vi.fn((name) => observableHeaders.values.get(name)),
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
      expect(observableHeaders.values.get("Authorization")).toBe("Bearer direct-form-token");
      expect(observableHeaders.values.get("X-Hairbook-CSRF")).toBe("1");
      expect(observableHeaders.values.get("Accept")).toBe("application/json");
      expect(observableHeaders.values.get("X-Custom-Trace")).toBe("trace-1");

      const plainHeadersCases = [
        {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer caller-token",
          "X-Hairbook-CSRF": "1",
          "X-Custom-Trace": "trace-1",
        },
        {
          "content-type": "multipart/form-data",
          Accept: "application/json",
          "X-Hairbook-CSRF": "1",
          "X-Custom-Trace": "trace-2",
        },
        {
          "CoNtEnT-TyPe": "text/plain",
          Accept: "application/json",
          "X-Hairbook-CSRF": "1",
          "X-Custom-Trace": "trace-3",
        },
      ];

      plainHeadersCases.forEach((plainHeaders, index) => {
        requestInterceptor({
          data: formData,
          headers: plainHeaders,
        });

        expect(
          Object.keys(plainHeaders).some(
            (headerName) => headerName.toLowerCase() === "content-type"
          )
        ).toBe(false);
        expect(plainHeaders.Accept).toBe("application/json");
        expect(plainHeaders["X-Hairbook-CSRF"]).toBe("1");
        expect(plainHeaders["X-Custom-Trace"]).toBe(`trace-${index + 1}`);
      });

      expect(plainHeadersCases[0].Authorization).toBe("Bearer caller-token");
      expect(plainHeadersCases[1].Authorization).toBe("Bearer direct-form-token");
      expect(plainHeadersCases[2].Authorization).toBe("Bearer direct-form-token");
    } finally {
      vi.doUnmock("axios");
      vi.resetModules();
    }
  });

  test("replays one auto-authenticated request after a single-flight refresh", async () => {
    const requestRefreshSession = vi.fn(async () => ({
      token: "fresh-token",
      user: { id: "user-1" },
    }));
    const { apiMock, requestInterceptor, responseRejected, applyRefreshedAuthSession, tokenStore } =
      await importInterceptorHarness({
        requestRefreshSession,
        applyRefreshedAuthSession: vi.fn(async (session) => {
          tokenStore.setAccessToken(session.token);
        }),
      });
    tokenStore.setAccessToken("expired-token");
    apiMock.request.mockResolvedValueOnce({ data: { ok: true } });

    const interceptedConfig = requestInterceptor({
      url: "/clients",
      headers: new AxiosHeaders(),
    });
    const unauthorized = new Error("Unauthorized");
    unauthorized.config = interceptedConfig;
    unauthorized.response = { status: 401 };

    await expect(responseRejected(unauthorized)).resolves.toEqual({ data: { ok: true } });
    expect(requestRefreshSession).toHaveBeenCalledTimes(1);
    expect(applyRefreshedAuthSession).toHaveBeenCalledWith({
      token: "fresh-token",
      user: { id: "user-1" },
    });
    expect(apiMock.request).toHaveBeenCalledTimes(1);
    expect(
      apiMock.request.mock.calls[0][0].headers.get("Authorization")
    ).toBe("Bearer fresh-token");

    vi.doUnmock("axios");
    vi.doUnmock("./authSession");
    vi.resetModules();
  });

  test("shares one refresh for concurrent 401s and retries each request once", async () => {
    const refreshPromise = Promise.resolve({
      token: "fresh-token",
      user: { id: "user-1" },
    });
    const requestRefreshSession = vi.fn(() => refreshPromise);
    const { apiMock, requestInterceptor, responseRejected, tokenStore } =
      await importInterceptorHarness({
        requestRefreshSession,
        applyRefreshedAuthSession: vi.fn(async (session) => {
          tokenStore.setAccessToken(session.token);
        }),
      });
    tokenStore.setAccessToken("expired-token");
    apiMock.request
      .mockResolvedValueOnce({ data: { ok: "/a" } })
      .mockResolvedValueOnce({ data: { ok: "/b" } });

    const firstConfig = requestInterceptor({
      url: "/a",
      headers: new AxiosHeaders(),
    });
    const secondConfig = requestInterceptor({
      url: "/b",
      headers: new AxiosHeaders(),
    });
    const firstError = new Error("Unauthorized");
    firstError.config = firstConfig;
    firstError.response = { status: 401 };
    const secondError = new Error("Unauthorized");
    secondError.config = secondConfig;
    secondError.response = { status: 401 };

    const [first, second] = await Promise.all([
      responseRejected(firstError),
      responseRejected(secondError),
    ]);

    expect(first).toEqual({ data: { ok: "/a" } });
    expect(second).toEqual({ data: { ok: "/b" } });
    expect(requestRefreshSession).toHaveBeenCalledTimes(2);
    expect(apiMock.request).toHaveBeenCalledTimes(2);

    vi.doUnmock("axios");
    vi.doUnmock("./authSession");
    vi.resetModules();
  });

  test("never refreshes caller Authorization or auth endpoints", async () => {
    const requestRefreshSession = vi.fn();
    const { requestInterceptor, responseRejected } = await importInterceptorHarness({
      requestRefreshSession,
    });

    const callerConfig = requestInterceptor({
      url: "/secure",
      headers: new AxiosHeaders({ Authorization: "Bearer caller-token" }),
    });
    const callerError = new Error("Unauthorized");
    callerError.config = callerConfig;
    callerError.response = { status: 401 };

    const authConfig = requestInterceptor({
      url: "/auth/login",
      headers: new AxiosHeaders(),
    });
    const authError = new Error("Unauthorized");
    authError.config = authConfig;
    authError.response = { status: 401 };

    await expect(responseRejected(callerError)).rejects.toThrow("Unauthorized");
    await expect(responseRejected(authError)).rejects.toThrow("Unauthorized");
    expect(requestRefreshSession).not.toHaveBeenCalled();

    vi.doUnmock("axios");
    vi.doUnmock("./authSession");
    vi.resetModules();
  });

  test("expires the local session on refresh 401 or malformed success", async () => {
    const expireCurrentAuthSession = vi.fn(async () => {
      const tokenStore = await import("@/shared/auth/accessTokenStore");
      tokenStore.clearAccessToken();
    });
    vi.doMock("./authSession", () => ({
      requestRefreshSession: vi
        .fn()
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockRejectedValueOnce({ code: "AUTH_SESSION_INVALID_RESPONSE" }),
      applyRefreshedAuthSession: vi.fn(),
      expireCurrentAuthSession,
    }));

    const { requestInterceptor, responseRejected, tokenStore } =
      await importInterceptorHarness({
        requestRefreshSession: vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 401 } })
          .mockRejectedValueOnce({ code: "AUTH_SESSION_INVALID_RESPONSE" }),
        expireCurrentAuthSession,
      });
    tokenStore.setAccessToken("expired-token");

    const firstConfig = requestInterceptor({
      url: "/secure",
      headers: new AxiosHeaders(),
    });
    const firstError = new Error("Unauthorized");
    firstError.config = firstConfig;
    firstError.response = { status: 401 };

    const secondConfig = requestInterceptor({
      url: "/secure",
      headers: new AxiosHeaders(),
    });
    const secondError = new Error("Unauthorized");
    secondError.config = secondConfig;
    secondError.response = { status: 401 };

    await expect(responseRejected(firstError)).rejects.toThrow("Unauthorized");
    await expect(responseRejected(secondError)).rejects.toThrow("Unauthorized");
    expect(expireCurrentAuthSession).toHaveBeenCalledTimes(2);

    vi.doUnmock("axios");
    vi.doUnmock("./authSession");
    vi.resetModules();
  });

  test("preserves the local session when refresh fails with network or 5xx errors", async () => {
    const expireCurrentAuthSession = vi.fn();
    vi.doMock("./authSession", () => ({
      requestRefreshSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockRejectedValueOnce({ response: { status: 503 } }),
      applyRefreshedAuthSession: vi.fn(),
      expireCurrentAuthSession,
    }));

    const { requestInterceptor, responseRejected, tokenStore } =
      await importInterceptorHarness({
        requestRefreshSession: vi
          .fn()
          .mockRejectedValueOnce(new Error("network"))
          .mockRejectedValueOnce({ response: { status: 503 } }),
        expireCurrentAuthSession,
      });
    tokenStore.setAccessToken("expired-token");

    const firstConfig = requestInterceptor({
      url: "/secure",
      headers: new AxiosHeaders(),
    });
    const firstError = new Error("Unauthorized");
    firstError.config = firstConfig;
    firstError.response = { status: 401 };

    const secondConfig = requestInterceptor({
      url: "/secure",
      headers: new AxiosHeaders(),
    });
    const secondError = new Error("Unauthorized");
    secondError.config = secondConfig;
    secondError.response = { status: 401 };

    await expect(responseRejected(firstError)).rejects.toThrow("Unauthorized");
    await expect(responseRejected(secondError)).rejects.toThrow("Unauthorized");
    expect(tokenStore.getAccessToken()).toBe("expired-token");
    expect(expireCurrentAuthSession).not.toHaveBeenCalled();

    vi.doUnmock("axios");
    vi.doUnmock("./authSession");
    vi.resetModules();
  });
});
