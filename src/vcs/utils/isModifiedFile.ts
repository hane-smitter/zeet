import fs from "node:fs";
import path from "node:path";
import * as Diff from "diff";

import { MYGIT_DIRNAME, MYGIT_REPO } from "../constants";
import { getVersionDir } from "./getVersionDir";

export async function isModifiedFile(filePath: string) {
  await fs.promises.access(filePath, fs.constants.F_OK); // Will throw if it does not exist

  const repoDir = path.resolve(MYGIT_DIRNAME, MYGIT_REPO);
  const latestVersionDir = await getVersionDir(repoDir, "LATEST");
  if (!latestVersionDir) throw new Error("META_STORE_NOT_FOUND");

  //   console.log("latestVersionDir from ModifiedFile: ", latestVersionDir, filePath);

  const versionedFilePath = path.relative(process.cwd(), filePath);
  //   console.group("Modified File");
  //   console.log({
  //     WDFilePath: filePath,
  //     "RelativeWD:versionedFilePath": versionedFilePath,
  //     VCSDirFilePath: path.resolve(latestVersionDir, "store", versionedFilePath),
  //   });
  //   console.groupEnd();

  try {
    const wdFileContents = await fs.promises.readFile(filePath, "utf-8");
    const repoFileContents = await fs.promises.readFile(
      path.resolve(latestVersionDir, "store", versionedFilePath),
      "utf-8"
    );

    const differences = Diff.diffLines(wdFileContents, repoFileContents);

    // console.log(
    //   "Imodified file: %s, filepath: %s",
    //   differences.some((part) => part.added || part.removed),
    //   path.resolve(latestVersionDir, "store", versionedFilePath)
    // );

    // If there are differences
    return differences.some((part) => part.added || part.removed);
  } catch (error) {
    console.error("Error trying to read modified file: ", error);
  }
}
