import { model, Schema, type Types } from 'mongoose';

export interface SessionDoc {
  _id: string;
  userId: Types.ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionDoc>({
  // SHA-256 hex of the 32-byte random cookie value, so a read of this collection cannot replay a cookie.
  _id: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  createdAt: { type: Date, required: true },
  // TTL index with no delay: the database purges a session at its expiry time (DEC-050).
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const Session = model<SessionDoc>('Session', sessionSchema);
