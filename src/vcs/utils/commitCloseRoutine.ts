import fs from "node:fs";
import path from "node:path";

import {
  ZEET_ACTIVE_BRANCH,
  ZEET_BRANCH,
  ZEET_BRANCH_ACTIVITY,
  ZEET_DIRNAME,
  ZEET_HEAD,
  ZEET_STAGING,
} from "../constants";
import resolveRoot from "./resolveRoot";
import { prependDataInFile } from "./prependDataInFile";

export function commitCloseRoutine(new_V_DirName: string) {
  const zeetParentDir = resolveRoot.find();
  // After versioning, reset the staging index
  fs.writeFileSync(
    path.resolve(zeetParentDir, ZEET_DIRNAME, ZEET_STAGING),
    "",
    {
      encoding: "utf-8",
    }
  );
  // After versioning, update the `HEAD`
  const currentActiveBranch = fs
    .readFileSync(
      path.resolve(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_BRANCH,
        ZEET_ACTIVE_BRANCH
      ),
      "utf-8"
    )
    .split(/\r?\n/)[0];
  const updatedHead = currentActiveBranch + "@" + new_V_DirName;
  fs.writeFileSync(
    path.resolve(zeetParentDir, ZEET_DIRNAME, ZEET_HEAD),
    updatedHead,
    { encoding: "utf-8" }
  );

  // After versioning, update a branch's `ACTIVITY` with the `new_V_DirName`.
  // Reading file belonging to a branch that stores pointers. Add `new_V_DirName` to the top.
  prependDataInFile(
    path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_BRANCH,
      currentActiveBranch,
      ZEET_BRANCH_ACTIVITY
    ),
    new_V_DirName
  );
}
