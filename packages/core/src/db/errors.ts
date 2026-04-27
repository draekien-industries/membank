export class MembankError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MembankError";
  }
}

export class DatabaseError extends MembankError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}
