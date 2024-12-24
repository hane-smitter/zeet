import path from "node:path";
import fs from "node:fs";

import { getFilePathsUnderDir } from "./getFilePathsUnderDir";
import resolveRoot from "./resolveRoot";
import { copyDir } from "./copyDir";

interface ISyncDir {
  /**
   * _Absolute path_ of directory to source contents
   */
  src: string;
  /**
   * _Absolute path_ of  directory to sync with contents from `src`
   */
  dest: string;
  /**
   * If copying files should ignore files that match patterns in `.zeetignore` or `.gitignore`.
   * @default false
   */
  copyOp_ignore?: boolean;
  /**
   * An _absolute path_ to modify path resolution to `.zeetignore` or `.gitignore`.
   *
   * Needful when you need to skip copying files that match `.zeetignore` patterns when `src` is not the project's root.
   */
  copyOp_ignoreRoot?: string;
}

/**
 * Synchronizes the contents of `dest` with `src` to be identical.
 */
export async function synchronizeDestWithSrc({
  src,
  dest,
  copyOp_ignore = false,
  copyOp_ignoreRoot,
}: ISyncDir) {
  const zeetParentDir = resolveRoot.find();
  // Copy contents from `src` to `dest`
  // This will overwrite files that exist and create those that do not exist
  copyDir({
    src,
    dest,
    ignore: copyOp_ignore,
    ignoreRoot: copyOp_ignoreRoot,
  });

  // Remove files on `dest` that are not in `src`
  const srcFiles = await getFilePathsUnderDir(undefined, src).then(
    (paths) => new Set(paths)
  );
  const destFiles = await getFilePathsUnderDir(undefined, dest);
  const destFilesToRemove = destFiles.filter((destFile) => {
    return !srcFiles.has(destFile);
  });
  if (destFilesToRemove.length) {
    await Promise.all(
      destFilesToRemove.map(async (destFile) => {
        try {
          await fs.promises.unlink(path.join(zeetParentDir, destFile));
        } catch (error) {
          console.error(
            `[Branch switch]Failed to clean up file in: ${destFile}`,
            error
          );
        }
      })
    );
  }
}
