// src/utils/errors.js
// Centralized application error hierarchy.

class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.userMessage = options.userMessage || message;
    this.code = options.code || 'APP_ERROR';
    this.status = options.status || 500;
    this.details = options.details || null;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, {
      userMessage: message,
      code: 'VALIDATION_ERROR',
      status: 400,
      details,
    });
  }
}

class PermissionError extends AppError {
  constructor(message, details) {
    super(message, {
      userMessage: message || 'You do not have permission to execute this command.',
      code: 'PERMISSION_ERROR',
      status: 403,
      details,
    });
  }
}

class HierarchyError extends AppError {
  constructor(message, details) {
    super(message, {
      userMessage: message || 'Hierarchy violation: action blocked due to role hierarchy.',
      code: 'HIERARCHY_ERROR',
      status: 403,
      details,
    });
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter, message) {
    super(message || `Rate limit exceeded. Try again in ${retryAfter}s.`, {
      userMessage: message || `Slow down — try again in **${retryAfter}s**.`,
      code: 'RATE_LIMIT_ERROR',
      status: 429,
      details: { retryAfter },
    });
  }
}

class ExternalAPIError extends AppError {
  constructor(service, message, details) {
    super(`[${service}] API Error: ${message}`, {
      userMessage: `External service (${service}) is temporarily unavailable. Please try again shortly.`,
      code: 'EXTERNAL_API_ERROR',
      status: 502,
      details,
    });
  }
}

class DatabaseError extends AppError {
  constructor(message, details) {
    super(message, {
      userMessage: 'A database error occurred while processing your request.',
      code: 'DATABASE_ERROR',
      status: 500,
      details,
    });
  }
}

module.exports = {
  AppError,
  ValidationError,
  PermissionError,
  HierarchyError,
  RateLimitError,
  ExternalAPIError,
  DatabaseError,
};
