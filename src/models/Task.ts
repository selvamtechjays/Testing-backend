import { model, Schema, type Types } from 'mongoose';
import { isCalendarDate } from '../lib/calendarDate.js';
import {
  PRIORITIES,
  TASK_FIELD_MESSAGES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../lib/taskFields.js';
import { NOTES_MAX } from '../lib/taskNotes.js';

export type { TaskStatus };

export interface TaskDoc {
  ownerId: Types.ObjectId;
  title: string;
  status: TaskStatus;
  /** `YYYY-MM-DD`, absent when the task has no due date. Rows from before this field existed lack it too. */
  dueDate?: string;
  /** Rows from before this field existed lack it; readers treat a missing value as medium (DEC-210). */
  priority?: TaskPriority;
  /** Absent when the task has no notes: a clear removes the field, it never stores an empty string (DEC-240). */
  notes?: string;
  createdAt: Date;
  /** Set from the injected clock by the service on every create and change; never read by the API. */
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDoc>(
  {
    // The privacy boundary: set from the session only, and every query filters on it.
    ownerId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'pending' },
    // A string, never a Date: a calendar date has no instant and so cannot shift with a time zone (DEC-214).
    dueDate: {
      type: String,
      validate: { validator: isCalendarDate, message: TASK_FIELD_MESSAGES.dueDateInvalid },
    },
    // `.lean()` reads skip this default, so every reader maps a missing value to medium itself (DEC-210).
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    // Optional with no default, so a task added without notes stores no field and old rows need no backfill.
    notes: { type: String, maxlength: NOTES_MAX },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  // No Mongoose `timestamps`: that reads the system clock, and time is injected (coding-standards backend s10).
);

// Serves the per-user newest-first read (DEC-052).
taskSchema.index({ ownerId: 1, createdAt: -1 });

export const Task = model<TaskDoc>('Task', taskSchema);
