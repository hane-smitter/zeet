import fs from "node:fs";
import path from "node:path";
import * as Diff from "diff";

import { workDirVersionInrepo } from "./workDirVersionInRepo";
import resolveRoot from "./resolveRoot";

export async function isModifiedFile(filePath: string) {
  const myGitParentDir = resolveRoot.find();

  await fs.promises.access(
    path.resolve(myGitParentDir, filePath),
    fs.constants.F_OK
  ); // Will throw if it does not exist

  const selectedVersionDir = await workDirVersionInrepo();
  if (!selectedVersionDir) throw new Error("META_STORE_NOT_FOUND");

  //   console.log("selectedVersionDir from ModifiedFile: ", selectedVersionDir, filePath);

  const versionedFilePath = path.relative(myGitParentDir, filePath);

  try {
    const wdFileContents = await fs.promises.readFile(filePath, "utf-8");
    const repoFileContents = await fs.promises.readFile(
      path.resolve(selectedVersionDir, "store", versionedFilePath),
      "utf-8"
    );

    const differences = Diff.diffLines(wdFileContents, repoFileContents);

    // If there are differences
    return differences.some((part) => part.added || part.removed);
  } catch (error) {
    console.error("Error trying to read modified file: ", error);
  }
}
