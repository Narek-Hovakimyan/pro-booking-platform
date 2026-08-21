import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  state: { type: String, enum: ["active", "deleting", "deleted"], default: "active", index: true },
  deletionId: { type: String, default: "", select: false },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  lastMutationAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("AccountDeletionRecord", schema);
