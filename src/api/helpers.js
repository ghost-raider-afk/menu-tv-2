import { ConflictError, NotFoundError } from '../shared/errors.js';

export function notFound(message) {
  return new NotFoundError(message);
}

export function conflict(message, details) {
  return new ConflictError(message, details === undefined ? {} : { details });
}

export function activity(store, request, entry) {
  return store.recordActivity({ actor_username: request.session.sub, ...entry });
}
