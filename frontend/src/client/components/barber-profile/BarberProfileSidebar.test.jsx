import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BarberProfileSidebar from "./BarberProfileSidebar";

function renderSidebar(props = {}) {
  return render(
    <BarberProfileSidebar
      barber={{
        barberType: "men",
        city: "Yerevan",
        instagram: "https://instagram.com/aram.cuts",
        ...props.barber,
      }}
      formatReviewDate={props.formatReviewDate ?? (() => "Aug 3, 2026")}
      reviewStats={
        props.reviewStats ?? {
          average: 4.8,
          count: 2,
          reviews: [
            {
              client: { name: "Mariam" },
              comment: "Excellent work",
              createdAt: "2026-08-01T10:00:00.000Z",
              id: "review-1",
              rating: 5,
            },
          ],
        }
      }
      startingPrice={props.startingPrice}
      totalCerts={props.totalCerts ?? 1}
    />
  );
}

function expectNoUnsafeCurrency(container) {
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

describe("BarberProfileSidebar", () => {
  it("formats numeric and numeric-string starting prices in AMD and preserves quick-info content", () => {
    const numericRender = renderSidebar({ startingPrice: 5000 });

    expect(screen.getByText("From 5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("1 certification")).toBeInTheDocument();
    expect(screen.getByText("Yerevan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@aram.cuts" })).toHaveAttribute(
      "href",
      "https://instagram.com/aram.cuts"
    );
    expect(screen.getByText("Mariam")).toBeInTheDocument();
    expectNoUnsafeCurrency(numericRender.container);

    const stringRender = renderSidebar({ startingPrice: "0" });
    expect(screen.getByText("From 0 AMD")).toBeInTheDocument();
    expectNoUnsafeCurrency(stringRender.container);
  });

  it("omits the starting-price row for missing, empty, invalid, negative, and non-finite values", () => {
    const unusableValues = [null, undefined, "", "oops", -20, Infinity];

    for (const value of unusableValues) {
      const { container, unmount } = renderSidebar({ startingPrice: value });
      expect(screen.queryByText(/From .* AMD/u)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "@aram.cuts" })).toHaveAttribute(
        "href",
        "https://instagram.com/aram.cuts"
      );
      expectNoUnsafeCurrency(container);
      unmount();
    }
  });

  it("keeps the empty review state and hides invalid instagram values", () => {
    renderSidebar({
      barber: { instagram: "https://example.com/not-instagram" },
      reviewStats: { average: 0, count: 0, reviews: [] },
      startingPrice: null,
      totalCerts: 0,
    });

    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    expect(
      screen.getByText("Be the first to book and leave a review.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /@/u })).not.toBeInTheDocument();
  });
});
