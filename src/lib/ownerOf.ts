import { MESSAGES } from '../auth/validation.js';
import { ApiError } from './apiError.js';

/** The id of the signed-in user, set by the session guard on every request that reaches a handler. */
export function ownerOf(user: { id: string } | undefined): string {
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', MESSAGES.notSignedIn);
  return user.id;
}
