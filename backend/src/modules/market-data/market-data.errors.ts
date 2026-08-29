import { HttpError } from '../../shared/errors/http-error.js';

export type ProviderErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INVALID_PROVIDER_KEY'
  | 'SYMBOL_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MARKET_DATA_TIMEOUT'
  | 'INCOMPLETE_PROVIDER_RESPONSE'
  | 'PROVIDER_UNAVAILABLE';

export class MarketDataProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, message: string, public readonly retryable = false) {
    super(message);
    this.name = 'MarketDataProviderError';
  }
}

export class MarketDataError extends HttpError {
  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(statusCode, message, code, details);
    this.name = 'MarketDataError';
  }
}

