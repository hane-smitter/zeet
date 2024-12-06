import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ignore from "ignore";

/**
 * Gets file paths under `targetDir` directory. If not specified, it finds file paths under current working directory(`cwd`).
 *
 * Path patterns specified in `.mygitignore` are skipped.
 * @param {string} [targetDir = ""]  Directory to find files
 * @returns
 */
export async function getFilePathsUnderDir(targetDir: string = "") {
  try {
    const myGitignorePath = path.resolve(".mygitignore");
    const gitignorePath = path.resolve(".gitignore");

    // Load `.mygitignore` file. If not exist, Load `.gitignore`
    let myGitignorePatterns: string[] = [];
    if (fs.existsSync(myGitignorePath)) {
      const myGitignoreContent = fs.readFileSync(myGitignorePath, "utf-8");
      myGitignorePatterns = myGitignoreContent.split(/\r?\n/).filter(Boolean);
    } else if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      myGitignorePatterns = gitignoreContent.split(/\r?\n/).filter(Boolean);
    }

    const ig = ignore().add(myGitignorePatterns);

    const scanDirPattern = targetDir
      ? `${targetDir.replace(/(\/)+$/, "")}/**`
      : "**/*";
    const files = await glob(scanDirPattern, {
      nodir: true,
      dot: true,
      ignore: ["node_modules/**", ".git/**", ".mygit/**"],
      absolute: false,
    });

    // Filter files using .gitignore patterns
    const filteredFiles = files.filter((file) => !ig.ignores(file));

    return filteredFiles;
  } catch (error) {
    console.log("Error traversing directory: ", error);
  }
}
