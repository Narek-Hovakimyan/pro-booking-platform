import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  getClientFavorites,
  getFavoriteSalons,
} from "./favoriteController.js";
import Favorite from "../models/Favorite.js";
import SalonFavorite from "../models/SalonFavorite.js";
import SalonReview from "../models/SalonReview.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";

const originalMethods = {
  favoriteFind: Favorite.find,
  salonFavoriteFind: SalonFavorite.find,
  salonReviewAggregate: SalonReview.aggregate,
  salonReviewFind: SalonReview.find,
  subscriptionFind: Subscription.find,
  seatFind: SubscriptionSeat.find,
  userFind: User.find,
};

afterEach(() => {
  Favorite.find = originalMethods.favoriteFind;
  SalonFavorite.find = originalMethods.salonFavoriteFind;
  SalonReview.aggregate = originalMethods.salonReviewAggregate;
  SalonReview.find = originalMethods.salonReviewFind;
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
    "name role city salonName imageUrl profession barberType specialty"
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

test("getFavoriteSalons hides unpaid barbers from salon barbers list", async () => {
  const clientId = "client-e";
  const salonAId = "salon-A";
  const paidBarberId = "barber-paid2";
  const unpaidBarberId = "barber-unpaid2";
  let subscriptionQuery = null;

  SalonFavorite.find = () => ({
    populate() {
      return this;
    },
    async sort() {
      return [
        {
          _id: "fav-salon-1",
          clientId,
          salonId: {
            _id: salonAId,
            name: "Salon A",
            city: "",
            address: "",
            phone: "",
            imageUrl: "",
            ownerId: "owner-private",
            admins: ["admin-private"],
          },
          toObject() {
            return {
              _id: "fav-salon-1",
              clientId,
              salonId: {
                _id: salonAId,
                name: "Salon A",
                city: "",
                address: "",
                phone: "",
                imageUrl: "",
                ownerId: "owner-private",
                admins: ["admin-private"],
              },
            };
          },
        },
      ];
    },
  });

  User.find = (query) => {
    if (query.role === "barber") {
      // Return mock method chain for select()
      const result = [
        {
          _id: paidBarberId,
          name: "Paid Barber",
          role: "barber",
          email: "paid@example.com",
          phone: "555-private",
          platformRole: "superuser",
          city: "",
          avatarUrl: "",
          salon: salonAId,
          salonStatus: "approved",
          salons: [
            {
              salon: salonAId,
              status: "approved",
              relationshipType: "chair_renter",
              staffPayment: { type: "fixed", fixedAmount: 1000 },
            },
          ],
          toObject() {
            return this;
          },
        },
        {
          _id: unpaidBarberId,
          name: "Unpaid Barber",
          role: "barber",
          city: "",
          avatarUrl: "",
          salon: salonAId,
          salonStatus: "approved",
          salons: [{ salon: salonAId, status: "approved" }],
          toObject() {
            return this;
          },
        },
      ];

      return {
        select() {
          return {
            then(resolve) {
              resolve(result);
            },
          };
        },
      };
    }

    return {
      select() {
        return this;
      },
      async lean() {
        return [];
      },
    };
  };

  // Mock getPaidAccessByBarberIds via Subscription.find
  Subscription.find = (query) => {
    subscriptionQuery = query;
    return {
      select() {
        return this;
      },
      async lean() {
        // Only paidBarberId has active subscription
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

  // Mock getSalonReviewStats internal calls
  SalonReview.aggregate = () =>
    Promise.resolve([]);
  SalonReview.find = () => {
    // The populate chain final sort() result must be thenable for Promise.all
    const thenable = Promise.resolve([]);
    return {
      populate() {
        return {
          sort() {
            return thenable;
          },
        };
      },
      sort() {
        return thenable;
      },
    };
  };

  const res = createResponse();
  await getFavoriteSalons({ user: { id: clientId, role: "client" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1, "should return one salon favorite");
  assert.equal(res.body[0].salonId.ownerId, undefined);
  assert.equal(res.body[0].salonId.admins, undefined);
  assert.equal(res.body[0].salonId.barbers.length, 1, "should exclude unpaid barber");
  assert.equal(
    String(res.body[0].salonId.barbers[0]._id),
    paidBarberId,
    "only paid barber should be included"
  );
  assert.equal(
    res.body[0].salonId.barbers[0].name,
    "Paid Barber",
    "paid barber name should match"
  );
  assert.equal(res.body[0].salonId.barbers[0].email, undefined);
  assert.equal(res.body[0].salonId.barbers[0].phone, undefined);
  assert.equal(res.body[0].salonId.barbers[0].platformRole, undefined);
  assert.equal(res.body[0].salonId.barbers[0].salons, undefined);
  assert.equal(res.body[0].salonId.barbers[0].staffPayment, undefined);
});
