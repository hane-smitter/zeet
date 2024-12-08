import fs from "node:fs";
import path from "node:path";
import * as Diff from "diff";

import { workDirVersionInrepo } from "./workDirVersionInRepo";
import resolveRoot from "./resolveRoot";

export async function isModifiedFile(filePath: string) {
  const myGitParentDir = resolveRoot.find();
  const wdFilePath = path.resolve(myGitParentDir, filePath);

  await fs.promises.access(wdFilePath, fs.constants.F_OK); // Will throw if it does not exist

  const selectedVersionDir = await workDirVersionInrepo();
  if (!selectedVersionDir) throw new Error("META_STORE_NOT_FOUND");

  //   console.log("selectedVersionDir from ModifiedFile: ", selectedVersionDir, filePath);

  const versionedFilePath = path.relative(myGitParentDir, wdFilePath);

  try {
    const wdFileContents = await fs.promises.readFile(wdFilePath, "utf-8");
    const repoFileContents = await fs.promises.readFile(
      path.resolve(selectedVersionDir, "store", versionedFilePath),
      "utf-8"
    );

    const differences = Diff.diffLines(wdFileContents, repoFileContents);

    // console.log({
    //   "is-modifiedfile-": differences.some(
    //     (part) => part.added || part.removed
    //   ),
    //   wdFilePath,
    // });

    // If there are differences
    return differences.some((part) => part.added || part.removed);
  } catch (error) {
    console.error("Error trying to read modified file: ", error);
  }
}
