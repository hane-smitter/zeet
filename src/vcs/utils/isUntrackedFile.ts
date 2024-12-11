import fs from "node:fs";
import path from "node:path";

import { workDirVersionInrepo } from "./workDirVersionInRepo";
import resolveRoot from "./resolveRoot";

export async function isUntrackedFile(filePath: string) {
  const myGitParentDir = resolveRoot.find();
  // Check `filePath` exists in wd
  await fs.promises.access(
    path.resolve(myGitParentDir, filePath),
    fs.constants.F_OK
  );

  const selectedVersionDir = await workDirVersionInrepo();
  // Can be empty string meaning no snapshot of working dir is found
  if (!selectedVersionDir) return true;

  const relativeFilePath = path.relative(
    myGitParentDir,
    path.resolve(myGitParentDir, filePath)
  );

  let fileExistsInRepo: boolean | undefined;
  try {
    await fs.promises.access(
      path.resolve(selectedVersionDir, "store", relativeFilePath),
      fs.constants.F_OK
    );
    fileExistsInRepo = true;
  } catch (error) {
    fileExistsInRepo = false;
  }

  // console.log({
  //   fileExistsInRepo,
  //   path: path.resolve(selectedVersionDir, "store", relativeFilePath),
  // });

  // If file exists in working directory and NOT in repo, then it `untracked`
  return !fileExistsInRepo;
}
