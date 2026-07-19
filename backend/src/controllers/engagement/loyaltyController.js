import LoyaltyProgram from "../../models/LoyaltyProgram.js";
import LoyaltyProgress from "../../models/LoyaltyProgress.js";
import { sendControllerError } from "../../utils/controllerError.js";

// ── Barber: get my programs ──
export const getMyPrograms = async (req, res) => {
  try {
    const programs = await LoyaltyProgram.find({
      ownerType: "barber",
      ownerId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.json(programs);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch loyalty programs");
  }
};

// ── Barber: create program ──
export const createProgram = async (req, res) => {
  try {
    const { title, requiredVisits, rewardText } = req.body;

    if (!title || !requiredVisits || !rewardText) {
      return res
        .status(400)
        .json({ message: "title, requiredVisits, and rewardText are required" });
    }

    if (typeof requiredVisits !== "number" || requiredVisits < 1 || requiredVisits > 100) {
      return res
        .status(400)
        .json({ message: "requiredVisits must be between 1 and 100" });
    }

    if (title.length > 120) {
      return res
        .status(400)
        .json({ message: "title must be 120 characters or less" });
    }

    if (rewardText.length > 300) {
      return res
        .status(400)
        .json({ message: "rewardText must be 300 characters or less" });
    }

    const program = await LoyaltyProgram.create({
      ownerType: "barber",
      ownerId: req.user._id,
      title: title.trim(),
      requiredVisits,
      rewardText: rewardText.trim(),
    });

    return res.status(201).json(program);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not create loyalty program",
    });
  }
};

// ── Barber: update own program ──
export const updateProgram = async (req, res) => {
  try {
    const program = await LoyaltyProgram.findById(req.params.id);

    if (!program) {
      return res.status(404).json({ message: "Loyalty program not found" });
    }

    if (String(program.ownerId) !== String(req.user._id)) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this program" });
    }

    const allowedFields = ["title", "requiredVisits", "rewardText", "active"];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.title !== undefined) {
      updates.title = String(updates.title).trim();
      if (updates.title.length > 120) {
        return res
          .status(400)
          .json({ message: "title must be 120 characters or less" });
      }
    }

    if (updates.requiredVisits !== undefined) {
      if (
        typeof updates.requiredVisits !== "number" ||
        updates.requiredVisits < 1 ||
        updates.requiredVisits > 100
      ) {
        return res
          .status(400)
          .json({ message: "requiredVisits must be between 1 and 100" });
      }
    }

    if (updates.rewardText !== undefined) {
      updates.rewardText = String(updates.rewardText).trim();
      if (updates.rewardText.length > 300) {
        return res
          .status(400)
          .json({ message: "rewardText must be 300 characters or less" });
      }
    }

    const updated = await LoyaltyProgram.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );

    return res.json(updated);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update loyalty program",
    });
  }
};

// ── Barber: soft-delete (deactivate) own program ──
export const deactivateProgram = async (req, res) => {
  try {
    const program = await LoyaltyProgram.findById(req.params.id);

    if (!program) {
      return res.status(404).json({ message: "Loyalty program not found" });
    }

    if (String(program.ownerId) !== String(req.user._id)) {
      return res
        .status(403)
        .json({ message: "Not authorized to deactivate this program" });
    }

    program.active = false;
    await program.save();

    return res.json(program);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not deactivate loyalty program",
    });
  }
};

// ── Client: get my progress ──
export const getMyProgress = async (req, res) => {
  try {
    const progress = await LoyaltyProgress.find({
      clientId: req.user._id,
    })
      .populate({
        path: "programId",
        select: "title requiredVisits rewardText active ownerType ownerId",
      })
      .sort({ updatedAt: -1 });

    // Only return progress for active programs the client has punches with
    const activeProgress = progress.filter(
      (p) => p.programId && p.programId.active === true
    );

    return res.json(activeProgress);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch loyalty progress");
  }
};
