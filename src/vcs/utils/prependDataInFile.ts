import fs from "fs";
import path from "path";

/** Efficiently prepend new data on a file */
export function prependDataInFile(filePath: string, newLine: string): void {
  const tempFilePath = path.join(
    path.dirname(filePath),
    "temp_" + path.basename(filePath)
  );

  // Create write streams
  const tempWriteStream = fs.createWriteStream(tempFilePath);
  const originalReadStream = fs.createReadStream(filePath);

  const appendNewLine = /\n+$/.test(newLine) ? "" : "\n";
  tempWriteStream.write(newLine + appendNewLine); // Write the new line at the top

  // Pipe the original file content to the temp file
  originalReadStream.pipe(tempWriteStream, { end: false });

  originalReadStream.on("end", () => {
    tempWriteStream.end();
    fs.rename(tempFilePath, filePath, (err) => {
      if (err) {
        throw err;
      }
    });
  });
}

// Usage
// prependDataInFile("example.txt", "This is the new line at the top");
