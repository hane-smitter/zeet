import fs from "node:fs";
import path from "node:path";

import { MYGIT_DIRNAME, MYGIT_REPO } from "../constants";
import resolveRoot from "./resolveRoot";

/**
 * Get the most recently created direct child directory
 * @param {string} [dirPath] `.zeet` path that stores vesrioned snapshots
 * @param {"LATEST"|number} [period] Reference to a version. Passing `1`  or `"LATEST"` means most recent version. Default is `"LATEST"`. Greater number means older version. **Note:** If 'version reference number' is out of range, it will reduced to the equivalent modulo operation range.
 *
 * `0` is returned when no files are found under `dirPath`
 */
export async function getVersionDir(
  dirPath?: string,
  period: "LATEST" | number = "LATEST"
) {
  const zeetParentDir = resolveRoot.find();
  const targetDir =
    dirPath || path.resolve(zeetParentDir, MYGIT_DIRNAME, MYGIT_REPO);
  // Read the contents of the directory
  const items = await fs.promises.readdir(targetDir, { withFileTypes: true });

  // Filter for direct child directories and get their full paths
  const directories = items
    .filter((item) => item.isDirectory())
    .map((dir) => path.join(targetDir, dir.name));

  if (directories.length < 1) {
    // console.error("No child directories found.");
    return 0;
  }

  // Get the stats for each directory and sort by creation time (ctime)
  const directoriesWithStats = await Promise.all(
    directories.map(async (dir) => {
      const stats = await fs.promises.stat(dir);
      return { dir, ctime: stats.ctime, mtime: stats.mtime };
    })
  );

  directoriesWithStats.sort(function (a, b) {
    return a.ctime.getTime() - b.ctime.getTime();
  });
  // Find the directory with the latest creation time
  // const mostRecentDir = directoriesWithStats.reduce((latest, current) =>
  //   current.ctime > latest.ctime ? current : latest
  // );

  const vesion: number =
    period === "LATEST"
      ? 0
      : typeof period === "number" && !isNaN(period)
      ? Math.trunc(Math.abs(period - 1) % directoriesWithStats.length)
      : 0;

  return directoriesWithStats[vesion].dir;
}
