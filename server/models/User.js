const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, minlength: 8, select: false },
    workspaceName: { type: String, trim: true, maxlength: 80, default: 'My Workspace' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    preferences: {
      defaultHttpTimeoutMs: { type: Number, min: 100, max: 30000, default: 10000 },
      defaultRetries: { type: Number, min: 0, max: 3, default: 0 },
      emailOnFailure: { type: Boolean, default: false },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    workspaceName: this.workspaceName,
    theme: this.theme,
    preferences: this.preferences,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
