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
      default: '',
    },
    type: {
      type: String,
      default: 'text', // 'text', 'system', 'file', 'audio'
    },
    audioData: {
      type: String,
      default: null,
    },
    audioDuration: {
      type: Number,
      default: 0,
    },
    listened: {
      type: Boolean,
      default: false,
    },
    listenedAt: {
      type: Date,
      default: null,
    },
    clientMsgId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
      default: null,
    },
    replyTo: {
      sender: { type: String, default: null },
      text: { type: String, default: null },
      msgId: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Message', messageSchema);
