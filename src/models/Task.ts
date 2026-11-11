import { model, Schema, type Types } from 'mongoose';

export type TaskStatus = 'pending' | 'completed';

export interface TaskDoc {
  ownerId: Types.ObjectId;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  /** Set from the injected clock by the service on every create and change; never read by the API. */
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDoc>(
  {
    // The privacy boundary: set from the session only, and every query filters on it.
    ownerId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['pending', 'completed'], required: true, default: 'pending' },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  // No Mongoose `timestamps`: that reads the system clock, and time is injected (coding-standards backend s10).
);

// Serves the per-user newest-first read (DEC-052).
taskSchema.index({ ownerId: 1, createdAt: -1 });

export const Task = model<TaskDoc>('Task', taskSchema);
