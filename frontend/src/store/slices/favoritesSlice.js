import { createSlice } from "@reduxjs/toolkit";

const getUserId = (user) => user?.id || user?._id;

const normalizeFavorite = (favorite) => ({
  ...favorite,
  id: favorite.id || favorite._id,
  type: "barber",
  clientId: getUserId(favorite.clientId) || favorite.clientId,
  barber: typeof favorite.barberId === "object" ? {
    ...favorite.barberId,
    id: getUserId(favorite.barberId),
  } : favorite.barber,
  barberId: getUserId(favorite.barberId) || favorite.barberId,
});

const normalizeSalonFavorite = (favorite) => ({
  ...favorite,
  id: favorite.id || favorite._id,
  type: "salon",
  clientId: getUserId(favorite.clientId) || favorite.clientId,
  salon: typeof favorite.salonId === "object"
    ? {
        ...favorite.salonId,
        id: favorite.salonId.id || favorite.salonId._id,
      }
    : favorite.salon,
  salonId:
    (typeof favorite.salonId === "object"
      ? favorite.salonId.id || favorite.salonId._id
      : favorite.salonId) || favorite.salon?.id || favorite.salon?._id,
});

const favoritesSlice = createSlice({
  name: "favorites",
  initialState: [],
  reducers: {
    setFavorites: (state, action) => [
      ...state.filter((favorite) => favorite.type === "salon"),
      ...action.payload.map(normalizeFavorite),
    ],
    setSalonFavorites: (state, action) => [
      ...state.filter((favorite) => favorite.type !== "salon"),
      ...action.payload.map(normalizeSalonFavorite),
    ],
    addFavorite: (state, action) => {
      const favorite = normalizeFavorite(action.payload);
      const existingIndex = state.findIndex(
        (item) =>
          String(item.clientId) === String(favorite.clientId) &&
          String(item.barberId) === String(favorite.barberId)
      );

      if (existingIndex >= 0) {
        state[existingIndex] = favorite;
        return;
      }

      state.push(favorite);
    },
    addSalonFavorite: (state, action) => {
      const favorite = normalizeSalonFavorite(action.payload);
      const existingIndex = state.findIndex(
        (item) =>
          item.type === "salon" &&
          String(item.clientId) === String(favorite.clientId) &&
          String(item.salonId) === String(favorite.salonId)
      );

      if (existingIndex >= 0) {
        state[existingIndex] = favorite;
        return;
      }

      state.push(favorite);
    },
    removeFavorite: (state, action) =>
      state.filter(
        (favorite) =>
          !(
            favorite.type !== "salon" &&
            String(favorite.clientId) === String(action.payload.clientId) &&
            String(favorite.barberId) === String(action.payload.barberId)
          )
      ),
    removeSalonFavorite: (state, action) =>
      state.filter(
        (favorite) =>
          !(
            favorite.type === "salon" &&
            String(favorite.clientId) === String(action.payload.clientId) &&
            String(favorite.salonId) === String(action.payload.salonId)
          )
      ),
    toggleFavorite: (state, action) => {
      const { clientId, barberId } = action.payload;
      const existingIndex = state.findIndex(
        (favorite) =>
          String(favorite.clientId) === String(clientId) &&
          String(favorite.barberId) === String(barberId)
      );

      if (existingIndex >= 0) {
        state.splice(existingIndex, 1);
        return;
      }

      state.push({
        id: Date.now(),
        clientId,
        barberId,
        createdAt: new Date().toISOString(),
      });
    },
  },
});

export const {
  addFavorite,
  addSalonFavorite,
  removeFavorite,
  removeSalonFavorite,
  setFavorites,
  setSalonFavorites,
  toggleFavorite,
} = favoritesSlice.actions;
export default favoritesSlice.reducer;
