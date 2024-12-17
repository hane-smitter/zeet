import fs from "node:fs";
import path from "node:path";

import {
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH,
  MYGIT_BRANCH_ACTIVITY,
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_STAGING,
} from "../constants";
import resolveRoot from "./resolveRoot";
import { prependDataInFile } from "./prependDataInFile";

export function commitCloseRoutine(new_V_DirName: string) {
  const myGitParentDir = resolveRoot.find();
  // After versioning, reset the staging index
  fs.writeFileSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_STAGING),
    "",
    {
      encoding: "utf-8",
    }
  );
  // After versioning, update the `HEAD`
  const currentActiveBranch = fs
    .readFileSync(
      path.resolve(
        myGitParentDir,
        MYGIT_DIRNAME,
        MYGIT_BRANCH,
        MYGIT_ACTIVE_BRANCH
      ),
      "utf-8"
    )
    .split(/\r?\n/)[0];
  const updatedHead = currentActiveBranch + "@" + new_V_DirName;
  fs.writeFileSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_HEAD),
    updatedHead,
    { encoding: "utf-8" }
  );

  // After versioning, update a branch's `ACTIVITY` with the `new_V_DirName`.
  // Reading file belonging to a branch that stores pointers. Add `new_V_DirName` to the top.
  prependDataInFile(
    path.join(
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_BRANCH,
      currentActiveBranch,
      MYGIT_BRANCH_ACTIVITY
    ),
    new_V_DirName
  );
}
