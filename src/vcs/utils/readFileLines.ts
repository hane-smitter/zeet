import fs from "node:fs";

/**
 * Read number of lines from a file
 * @param filePath Absolute path to a file to read
 * @param noOfLines Number of lines to read from the file. Firstline starts with the number `1`. Default is `1`.
 * @returns Promise with lines read from the file
 */
export async function readFileLines(
  filePath: string,
  noOfLines: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    let buffer = "";
    const readLines = Math.max(noOfLines - 1, 0); // 1-based to 0-based indexing

    stream.on("data", (chunk) => {
      buffer += chunk; // Append chunk to the buffer
      const newlineIndex = buffer.indexOf("\n"); // Find the newline character

      if (newlineIndex === readLines) {
        stream.close(); // Stop reading further data
        const extractedLines = buffer.toString(); // resolve with lines extracted. NOTE: The result includes `\n` characters
        resolve(extractedLines);
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });

    stream.on("close", () => {
      // If the file has no newline, resolve the buffer content
      if (buffer) {
        resolve(buffer);
      }
    });
  });
}
