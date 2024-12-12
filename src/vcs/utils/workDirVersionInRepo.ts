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

// `${new_V_DirName}&${branch1Tip}&${branch2Tip}&${mergeBase}`
/[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+$/;

/**
 * Returns path to current snapshot of the _Work Dir_(gotten from `HEAD`). If nothing, most recent snapshot reference is obtained from ACTIVE branch's ACTIVITY.
 *
 * **Abolute path** is returned
 *
 * If snapshot of the work dir is still __NOT FOUND__ in REPO, an empty string is returned.
 * @param {boolean} [raw] If `true` current commit returned won't be sanitized. Return value will still look normal with exception when current snapshot is by a merge commit that appears differently in the way it is constructed.
 */
export async function workDirVersionInrepo(raw?: boolean) {
  const myGitParentDir = resolveRoot.find();
  const repoDir = path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_REPO);

  const myGitVersionTracker = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_HEAD
  );
  // `myGitVersionTracker` should be a file with a single entry
  //  We are `split`ting by newline `\n` character just to ensure we get first only string(incase there's more)
  let nowVersion = (await fs.promises.readFile(myGitVersionTracker, "utf-8"))
    .split(/\r?\n/)[0]
    // Remove branch name
    .replace(/^.+@/g, "");

  if (!raw) {
    // If merge commit, remove parent commits identifiers
    nowVersion = nowVersion.replace(
      /&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+$/,
      ""
    );
  }
  // if `nowVersion` read from `head` is not available, then we get latest version store from `REPO`
  let selectedVersionDir: string;
  if (nowVersion) {
    selectedVersionDir = path.resolve(repoDir, nowVersion);
    return selectedVersionDir;
  }

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
  let branchLatestSnap = (
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

  if (!raw) {
    // If merge commit, remove parent commits identifiers
    branchLatestSnap = branchLatestSnap.replace(
      /&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+$/,
      ""
    );
  }
  if (branchLatestSnap) {
    selectedVersionDir = path.resolve(repoDir, branchLatestSnap);
    return selectedVersionDir;
  }

  return "";
}
