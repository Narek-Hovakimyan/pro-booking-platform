import {
  getBarberLoyaltyDiscountSettings,
  getBarberClients,
  updateBarberLoyaltyDiscountSettings,
  updateBarberClientLoyalty,
} from "../../services/barberClientService.js";

export const getMyBarberClients = async (req, res) => {
  try {
    const clients = await getBarberClients({ requester: req.user });
    return res.json(clients);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message =
      statusCode === 500
        ? "Could not fetch barber clients"
        : error?.message || "Could not fetch barber clients";

    return res.status(statusCode).json({ message });
  }
};

export const updateMyBarberClientLoyalty = async (req, res) => {
  try {
    const loyalty = await updateBarberClientLoyalty({
      requester: req.user,
      clientId: req.params.clientId,
      updates: req.body || {},
    });
    return res.json({ loyalty });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message =
      statusCode === 500
        ? "Could not update client loyalty"
        : error?.message || "Could not update client loyalty";

    return res.status(statusCode).json({ message });
  }
};

export const getMyLoyaltyDiscountSettings = async (req, res) => {
  try {
    const settings = await getBarberLoyaltyDiscountSettings({
      requester: req.user,
    });
    return res.json(settings);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message =
      statusCode === 500
        ? "Could not fetch loyalty discount settings"
        : error?.message || "Could not fetch loyalty discount settings";

    return res.status(statusCode).json({ message });
  }
};

export const updateMyLoyaltyDiscountSettings = async (req, res) => {
  try {
    const settings = await updateBarberLoyaltyDiscountSettings({
      requester: req.user,
      updates: req.body || {},
    });
    return res.json(settings);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message =
      statusCode === 500
        ? "Could not update loyalty discount settings"
        : error?.message || "Could not update loyalty discount settings";

    return res.status(statusCode).json({ message });
  }
};
