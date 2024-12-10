import fs from "fs";
import path from "path";
import ignoreMatch, { type Ignore } from "ignore";

import resolveRoot from "./resolveRoot";

interface IDetails {
  /** Copy directory and contents from `stc` to `dest`. If `dest` does not exist, it is created. */
  /** Source directory path */
  src: string;
  /** Destination directory path */
  dest: string;
  /** `true` means skip copying files that match ignore patterns in `.mygitignore` or `.gitignore`. Default is `false`.
   * @default false
   */
  ignore?: boolean;
  /**
   * An absolute path to `.mygitignore` or `.gitignore` file. This changes file resolution of ignore patterns.
   * This is useful when you would want a file to still be ignored according to ignore patterns when it is deeply nested.
   * **NOTE:** This does not change location `.mygitnore` but rather changes how ignored files are resolved
   */
  ignoreRoot?: string;
}

export function copyDir({
  src,
  dest,
  ignore = false,
  ignoreRoot,
}: IDetails): void {
  const myGitParentDir = resolveRoot.find();
  // This is only used for resolving patterns to ignore
  const ignoreResolutionPath = ignoreRoot || myGitParentDir;

  if (src === dest) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  let ig: Ignore | null;
  if (ignore) {
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

    ig = ignoreMatch().add(myGitignorePatterns);
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      ignore &&
      ig &&
      ig.ignores(path.relative(ignoreResolutionPath, srcPath))
    )
      continue;

    if (entry.isDirectory()) {
      copyDir({ src: srcPath, dest: destPath, ignore, ignoreRoot });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
