import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ChatHeader from "./ChatHeader";

describe("ChatHeader", () => {
  it("renders barber as Specialist", () => {
    render(
      <ChatHeader
        selectedUser={{ name: "Alex", role: "barber", avatarUrl: "" }}
        onBackToList={vi.fn()}
      />,
    );

    expect(screen.getByText("Specialist")).toBeInTheDocument();
    expect(screen.queryByText("barber")).not.toBeInTheDocument();
  });

  it("renders client as Client", () => {
    render(
      <ChatHeader
        selectedUser={{ name: "Mia", role: "client", avatarUrl: "" }}
        onBackToList={vi.fn()}
      />,
    );

    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.queryByText("client")).not.toBeInTheDocument();
  });

  it("falls back to phone when role is missing", () => {
    render(
      <ChatHeader
        selectedUser={{ name: "Noah", phone: "+374 55 123456", avatarUrl: "" }}
        onBackToList={vi.fn()}
      />,
    );

    expect(screen.getByText("+374 55 123456")).toBeInTheDocument();
  });

  it("shows no misleading role text when role and phone are missing", () => {
    render(
      <ChatHeader
        selectedUser={{ name: "Lina", avatarUrl: "" }}
        onBackToList={vi.fn()}
      />,
    );

    expect(screen.queryByText("Specialist")).not.toBeInTheDocument();
    expect(screen.queryByText("Client")).not.toBeInTheDocument();
    expect(screen.queryByText("barber")).not.toBeInTheDocument();
    expect(screen.queryByText("client")).not.toBeInTheDocument();
  });

  it("keeps the back button callback functional", async () => {
    const user = userEvent.setup();
    const onBackToList = vi.fn();

    render(
      <ChatHeader
        selectedUser={{ name: "Zoe", role: "barber", avatarUrl: "" }}
        onBackToList={onBackToList}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(onBackToList).toHaveBeenCalledOnce();
  });
});
