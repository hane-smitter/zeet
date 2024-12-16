import fs from "node:fs";

/**
 * Read number of lines from a file
 * @param filePath Absolute path to a file to read
 * @param noOfLines Number of lines to read from the file. Firstline starts with the number `1`. Default is `1`.
 * @returns Promise with lines read from the file
 */
export function readFileLines(
  filePath: string,
  noOfLines: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    let buffer = "";

    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");

      // Extract lines up to the requested number
      if (lines.length > noOfLines) {
        const extractedLines = lines.slice(0, noOfLines).join("\n");
        stream.destroy(); // More explicit way to stop reading
        resolve(extractedLines);
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });

    stream.on("end", () => {
      // If fewer lines than requested, return all content
      if (buffer) {
        resolve(buffer);
      }
    });
  });
}
