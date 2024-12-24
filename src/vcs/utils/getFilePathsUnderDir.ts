import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ignore from "ignore";
import resolveRoot from "./resolveRoot";

/**
 * Gets file paths under `targetDir` directory. If not specified, it finds file paths from project root.
 *
 * Path patterns specified in `.zeetignore` are skipped.
 * @param {string} [targetDir = ""]  Directory to find files.
 * @param {string} [cwdPath = ""]  Specify current working directory.
 * @returns {Promise<string[]>} Returns relative file paths. Paths that match ignore patterns are excluded from result.
 */
export async function getFilePathsUnderDir(
  targetDir: string = "",
  cwdPath: string = ""
): Promise<string[]> {
  // test comment
  const zeetParentDir = resolveRoot.find();
  const zeetignorePath = path.resolve(zeetParentDir, ".zeetignore");
  const gitignorePath = path.resolve(zeetParentDir, ".gitignore");
  const cwd = cwdPath || zeetParentDir;

  // Load `.zeetignore` file. If not exist, Load `.gitignore`
  let zeetignorePatterns: string[] = [];
  if (fs.existsSync(zeetignorePath)) {
    const zeetignoreContent = fs.readFileSync(zeetignorePath, "utf-8");
    zeetignorePatterns = zeetignoreContent.split(/\r?\n/).filter(Boolean);
  } else if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    zeetignorePatterns = gitignoreContent.split(/\r?\n/).filter(Boolean);
  }

  const ig = ignore().add(zeetignorePatterns);

  const scanDirPattern = targetDir
    ? `${targetDir.replace(/(\/)+$/, "")}/**`
    : "**/*";
  const files = await glob(scanDirPattern, {
    cwd,
    nodir: true,
    dot: true,
    ignore: ["node_modules/**", ".git/**", ".zeet/**"],
    absolute: false,
  });

  // Filter files using .gitignore patterns
  const filteredFiles = files.filter((file) => !ig.ignores(file));

  return filteredFiles;
}
