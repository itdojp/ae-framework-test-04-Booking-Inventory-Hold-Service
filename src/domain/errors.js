export class DomainError extends Error {
  constructor(code, message, status = 409, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isDomainError(error) {
  return error instanceof DomainError;
}
