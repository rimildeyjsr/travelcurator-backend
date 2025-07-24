// Import the error classes first
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError } from './types.js';

// Re-export all error types and utilities
export * from './types.js';
export * from './handler.js';

// Convenience functions for common error scenarios
export function throwNotFound(resource: string = 'Resource'): never {
  throw new NotFoundError(resource);
}

export function throwUnauthorized(message?: string): never {
  throw new UnauthorizedError(message);
}

export function throwValidation(
  message: string,
  details: Array<{ field: string; message: string; value?: unknown }> = []
): never {
  throw new ValidationError(message, details);
}

export function throwConflict(message: string): never {
  throw new ConflictError(message);
}