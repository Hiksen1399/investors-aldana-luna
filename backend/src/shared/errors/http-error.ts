export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'REQUEST_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

