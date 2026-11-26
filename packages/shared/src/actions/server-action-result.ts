/** Plain error object as it is transmitted to the client; class instances don't survive serialization. */
export type ServerActionError = {
  name: string;
  message: string;
  statusCode: number;
};

export type ServerActionResult<T> =
  { success: true; value: T } | { success: false; error: ServerActionError };
