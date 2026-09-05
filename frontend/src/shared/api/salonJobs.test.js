import { describe, expect, it, vi } from "vitest";

import api from "./axios";
import { confirmJobOnboarding } from "./salonJobs";

vi.mock("./axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

describe("confirmJobOnboarding", () => {
  it("POSTs the encoded application ID without a request body", () => {
    const applicationId = "application/a?source=job#offer";

    confirmJobOnboarding(applicationId);

    expect(api.post).toHaveBeenCalledWith(
      "/salon-jobs/applications/application%2Fa%3Fsource%3Djob%23offer/onboarding/confirm"
    );
    expect(api.post.mock.calls[0]).toHaveLength(1);
  });
});
