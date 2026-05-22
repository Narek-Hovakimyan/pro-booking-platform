import mongoose from "mongoose";

const salonFavoriteSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: true,
    },
  },
  { timestamps: true }
);

salonFavoriteSchema.index({ clientId: 1, salonId: 1 }, { unique: true });

const SalonFavorite = mongoose.model("SalonFavorite", salonFavoriteSchema);

export default SalonFavorite;
