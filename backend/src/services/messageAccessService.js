import Booking from "../models/Booking.js";
import Message from "../models/Message.js";
import { barberHasPaidAccess } from "./subscriptionService.js";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

let hasPublicBarberVisibility = barberHasPaidAccess;
let hasBookingRelationship = async ({ barberId, clientId }) =>
  Boolean(await Booking.exists({ barberId, clientId }));
let hasClientStartedConversation = async ({ barberId, clientId }) =>
  Boolean(await Message.exists({ senderId: clientId, receiverId: barberId }));

export const __messageAccessTestHooks = {
  reset() {
    hasPublicBarberVisibility = barberHasPaidAccess;
    hasBookingRelationship = async ({ barberId, clientId }) =>
      Boolean(await Booking.exists({ barberId, clientId }));
    hasClientStartedConversation = async ({ barberId, clientId }) =>
      Boolean(await Message.exists({ senderId: clientId, receiverId: barberId }));
  },
  setHasPublicBarberVisibility(fn) {
    hasPublicBarberVisibility = fn;
  },
  setHasBookingRelationship(fn) {
    hasBookingRelationship = fn;
  },
  setHasClientStartedConversation(fn) {
    hasClientStartedConversation = fn;
  },
};

export const getMessageAccessDecision = async ({ sender, receiver }) => {
  const senderId = getIdString(sender);
  const receiverId = getIdString(receiver);

  if (!senderId || !receiverId || senderId === receiverId) {
    return { allowed: false };
  }

  if (sender?.role === "client" && receiver?.role === "barber") {
    if (await hasBookingRelationship({ barberId: receiverId, clientId: senderId })) {
      return { allowed: true };
    }

    return {
      allowed: await hasPublicBarberVisibility(receiverId),
    };
  }

  if (sender?.role === "barber" && receiver?.role === "client") {
    if (await hasBookingRelationship({ barberId: senderId, clientId: receiverId })) {
      return { allowed: true };
    }

    return {
      allowed: await hasClientStartedConversation({
        barberId: senderId,
        clientId: receiverId,
      }),
    };
  }

  return { allowed: false };
};
