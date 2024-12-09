import fs from "node:fs";
import path from "node:path";

import { MYGIT_DIRNAME, MYGIT_HEAD, MYGIT_REPO } from "../constants";
import { getVersionDir } from "./getVersionDir";
import resolveRoot from "./resolveRoot";

/**
 * Selects version from `HEAD` for the current work dir. If nothing, most recent snapshot path is retrieved.
 *
 * Absolute path is returned
 */
export async function workDirVersionInrepo() {
  const myGitParentDir = resolveRoot.find();
  const repoDir = path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_REPO);

  const myGitVersionTracker = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_HEAD
  );
  // `myGitVersionTracker` should be a file with a single entry. We are `split`ting by newline `\n` character just to ensure we get first only string(incase there's more)
  const nowVersion = (await fs.promises.readFile(myGitVersionTracker, "utf-8"))
    .split(/\r?\n/)[0]
    .replace(/^.+@/g, "");

  // if `nowVersion` read from `head` is not available, then we get latest version store from `REPO`
  let selectedVersionDir: string | undefined;
  if (nowVersion) {
    selectedVersionDir = path.resolve(repoDir, nowVersion);
  } else {
    selectedVersionDir = (await getVersionDir(repoDir, "LATEST")) || ""; // TODO: Get latest repo for a particular branch. Current behavior is latest repo is retrieved regardless of branch.
  }

  return selectedVersionDir;
}
