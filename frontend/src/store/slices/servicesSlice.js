import { createSlice } from "@reduxjs/toolkit";

const servicesSlice = createSlice({
  name: "services",
  initialState: [],
  reducers: {
    setServices: (state, action) => {
      const services = Array.isArray(action.payload)
        ? action.payload
        : action.payload.services;
      const scopedBarberId = Array.isArray(action.payload)
        ? null
        : action.payload.barberId;
      const incomingServices = services.map((service) => ({
        ...service,
        id: service.id || service._id,
      }));
      const barberIds = new Set(
        incomingServices.map((service) => String(service.barberId))
      );
      const shouldRemoveService = (service) =>
        scopedBarberId
          ? String(service.barberId) === String(scopedBarberId)
          : barberIds.has(String(service.barberId));
      const otherServices = state.filter(
        (service) => !shouldRemoveService(service)
      );

      return [...otherServices, ...incomingServices];
    },
    addService: (state, action) => {
      state.push({
        ...action.payload,
        id: action.payload.id || action.payload._id,
      });
    },
    updateService: (state, action) => {
      const updatedService = {
        ...action.payload,
        id: action.payload.id || action.payload._id,
      };
      const index = state.findIndex(
        (service) => String(service.id) === String(updatedService.id)
      );

      if (index >= 0) {
        state[index] = updatedService;
      }
    },
    removeService: (state, action) =>
      state.filter((service) => {
        const serviceId =
          typeof action.payload === "object"
            ? action.payload.serviceId
            : action.payload;

        return String(service.id) !== String(serviceId);
      }),
    toggleService: (state, action) => {
      const service = state.find((item) => item.id === action.payload);

      if (service) {
        service.active = !service.active;
      }
    },
  },
});

export const {
  addService,
  removeService,
  setServices,
  toggleService,
  updateService,
} = servicesSlice.actions;
export default servicesSlice.reducer;
