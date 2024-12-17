import crypto from "node:crypto";

/**
 * Generate random base32 characters in block case
 * @param length Length of the result string
 * @default 8
 * @returns String of random characters
 */
export function randomBase32String(length = 8) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // Base32 charset
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues)
    .map((value) => charset[value % charset.length])
    .join("");
}

/**
 * Shifts a given string's unicode presentation by an integer offset
 * @param str String to shift unicode code points
 * @returns String from the result unicode shift
 */
export function obfuscate(str: string) {
  //obfuscate by moving the character by the `offset` e.g A -> D
  const offset = 3;
  return str
    .split("")
    .map(function (char) {
      return String.fromCharCode(char.charCodeAt(0) + offset);
    })
    .join("");
}
