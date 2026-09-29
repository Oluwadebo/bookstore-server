/**
 * Express 4 does not catch errors thrown inside async route handlers.
 * Wrap a handler with this and any thrown error (or rejected promise) is
 * passed to the central error handler instead of crashing the request.
 *
 *   router.get("/", asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
