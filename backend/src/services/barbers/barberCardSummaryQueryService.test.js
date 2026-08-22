import assert from "node:assert/strict";
import test from "node:test";

import {
  getPaginatedBarberCardSummary,
  isPaginatedCardSummaryRequest,
  parseCardSummaryDirectoryQuery,
} from "./barberCardSummaryQueryService.js";

const barberA = { _id: "64b000000000000000000101", name: "A", role: "barber", password: "private", _eligibleSalonIds: ["hidden"] };
const barberB = { _id: "64b000000000000000000102", name: "B", role: "barber", password: "private", _eligibleSalonIds: ["hidden"] };

const dependencies = (calls) => ({
  findDirectory: async (options) => {
    calls.options = options;
    return [barberA, barberB];
  },
  getReadiness: async (ids) => {
    calls.readinessIds = ids;
    return new Map(ids.map((id) => [String(id), { publicReady: true, independentReady: false, eligibleSalonIds: new Set() }]));
  },
  getScheduleMaps: async () => new Map(),
  models: {
    BarberProfile: { find(query) { calls.profileQuery = query; return []; } },
    Salon: { find(query) { calls.salonQuery = query; return []; } },
    Service: { find(query) { calls.serviceQuery = query; return { populate: () => ({ lean: async () => [{ _id: "service", barberId: barberA._id, name: "Cut", active: true, price: 10 }] }) }; } },
    Review: { find(query) { calls.reviewQuery = query; return []; } },
    Booking: { find(query) { calls.bookingQuery = query; return []; } },
  },
});

test("paginated card summary forwards directory filters and enriches only selected IDs", async () => {
  const calls = {};
  const result = await getPaginatedBarberCardSummary({
    query: { page: "2", limit: "2", barberIds: `${barberA._id},${barberB._id}`, name: "A", city: "Yerevan", profession: "barber", barberType: "unisex", serviceName: "Cut", category: "other", serviceSearch: "cut", minPrice: "10", maxPrice: "20", discountOnly: "true", rating: "4" },
    user: { _id: "64b000000000000000000099" },
    dependencies: dependencies(calls),
  });

  assert.equal(calls.options.skip, 2);
  assert.equal(calls.options.limit, 2);
  assert.equal(String(calls.options.favoriteClientId), "64b000000000000000000099");
  assert.deepEqual(calls.options.barberIds, [barberA._id, barberB._id]);
  assert.equal(calls.options.discountOnly, true);
  for (const query of [calls.profileQuery, calls.serviceQuery, calls.reviewQuery, calls.bookingQuery]) {
    assert.deepEqual(query.barberId.$in, [barberA._id, barberB._id]);
  }
  assert.equal(result.barbers.some((barber) => "password" in barber || "_eligibleSalonIds" in barber), false);
  assert.deepEqual(result.reviewStats.map((stat) => stat.barberId), [barberA._id, barberB._id]);
});

test("card summary directory parser keeps anonymous requests unranked and rejects malformed pagination", () => {
  assert.equal(isPaginatedCardSummaryRequest({}), false);
  assert.equal(isPaginatedCardSummaryRequest({ page: "1" }), true);
  assert.equal(isPaginatedCardSummaryRequest({ barberIds: "" }), true);
  assert.equal(parseCardSummaryDirectoryQuery({ page: "1", limit: "2" }).favoriteClientId, undefined);
  assert.throws(() => parseCardSummaryDirectoryQuery({ page: "zero" }), /Invalid page/);
  assert.throws(() => parseCardSummaryDirectoryQuery({ category: "invalid", page: "1" }), /Invalid service category/);
});
