import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClientProfilePage from "./ClientProfilePage";
import api from "@/shared/api/axios";

const state = vi.hoisted(() => ({
  auth: {
    currentUser: {
      id: "client-1",
      name: "Current Client",
      city: "Gyumri",
      phone: "111",
      email: "client@example.com",
      emailVerified: true,
      avatarUrl: "/uploads/avatars/current.png",
      role: "client",
    },
  },
}));

const dispatch = vi.hoisted(() => vi.fn());

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
  useSelector: (selector) => selector(state),
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("@/shared/components/AvatarUploadButton", () => ({
  default: ({ label, onUploaded }) => (
    <button
      type="button"
      onClick={() =>
        onUploaded({
          id: "client-1",
          name: "Uploaded Client",
          city: "Yerevan",
          phone: "333",
          email: "uploaded@example.com",
          emailVerified: false,
          avatarUrl: "/uploads/avatars/uploaded.png",
          role: "client",
        })
      }
    >
      {label}
    </button>
  ),
}));

const loadedProfile = {
  id: "client-1",
  name: "Loaded Client",
  city: "Yerevan",
  phone: "222",
  email: "loaded@example.com",
  emailVerified: true,
  avatarUrl: "/uploads/avatars/existing.png",
  role: "client",
};

function mockLoadProfile(profile = loadedProfile) {
  vi.mocked(api.get).mockResolvedValue({ data: profile });
}

function renderPage() {
  return render(<ClientProfilePage />);
}

describe("ClientProfilePage avatar flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.currentUser = {
      id: `client-${Date.now()}`,
      name: "Current Client",
      city: "Gyumri",
      phone: "111",
      email: "client@example.com",
      emailVerified: true,
      avatarUrl: "/uploads/avatars/current.png",
      role: "client",
    };
    mockLoadProfile({ ...loadedProfile, id: state.auth.currentUser.id });
  });

  it("does not render a raw Avatar URL input", async () => {
    renderPage();

    expect(await screen.findByDisplayValue("Loaded Client")).toBeInTheDocument();
    expect(screen.queryByLabelText("Avatar URL")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Avatar URL")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change image" })).toBeInTheDocument();
  });

  it("saves only editable contact fields and keeps the existing avatar preview", async () => {
    const user = userEvent.setup();
    const savedProfile = {
      ...loadedProfile,
      id: state.auth.currentUser.id,
      name: "New Name",
      city: "Vanadzor",
      phone: "555",
      avatarUrl: "/uploads/avatars/existing.png",
    };
    vi.mocked(api.put).mockResolvedValue({ data: savedProfile });

    renderPage();

    await user.clear(await screen.findByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New Name");
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Vanadzor");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "555");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/users/me", {
        name: "New Name",
        city: "Vanadzor",
        phone: "555",
      });
    });
    expect(api.put.mock.calls[0][1]).not.toHaveProperty("avatarUrl");
    expect(api.put.mock.calls[0][1]).not.toHaveProperty("imageUrl");
    expect(screen.getByAltText("New Name")).toHaveAttribute(
      "src",
      "http://localhost:5000/uploads/avatars/existing.png"
    );
  });

  it("updates the preview and profile state after a successful upload", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Change image" }));

    expect(await screen.findByDisplayValue("Uploaded Client")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Yerevan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("333")).toBeInTheDocument();
    expect(screen.getByAltText("Uploaded Client")).toHaveAttribute(
      "src",
      "http://localhost:5000/uploads/avatars/uploaded.png"
    );
    expect(screen.getByText("Profile saved.")).toBeInTheDocument();
  });

  it("keeps email controls independent from profile avatar saving", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockResolvedValue({
      data: {
        ...loadedProfile,
        id: state.auth.currentUser.id,
        email: "fresh@example.com",
        emailVerified: false,
      },
    });

    renderPage();

    await user.clear(await screen.findByLabelText("Email address"));
    await user.type(screen.getByLabelText("Email address"), "fresh@example.com");
    await user.click(screen.getByRole("button", { name: "Save email" }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/users/me", {
        email: "fresh@example.com",
      });
    });
    expect(screen.getByText("Verification email sent. Check your inbox.")).toBeInTheDocument();
  });
});
