import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getClientFavorites } from "./favoriteController.js";
import Favorite from "../models/Favorite.js";

const originalMethods = {
  favoriteFind: Favorite.find,
};

afterEach(() => {
  Favorite.find = originalMethods.favoriteFind;
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
