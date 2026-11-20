import { model, Schema, type Types } from 'mongoose';
import { DEFAULT_COLOUR, TAG_COLOURS, TAG_LIMIT, type TagColour } from '../lib/tagFields.js';

export interface TagDoc {
  ownerId: Types.ObjectId;
  name: string;
  colour: TagColour;
  /** 0 to 49, unique per owner: the stored form of the 50-tag limit (DEC-261). Never shown. */
  slot: number;
  createdAt: Date;
  /** Set from the injected clock by the service on every create and change. */
  updatedAt: Date;
}

/** Case-insensitive comparison for names, across accented and non-Latin letters (BR-2). */
export const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

const tagSchema = new Schema<TagDoc>(
  {
    // The privacy boundary: set from the session only, and every query filters on it.
    ownerId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    colour: { type: String, enum: TAG_COLOURS, required: true, default: DEFAULT_COLOUR },
    slot: { type: Number, required: true, min: 0, max: TAG_LIMIT - 1, validate: Number.isInteger },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  // No Mongoose `timestamps`: that reads the system clock, and time is injected (coding-standards backend s10).
);

// Names are unique per user ignoring case; also serves the per-user list sorted by name.
tagSchema.index({ ownerId: 1, name: 1 }, { unique: true, collation: NAME_COLLATION });
// At most 50 tags per user, enforced where the data is stored (BR-5, BR-8).
tagSchema.index({ ownerId: 1, slot: 1 }, { unique: true });

export const Tag = model<TagDoc>('Tag', tagSchema);
