import { afterEach, describe, expect, test, vi } from "vitest";

import usersReducer, { addUser, setBarbers, updateBarberProfile } from "./usersSlice";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usersSlice", () => {
  test("addUser ignores caller passwords and stores profile fields", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const state = usersReducer(
      undefined,
      addUser({
        name: "Client One",
        phone: "555",
        password: "plain-password",
        role: "client",
      })
    );

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      id: 123,
      name: "Client One",
      phone: "555",
      role: "client",
      bio: "",
      city: "",
      address: "",
      instagram: "",
      imageUrl: "",
      galleryImages: [],
      defaultSchedule: {
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: false,
        breakStart: "",
        breakEnd: "",
      },
    });
    expect(state[0]).not.toHaveProperty("password");
    expect(JSON.stringify(state)).not.toContain("plain-password");
  });

  test("setBarbers and profile updates preserve non-password behavior", () => {
    const withBarbers = usersReducer(
      [{ id: "client-1", role: "client", name: "Client" }],
      setBarbers([{ _id: "barber-1", role: "barber", name: "Barber" }])
    );

    expect(withBarbers).toEqual([
      { id: "client-1", role: "client", name: "Client" },
      { _id: "barber-1", id: "barber-1", role: "barber", name: "Barber" },
    ]);

    const updated = usersReducer(
      withBarbers,
      updateBarberProfile({
        barberId: "barber-1",
        profile: {
          name: "Updated Barber",
          phone: "123",
          bio: "Bio",
          city: "Yerevan",
          address: "Main",
          instagram: "@barber",
          imageUrl: "/image.jpg",
          avatarUrl: "/avatar.jpg",
          salon: "Salon",
          salonStatus: "approved",
          workHistory: ["Salon"],
          galleryImages: ["/gallery.jpg"],
          defaultSchedule: { startTime: "10:00" },
        },
      })
    );

    expect(updated.find((user) => user.id === "barber-1")).toMatchObject({
      name: "Updated Barber",
      phone: "123",
      bio: "Bio",
      city: "Yerevan",
      address: "Main",
      instagram: "@barber",
      imageUrl: "/image.jpg",
      avatarUrl: "/avatar.jpg",
      salon: "Salon",
      salonStatus: "approved",
      workHistory: ["Salon"],
      galleryImages: ["/gallery.jpg"],
      defaultSchedule: { startTime: "10:00" },
    });
  });
});
