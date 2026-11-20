import { Router } from 'express';
import { createRequireSession } from '../auth/requireSession.js';
import { ApiError } from '../lib/apiError.js';
import { asRecord } from '../lib/asRecord.js';
import { ownerOf } from '../lib/ownerOf.js';
import { parseBody } from '../lib/parseBody.js';
import { createTagSchema, updateTagSchema } from '../lib/tagFields.js';
import { TAG_ID_PATTERN, TAG_NOT_FOUND } from '../lib/tagId.js';
import { createTag, deleteTag, listTags, updateTag } from '../services/tags.js';

export interface TagsDeps {
  clock: () => Date;
}

/** The `:id` path parameter. A malformed id is "not found", checked before any body so it cannot probe for valid ids. */
function tagIdOf(rawId: unknown): string {
  const tagId = String(rawId);
  if (!TAG_ID_PATTERN.test(tagId)) throw new ApiError(404, 'NOT_FOUND', TAG_NOT_FOUND);
  return tagId;
}

/** Tag routes. Each sits behind the session guard and is scoped to the signed-in owner (BR-1). */
export function createTagsRouter(deps: TagsDeps): Router {
  const router = Router();
  const requireSession = createRequireSession({ clock: deps.clock });
  router.get('/tags', requireSession, async (_req, res) => {
    res.status(200).json(await listTags(ownerOf(res.locals.user)));
  });
  router.post('/tags', requireSession, async (req, res) => {
    const input = parseBody(createTagSchema, asRecord(req.body));
    const tag = await createTag(ownerOf(res.locals.user), input, deps.clock());
    res.status(201).json({ tag });
  });
  router.patch('/tags/:id', requireSession, async (req, res) => {
    const tagId = tagIdOf(req.params.id);
    const input = parseBody(updateTagSchema, asRecord(req.body));
    const tag = await updateTag(ownerOf(res.locals.user), tagId, input, deps.clock());
    res.status(200).json({ tag });
  });
  router.delete('/tags/:id', requireSession, async (req, res) => {
    await deleteTag(ownerOf(res.locals.user), tagIdOf(req.params.id), deps.clock());
    res.status(204).end();
  });
  return router;
}
