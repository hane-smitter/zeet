import fs from "node:fs";
import path from "node:path";
import ign, { type Ignore } from "ignore";

import resolveRoot from "./resolveRoot";

interface IDirTraverse {
  /**
   * _Relative  path_ of a file to find within `srcDirPath`
   */
  lookupFilePath: string;
  /**
   * _Absolute path_ to directory used to find `lookupPath`
   */
  srcDirPath: string;
  /**
   * `true` will skip path that match ignore patterns in `.mygitignore` or `.gitignore`
   */
  ignore?: boolean;
}

/**
 * Looks up file path in `srcDirPath`
 * @example
 * ```javascript
 * isFilePathUnderDir(
 * "relative/file/path.txt",
 * "/absolute/directory/path"
 * )
 * ```
 */
export async function isFilePathUnderDir({
  lookupFilePath,
  srcDirPath,
  ignore,
}: IDirTraverse) {
  const dirChildren = await fs.promises.readdir(srcDirPath, {
    withFileTypes: true,
  });

  let ig: Ignore | null = null;
  if (ignore) {
    ig = loadIgnorePatterns();
  }

  for (const dirChild of dirChildren) {
    if (dirChild.isDirectory()) {
      const { name } = dirChild;
      if (ig && ig.ignores(name)) continue;

      const srcNestedPath = path.join(srcDirPath, name);
      const relativeDirPath = path.relative(
        srcNestedPath,
        path.join(srcDirPath, lookupFilePath)
      );

      const found = await isFilePathUnderDir({
        lookupFilePath: relativeDirPath,
        srcDirPath: srcNestedPath,
        ignore,
      });
      //   const found = await isFilePathUnderDir(lookupFilePath, srcNestedPath);
      if (found) return true; // Stop as soon as file is found
    } else if (dirChild.name === lookupFilePath) {
      if (ig && ig.ignores(dirChild.name))
        throw new Error("File is an ignored file!");

      return true;
    }
  }

  return false;
}

function loadIgnorePatterns() {
  const myGitParentDir = resolveRoot.find();

  const myGitignorePath = path.resolve(myGitParentDir, ".mygitignore");
  const gitignorePath = path.resolve(myGitParentDir, ".gitignore");

  // Load `.mygitignore` file. If not exist, Load `.gitignore`
  let myGitignorePatterns: string[] = [];
  if (fs.existsSync(myGitignorePath)) {
    const myGitignoreContent = fs.readFileSync(myGitignorePath, "utf-8");
    myGitignorePatterns = myGitignoreContent.split(/\r?\n/).filter(Boolean);
  } else if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    myGitignorePatterns = gitignoreContent.split(/\r?\n/).filter(Boolean);
  }

  const ig = ign().add(myGitignorePatterns);

  return ig;
}
