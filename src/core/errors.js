export class AppError extends Error {
  constructor(
    message,
    { statusCode = 500, code = "INTERNAL_ERROR", details = null, expose = true, cause = null } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details, expose: true });
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, { statusCode: 404, code: "NOT_FOUND", expose: true });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message, details = null) {
    super(message, { statusCode: 502, code: "EXTERNAL_SERVICE_ERROR", details, expose: true });
  }
}

export class ConfigurationError extends AppError {
  constructor(message) {
    super(message, { statusCode: 500, code: "CONFIGURATION_ERROR", expose: false });
  }
}

