import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicBarberDirectoryPipeline,
  findPublicBarberDirectoryPage,
} from "./publicBarberDirectoryQueryService.js";

test("directory page pipeline applies every eligibility lookup before deterministic pagination", () => {
  const pipeline = buildPublicBarberDirectoryPipeline({
    skip: 20,
    limit: 10,
    now: new Date("2026-01-01T00:00:00Z"),
    collections: {
      profiles: "barberprofiles",
      schedules: "schedules",
      services: "services",
      subscriptions: "subscriptions",
      seats: "subscriptionseats",
    },
  });
  const eligibility = pipeline.findIndex((stage) => stage.$match?.$expr?.$and);
  const sort = pipeline.findIndex((stage) => stage.$sort);
  const skip = pipeline.findIndex((stage) => stage.$skip);
  const limit = pipeline.findIndex((stage) => stage.$limit);

  assert.ok(eligibility >= 0);
  assert.ok(eligibility < sort && sort < skip && skip < limit);
  assert.deepEqual(pipeline[sort].$sort, { createdAt: 1, _id: 1 });
  assert.equal(pipeline[skip].$skip, 20);
  assert.equal(pipeline[limit].$limit, 10);
  assert.equal(pipeline.filter((stage) => stage.$lookup).length, 5);
  assert.equal(JSON.stringify(pipeline).includes("$anyElementTrue"), false);
  assert.equal(JSON.stringify(pipeline).includes("$arrayElemAt"), true);
});

test("directory page executes one aggregate query and returns its page unchanged", async () => {
  const rows = [{ _id: "first", _eligibleSalonIds: ["salon-1"] }];
  let calls = 0;
  const result = await findPublicBarberDirectoryPage({
    skip: 0,
    limit: 1,
    UserModel: {
      aggregate(pipeline) {
        calls += 1;
        assert.ok(Array.isArray(pipeline));
        return Promise.resolve(rows);
      },
    },
  });

  assert.equal(calls, 1);
  assert.equal(result, rows);
});

test("candidate, favorite, service, and rating filters remain before pagination", () => {
  const first = "64b000000000000000000001";
  const client = "64b000000000000000000002";
  const pipeline = buildPublicBarberDirectoryPipeline({
    skip: 2, limit: 3, barberIds: [first], favoriteClientId: client,
    name: "A.+", city: "Yerevan", profession: "barber", barberType: "unisex",
    serviceName: "Cut", category: "other", serviceSearch: "[tag]", minPrice: 10, maxPrice: 20,
    discountOnly: true, rating: 4,
  });
  const text = JSON.stringify(pipeline);
  const sort = pipeline.findIndex((stage) => stage.$sort);
  const skip = pipeline.findIndex((stage) => stage.$skip);
  assert.equal(String(pipeline[0].$match._id.$in[0]), first);
  assert.match(pipeline[0].$match.name.$regex, /\\\./);
  const favoriteLookup = pipeline.find((stage) => stage.$lookup?.as === "_favorite");
  assert.equal(String(favoriteLookup.$lookup.pipeline[0].$match.$expr.$and[0].$eq[1]), client);
  assert.ok(text.includes("_serviceFilter0") && text.includes('"_rating"'));
  assert.deepEqual(pipeline[sort].$sort, { _favoriteRank: 1, createdAt: 1, _id: 1 });
  assert.ok(sort < skip && skip < pipeline.findIndex((stage) => stage.$limit));
  assert.ok(JSON.stringify(pipeline.at(-1).$project).includes("_favorite"));
});

test("malformed identifiers fail safely", () => {
  assert.throws(() => buildPublicBarberDirectoryPipeline({ barberIds: ["bad"] }), /barberIds/);
  assert.throws(() => buildPublicBarberDirectoryPipeline({ favoriteClientId: "bad" }), /favoriteClientId/);
});
