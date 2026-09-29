/**
 * An error that carries an HTTP status code.
 * Throw it from any route and the central error handler turns it into a
 * clean JSON response:  throw new ApiError(404, "Book not found");
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
