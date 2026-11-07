import { model, Schema } from 'mongoose';

export interface UserDoc {
  username: string;
  passwordHash: string;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>({
  // Stored lower-cased (DEC-053); the unique index is the only duplicate guard.
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, required: true },
});

export const User = model<UserDoc>('User', userSchema);
