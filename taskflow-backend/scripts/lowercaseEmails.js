require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find();
  let changed = 0;

  for (const user of users) {
    const lower = user.email.trim().toLowerCase();
    if (lower === user.email) continue;

    // don't create a duplicate if the lowercase email already exists
    const clash = await User.findOne({ email: lower, _id: { $ne: user._id } });
    if (clash) {
      console.log("Skipped (duplicate exists):", user.email);
      continue;
    }

    user.email = lower;
    await user.save(); // the password is untouched, so it isn't re-hashed
    changed++;
  }

  console.log("Emails updated:", changed);
  process.exit(0);
})();