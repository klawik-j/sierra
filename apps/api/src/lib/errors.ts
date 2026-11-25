/** Error with an HTTP status and a stable machine-readable code the web app translates. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = (what = "resource") => new HttpError(404, "not_found", `${what} not found`);
export const forbidden = (message = "You do not have permission to do this") => new HttpError(403, "forbidden", message);
export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
