import api from "./axios";

export const getMySubscription = async () => {
  const { data } = await api.get("/subscriptions/me");
  return data;
};

export const getDefaultSubscriptionPlan = async () => {
  const { data } = await api.get("/subscriptions/plan/default");
  return data;
};

export const getSalonSubscription = async (salonId) => {
  const { data } = await api.get(`/subscriptions/salon/${salonId}`);
  return data;
};

export const getSalonSubscriptionSeats = async (salonId) => {
  const { data } = await api.get(`/subscriptions/salon/${salonId}/seats`);
  return data;
};

export const assignSalonSeat = async (salonId, barberId) => {
  const { data } = await api.post(`/subscriptions/salon/${salonId}/seats`, {
    barberId,
  });
  return data;
};

export const revokeSalonSeat = async (seatId) => {
  const { data } = await api.patch(`/subscriptions/seats/${seatId}/revoke`);
  return data;
};

export const updateSalonSeatCount = async (salonId, seatCount) => {
  const { data } = await api.patch(
    `/subscriptions/salon/${salonId}/seat-count`,
    { seatCount }
  );
  return data;
};

export const createSubscriptionPaymentIntent = async ({
  ownerType,
  ownerId,
  seatCount = 1,
}) => {
  const { data } = await api.post("/subscriptions/payment-intent", {
    ownerType,
    ownerId,
    seatCount,
  });
  return data;
};

export const extendManualSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
  months = 1,
}) => {
  const { data } = await api.post("/subscriptions/dev/extend", {
    ownerType,
    ownerId,
    payerId,
    seatCount,
    months,
  });
  return data;
};
