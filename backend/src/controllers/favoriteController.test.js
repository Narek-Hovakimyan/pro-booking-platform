import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getClientFavorites } from "./favoriteController.js";
import Favorite from "../models/Favorite.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";

const originalMethods = {
  favoriteFind: Favorite.find,
  subscriptionFind: Subscription.find,
  seatFind: SubscriptionSeat.find,
  userFind: User.find,
};

afterEach(() => {
  Favorite.find = originalMethods.favoriteFind;
  Subscription.find = originalMethods.subscriptionFind;
  SubscriptionSeat.find = originalMethods.seatFind;
  User.find = originalMethods.userFind;
});

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test("getClientFavorites populates favorite barber profession fields", async () => {
  const clientId = "client-a";
  const favorite = {
    _id: "favorite-a",
    clientId,
    barberId: {
      _id: "barber-a",
      name: "Lash Artist",
      phone: "555",
      role: "barber",
      city: "Yerevan",
      salonName: "",
      imageUrl: "",
      profession: "lash_brow",
      barberType: "",
      specialty: "unisex",
    },
  };

  Subscription.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [{ ownerId: "barber-a" }];
    },
  });
  SubscriptionSeat.find = () => ({
    populate() {
      return this;
    },
    async lean() {
      return [];
    },
  });
  User.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    },
  });

  let findQuery = null;
  let populatePath = null;
  let populateFields = null;
  let sortQuery = null;
  Favorite.find = (query) => {
    findQuery = query;

    return {
      populate(path, fields) {
        populatePath = path;
        populateFields = fields;
        return this;
      },
      async sort(query) {
        sortQuery = query;
        return [favorite];
      },
    };
  };

  const res = createResponse();

  await getClientFavorites({ user: { id: clientId, role: "client" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(findQuery, { clientId });
  assert.equal(populatePath, "barberId");
  assert.equal(
    populateFields,
    "name phone role city salonName imageUrl profession barberType specialty"
  );
  assert.deepEqual(sortQuery, { createdAt: -1 });
  assert.deepEqual(res.body, [favorite]);
  assert.deepEqual(
    {
      profession: res.body[0].barberId.profession,
      barberType: res.body[0].barberId.barberType,
      specialty: res.body[0].barberId.specialty,
    },
    {
      profession: "lash_brow",
      barberType: "",
      specialty: "unisex",
    }
  );
});

test("getClientFavorites hides unpaid barbers from response", async () => {
  const clientId = "client-b";
  const paidBarberId = "barber-paid";
  const unpaidBarberId = "barber-unpaid";
  let subscriptionQuery = null;

  const paidFavorite = {
    _id: "fav-paid",
    clientId,
    barberId: {
      _id: paidBarberId,
      name: "Paid Barber",
      role: "barber",
      city: "",
      salonName: "",
      imageUrl: "",
      profession: "barber",
      barberType: "",
      specialty: "unisex",
    },
  };
  const unpaidFavorite = {
    _id: "fav-unpaid",
    clientId,
    barberId: {
      _id: unpaidBarberId,
      name: "Unpaid Barber",
      role: "barber",
      city: "",
      salonName: "",
      imageUrl: "",
      profession: "barber",
      barberType: "",
      specialty: "unisex",
    },
  };

  Subscription.find = (query) => {
    subscriptionQuery = query;
    return {
      select() {
        return this;
      },
      async lean() {
        return [{ ownerId: paidBarberId }];
      },
    };
  };
  SubscriptionSeat.find = () => ({
    populate() {
      return this;
    },
    async lean() {
      return [];
    },
  });
  User.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    },
  });

  Favorite.find = () => ({
    populate() {
      return this;
    },
    async sort() {
      return [paidFavorite, unpaidFavorite];
    },
  });

  const res = createResponse();
  await getClientFavorites({ user: { id: clientId, role: "client" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(subscriptionQuery.ownerId, { $in: [paidBarberId, unpaidBarberId] });
  assert.equal(res.body.length, 1, "should only return paid barber");
  assert.equal(res.body[0]._id, "fav-paid");
});

test("getClientFavorites returns empty array when no favorites have paid access", async () => {
  const clientId = "client-c";

  Subscription.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    },
  });
  SubscriptionSeat.find = () => ({
    populate() {
      return this;
    },
    async lean() {
      return [];
    },
  });
  User.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    },
  });

  Favorite.find = () => ({
    populate() {
      return this;
    },
    async sort() {
      return [
        {
          _id: "fav-1",
          clientId,
          barberId: {
            _id: "b1",
            name: "No Access",
            role: "barber",
            city: "",
            salonName: "",
            imageUrl: "",
            profession: "barber",
            barberType: "",
            specialty: "unisex",
          },
        },
      ];
    },
  });

  const res = createResponse();
  await getClientFavorites({ user: { id: clientId, role: "client" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getClientFavorites skips paid access lookup when there are no favorites", async () => {
  const clientId = "client-d";
  let subscriptionLookupCalled = false;

  Subscription.find = () => {
    subscriptionLookupCalled = true;
    return {
      select() {
        return this;
      },
      async lean() {
        return [];
      },
    };
  };
  SubscriptionSeat.find = () => ({
    populate() {
      return this;
    },
    async lean() {
      return [];
    },
  });
  User.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    },
  });

  Favorite.find = () => ({
    populate() {
      return this;
    },
    async sort() {
      return []; // empty favorites
    },
  });

  const res = createResponse();
  await getClientFavorites({ user: { id: clientId, role: "client" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.equal(subscriptionLookupCalled, false);
});
