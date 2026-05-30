import { sendControllerError } from "../utils/controllerError.js";

const sendCrudError = (res, error, fallbackMessage, resourceName) =>
  sendControllerError(res, error, fallbackMessage, {
    duplicateKeyMessage: `${resourceName} already exists`,
  });

export const createCrudController = (Model, resourceName) => ({
  getAll: async (_req, res) => {
    try {
      const items = await Model.find();
      return res.json(items);
    } catch (error) {
      return sendCrudError(
        res,
        error,
        `Could not fetch ${resourceName}`,
        resourceName
      );
    }
  },

  getById: async (req, res) => {
    try {
      const item = await Model.findById(req.params.id);

      if (!item) {
        return res.status(404).json({ message: `${resourceName} not found` });
      }

      return res.json(item);
    } catch (error) {
      return sendCrudError(
        res,
        error,
        `Could not fetch ${resourceName}`,
        resourceName
      );
    }
  },

  create: async (req, res) => {
    try {
      const item = await Model.create(req.body);
      return res.status(201).json(item);
    } catch (error) {
      return sendCrudError(
        res,
        error,
        `Could not create ${resourceName}`,
        resourceName
      );
    }
  },

  update: async (req, res) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: "after",
        runValidators: true,
      });

      if (!item) {
        return res.status(404).json({ message: `${resourceName} not found` });
      }

      return res.json(item);
    } catch (error) {
      return sendCrudError(
        res,
        error,
        `Could not update ${resourceName}`,
        resourceName
      );
    }
  },

  remove: async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);

      if (!item) {
        return res.status(404).json({ message: `${resourceName} not found` });
      }

      return res.json({ message: `${resourceName} deleted` });
    } catch (error) {
      return sendCrudError(
        res,
        error,
        `Could not delete ${resourceName}`,
        resourceName
      );
    }
  },
});
