import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  hasAccess: false,
  individualSubscription: null,
  salonSeatCoverage: null,
  coveredBy: null,
  defaultPlan: null,
  loading: false,
  error: "",
  loaded: false,
};

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState,
  reducers: {
    loadSubscriptionStart: (state) => {
      state.loading = true;
      state.error = "";
    },
    loadSubscriptionSuccess: (state, action) => {
      const payload = action.payload || {};

      state.hasAccess = Boolean(payload.hasAccess);
      state.individualSubscription = payload.individualSubscription || null;
      state.salonSeatCoverage = payload.salonSeatCoverage || null;
      state.coveredBy = payload.coveredBy || null;
      state.defaultPlan = payload.defaultPlan || null;
      state.loading = false;
      state.error = "";
      state.loaded = true;
    },
    loadSubscriptionFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload || "Could not load subscription status.";
      state.loaded = true;
    },
    clearSubscription: () => initialState,
  },
});

export const {
  clearSubscription,
  loadSubscriptionFailure,
  loadSubscriptionStart,
  loadSubscriptionSuccess,
} = subscriptionSlice.actions;

export default subscriptionSlice.reducer;
