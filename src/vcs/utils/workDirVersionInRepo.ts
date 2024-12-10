import fs from "node:fs";
import path from "node:path";

import {
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH,
  MYGIT_BRANCH_ACTIVITY,
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_REPO,
} from "../constants";
// import { getVersionDir } from "./getVersionDir";
import resolveRoot from "./resolveRoot";

/**
 * Returns path to current snapshot of the _Work Dir_(gotten from `HEAD`). If nothing, most recent snapshot path of ACTIVE branch is retrieved.
 *
 * **Abolute path** is returned
 */
export async function workDirVersionInrepo() {
  const myGitParentDir = resolveRoot.find();
  const repoDir = path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_REPO);

  const myGitVersionTracker = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_HEAD
  );
  // `myGitVersionTracker` should be a file with a single entry
  //  We are `split`ting by newline `\n` character just to ensure we get first only string(incase there's more)
  const nowVersion = (await fs.promises.readFile(myGitVersionTracker, "utf-8"))
    .split(/\r?\n/)[0]
    .replace(/^.+@/g, "");

  // if `nowVersion` read from `head` is not available, then we get latest version store from `REPO`
  let selectedVersionDir: string | undefined;
  if (nowVersion) {
    selectedVersionDir = path.resolve(repoDir, nowVersion);
  } else {
    // This process will read the most recent snapshot token from an ACTIVE branch's ACTIVITY
    const activeBranch = await fs.promises.readFile(
      path.resolve(
        myGitParentDir,
        MYGIT_DIRNAME,
        MYGIT_BRANCH,
        MYGIT_ACTIVE_BRANCH
      ),
      "utf-8"
    );
    const branchLatestSnap = (
      await fs.promises.readFile(
        path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_BRANCH,
          activeBranch,
          MYGIT_BRANCH_ACTIVITY
        ),
        "utf-8"
      )
    ).split(/\r?\n/)[0];

    selectedVersionDir = path.resolve(repoDir, branchLatestSnap);

    // Below is commented since it reads the lastmost created REPO, which may be an anti-pattern
    // selectedVersionDir = (await getVersionDir(repoDir, "LATEST")) || "";
  }

  return selectedVersionDir;
}
