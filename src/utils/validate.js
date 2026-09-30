/** True only for a 24-character hex string, i.e. a valid MongoDB ObjectId in text form. */
export const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

/** Accept only plain strings from user input; anything else becomes "". */
export const cleanString = (value, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");
