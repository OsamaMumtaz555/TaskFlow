require("dotenv").config();
const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");

(async () => {
  await mongoose.connect(process.env.MONGO_URI); // use your actual env variable name
  const admin = await User.findOne({ role: "Admin" });
  if (!admin) {
    console.log("No Admin user found");
    process.exit(1);
  }

  const result = await Task.updateMany(
    { createdBy: { $exists: false } },
    { $set: { createdBy: admin._id } }
  );
  console.log("Migrated tasks:", result.modifiedCount);
  process.exit(0);
})(); 