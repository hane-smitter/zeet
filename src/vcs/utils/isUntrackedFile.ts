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

  // console.log("selectedVersionDir from UntrackedFile: ", selectedVersionDir);

  const relativeFilePath = path.relative(myGitParentDir, filePath);
  // console.group("Untracked file");
  // console.log({
  //   WDFilePath: filePath,
  //   "RelativeWD:relativeFilePath": relativeFilePath,
  //   VCSDirFilePath: path.resolve(selectedVersionDir, "store", relativeFilePath),
  // });
  // console.groupEnd();

  // let fileExistsInWD: boolean | undefined;
  // try {
  //   await fs.promises.access(filePath, fs.constants.F_OK);
  //   fileExistsInWD = true;
  // } catch (error) {
  //   fileExistsInWD = false;
  // }

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

  // console.log(
  //   "Is untracked file: %s, filepath: %s",
  //   !fileExistsInRepo,
  //   path.resolve(selectedVersionDir, "store", relativeFilePath)
  // );

  // If file exists in working directory and NOT in repo, then it `untracked`
  return !fileExistsInRepo;
}
