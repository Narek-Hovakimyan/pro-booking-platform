import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicSalonResponse } from "./salonUtils.js";

const createSalon = (overrides = {}) => ({
  _id: "salon-1",
  name: "Downtown Salon",
  city: "Yerevan",
  ...overrides,
});

const createBarber = (overrides = {}) => ({
  _id: "barber-1",
  name: "Barber",
  city: "Gyumri",
  avatarUrl: "https://example.com/avatar.jpg",
  workHistory: [{ salonName: "Private" }],
  salons: [{ salon: "salon-1", status: "approved", isPrimary: true }],
  toObject() {
    return {
      _id: this._id,
      name: this.name,
      city: this.city,
      avatarUrl: this.avatarUrl,
      workHistory: this.workHistory,
      salons: this.salons,
      ...overrides,
    };
  },
  ...overrides,
});

test("formats public salon response with review stats", () => {
  const salon = createSalon();
  const response = buildPublicSalonResponse({
    salon,
    reviewStats: {
      averageRating: 4.5,
      totalReviews: 7,
      reviewsCount: 6,
      latestReviews: [{ _id: "review-1" }],
    },
    barbers: [],
    profiles: [],
  });

  assert.equal(response._id, "salon-1");
  assert.equal(response.id, "salon-1");
  assert.equal(response.averageRating, 4.5);
  assert.equal(response.totalReviews, 7);
  assert.equal(response.reviewsCount, 6);
  assert.deepEqual(response.latestReviews, [{ _id: "review-1" }]);
  assert.deepEqual(response.barbers, []);
});

test("applies fallback review stats in public salon response", () => {
  const response = buildPublicSalonResponse({
    salon: createSalon(),
    reviewStats: null,
    barbers: [],
    profiles: [],
  });

  assert.equal(response.averageRating, 0);
  assert.equal(response.totalReviews, 0);
  assert.equal(response.reviewsCount, 0);
  assert.deepEqual(response.latestReviews, []);
});

test("falls back from totalReviews to reviewsCount in public salon response", () => {
  const response = buildPublicSalonResponse({
    salon: createSalon(),
    reviewStats: {
      averageRating: 4,
      reviewsCount: 3,
      latestReviews: [],
    },
    barbers: [],
    profiles: [],
  });

  assert.equal(response.totalReviews, 3);
  assert.equal(response.reviewsCount, 3);
});

test("includes public barber formatting in public salon response", () => {
  const salon = createSalon();
  const barber = createBarber();
  const response = buildPublicSalonResponse({
    salon,
    reviewStats: null,
    barbers: [barber],
    profiles: [
      {
        barberId: "barber-1",
        city: "Vanadzor",
        imageUrl: "https://example.com/profile.jpg",
        bio: "Sharp cuts",
        galleryImages: ["one.jpg"],
        defaultSchedule: { startTime: "10:00" },
      },
    ],
  });

  assert.equal(response.barbers.length, 1);
  assert.equal(response.barbers[0].id, "barber-1");
  assert.equal(response.barbers[0].city, "Vanadzor");
  assert.equal(response.barbers[0].imageUrl, "https://example.com/profile.jpg");
  assert.equal(response.barbers[0].bio, "Sharp cuts");
  assert.deepEqual(response.barbers[0].galleryImages, ["one.jpg"]);
  assert.deepEqual(response.barbers[0].defaultSchedule, { startTime: "10:00" });
  assert.deepEqual(response.barbers[0].salon, {
    _id: "salon-1",
    name: "Downtown Salon",
    city: "Yerevan",
    id: "salon-1",
  });
  assert.equal(Object.hasOwn(response.barbers[0], "workHistory"), false);
});

test("strips staff payment from public barber membership data", () => {
  const salon = createSalon();
  const barber = createBarber({
    salons: [
      {
        salon: "salon-1",
        status: "approved",
        isPrimary: true,
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 70,
          commissionSalonPercent: 30,
        },
      },
    ],
  });
  const response = buildPublicSalonResponse({
    salon,
    reviewStats: null,
    barbers: [barber],
    profiles: [],
  });

  assert.equal(response.barbers[0].salons[0].staffPayment, undefined);
  assert.equal(response.barbers[0].approvedSalons[0].staffPayment, undefined);
});
