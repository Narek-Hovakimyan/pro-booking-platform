import Service, { SERVICE_CATEGORIES } from "../models/Service.js";
import { createCrudController } from "./crudController.js";

export const serviceController = createCrudController(Service, "Service");

const isBarber = (user) => user?.role === "barber";

const isBlankNumberInput = (value) =>
  value === null || (typeof value === "string" && !value.trim());

const maxServiceTags = 10;
const maxServiceTagLength = 32;

const sanitizeTags = (tags) => {
  if (tags === undefined) return { value: undefined };
  if (!Array.isArray(tags)) return { error: "Tags must be an array" };

  const nextTags = [];
  const seenTags = new Set();

  for (const tag of tags) {
    if (typeof tag !== "string") {
      return { error: "Tags must be strings" };
    }

    const normalizedTag = tag.trim().toLowerCase();

    if (!normalizedTag) continue;
    if (normalizedTag.length > maxServiceTagLength) {
      return { error: `Tags must be ${maxServiceTagLength} characters or less` };
    }
    if (seenTags.has(normalizedTag)) continue;

    seenTags.add(normalizedTag);
    nextTags.push(normalizedTag);
  }

  if (nextTags.length > maxServiceTags) {
    return { error: `Use ${maxServiceTags} tags or fewer` };
  }

  return { value: nextTags };
};

const validateServicePayload = (body, { partial = false } = {}) => {
  const source = body || {};
  const next = {};

  if (!partial || source.name !== undefined) {
    if (typeof source.name !== "string" || !source.name.trim()) {
      return { error: "Service name is required" };
    }
    next.name = source.name.trim();
  }

  if (!partial || source.price !== undefined) {
    if (isBlankNumberInput(source.price)) {
      return { error: "Price must be a non-negative number" };
    }

    const parsedPrice = Number(source.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return { error: "Price must be a non-negative number" };
    }
    next.price = parsedPrice;
  }

  if (!partial || source.duration !== undefined) {
    if (isBlankNumberInput(source.duration)) {
      return { error: "Duration must be a positive number" };
    }

    const parsedDuration = Number(source.duration);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return { error: "Duration must be a positive number" };
    }
    next.duration = parsedDuration;
  }

  if (source.description !== undefined) {
    next.description = String(source.description || "").trim();
  }

  if (!partial || source.category !== undefined) {
    const category = String(source.category || "other").trim();

    if (!SERVICE_CATEGORIES.includes(category)) {
      return { error: "Invalid service category" };
    }

    next.category = category;
  }

  if (source.tags !== undefined) {
    const { value, error } = sanitizeTags(source.tags);

    if (error) return { error };
    next.tags = value;
  }

  if (source.active !== undefined) {
    if (typeof source.active !== "boolean") {
      return { error: "Active must be a boolean" };
    }
    next.active = source.active;
  }

  return { value: next };
};

export const getServicesByBarber = async (req, res) => {
  try {
    const services = await Service.find({ barberId: req.params.barberId });
    return res.json(services);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch services",
    });
  }
};

export const createService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can create services" });
    }

    if (
      req.body.barberId !== undefined &&
      String(req.body.barberId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Cannot create a service for another barber" });
    }

    const { value, error } = validateServicePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const service = await Service.create({
      ...value,
      barberId: req.user._id,
    });

    return res.status(201).json(service);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not create service",
    });
  }
};

export const updateService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can update services" });
    }

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (String(service.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized to edit this service" });
    }

    const { value, error } = validateServicePayload(req.body, { partial: true });
    if (error) {
      return res.status(400).json({ message: error });
    }

    Object.assign(service, value);

    const updatedService = await service.save();

    return res.json(updatedService);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update service",
    });
  }
};

export const deleteService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can delete services" });
    }

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (String(service.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized to delete this service" });
    }

    await service.deleteOne();

    return res.json({ message: "Service deleted" });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not delete service",
    });
  }
};
