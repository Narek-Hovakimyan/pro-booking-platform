import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
    console.error("MongoDB connection failed: set MONGO_URI in .env");
    process.exit(1);
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    console.error(
      'MongoDB connection failed: MONGO_URI must start with "mongodb://" or "mongodb+srv://"'
    );
    process.exit(1);
  }

  try {
    const connection = await mongoose.connect(mongoUri);
    console.log(
      `MongoDB connected: ${connection.connection.host}/${connection.connection.name}`
    );
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;
