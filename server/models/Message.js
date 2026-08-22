import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      enum: ['BOT1', 'BOT2', 'SYSTEM'],
    },
    text: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: 'text', // 'text', 'system', 'file'
    },
    clientMsgId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Message', messageSchema);
