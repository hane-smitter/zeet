import fs from "node:fs";
import path from "node:path";

import { MYGIT_DIRNAME, MYGIT_REPO } from "../constants";
import { getVersionDir } from "./getVersionDir";

export async function isUntrackedFile(filePath: string) {
  await fs.promises.access(filePath, fs.constants.F_OK); // Will throw if it does not exist

  const repoDir = path.resolve(MYGIT_DIRNAME, MYGIT_REPO);
  const latestVersionDir = await getVersionDir(repoDir, "LATEST"); // Subject to change: Instead read from HEAD that will point to version in current view
  if (!latestVersionDir) return true;

  // console.log("latestVersionDir from UntrackedFile: ", latestVersionDir);

  const relativeFilePath = path.relative(process.cwd(), filePath);
  // console.group("Untracked file");
  // console.log({
  //   WDFilePath: filePath,
  //   "RelativeWD:relativeFilePath": relativeFilePath,
  //   VCSDirFilePath: path.resolve(latestVersionDir, "store", relativeFilePath),
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
      path.resolve(latestVersionDir, "store", relativeFilePath),
      fs.constants.F_OK
    );
    fileExistsInRepo = true;
  } catch (error) {
    fileExistsInRepo = false;
  }

  // console.log(
  //   "Is untracked file: %s, filepath: %s",
  //   !fileExistsInRepo,
  //   path.resolve(latestVersionDir, "store", relativeFilePath)
  // );

  // If file exists in working directory and NOT in repo, then it `untracked`
  return !fileExistsInRepo;
}
