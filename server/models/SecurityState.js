import mongoose from 'mongoose';

const securityStateSchema = new mongoose.Schema(
  {
    roomKey: {
      type: String,
      default: 'main_room',
      unique: true,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastWipeAt: {
      type: Date,
      default: null,
    },
    wipeCount: {
      type: Number,
      default: 0,
    },
    customPassword: {
      type: String,
      default: 'secret123',
    },
    primaryDeviceId: {
      type: String,
      default: null,
    },
    secondaryDeviceId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('SecurityState', securityStateSchema);
