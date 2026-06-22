import {
  getBarberClients,
  updateBarberClientLoyalty,
} from "../services/barberClientService.js";

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
