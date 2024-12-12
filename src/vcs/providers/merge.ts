import fs from "node:fs";
import path from "node:path";
// import chalk from "chalk";
import { type ArgumentsCamelCase } from "yargs";
import * as Diff from "diff";

import resolveRoot from "../utils/resolveRoot";
import {
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH,
  MYGIT_BRANCH_ACTIVITY,
  MYGIT_BRANCH_MAPPER,
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_REPO,
} from "../constants";
import { getFilePathsUnderDir } from "../utils";
import { synchronizeDestWithSrc } from "../utils/synchronizeDestWithSrc";
import { styleText } from "node:util";

export const merge = async (
  argv: ArgumentsCamelCase<{
    branchName: string;
  }>
) => {
  // Parlance to understand here
  // Branch1 is the branched you are checked out on
  // Branch2 is the branch you want into you current checkedout branch
  const { branchName } = argv;
  const branchToMerge = branchName.trim();

  const myGitParentDir = resolveRoot.find();
  const myGitBranchDir = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_BRANCH
  );

  const branchMapsFilePath = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_BRANCH,
    `${MYGIT_BRANCH_MAPPER}.json`
  );
  const branchMappings = await fs.promises
    .readFile(branchMapsFilePath, "utf-8")
    .then((mappings): [string, string][] => JSON.parse(mappings));

  // Check if given branch name already exists
  const sysNamedBranch = (function () {
    const found = branchMappings.find(
      ([_systemNamed, userNamed]) => userNamed === branchToMerge
    );

    return found ? found[0] : undefined;
  })();
  if (!sysNamedBranch) {
    console.error(
      `${branchToMerge} is unknown. See 'mygit branch --list' for available branches`
    );
    process.exit(1);
  }

  // Fast-forward merge case
  // Active branch: Currently checked out
  const mergeBranch1 = (
    await fs.promises.readFile(
      path.resolve(myGitBranchDir, MYGIT_ACTIVE_BRANCH),
      "utf-8"
    )
  ).split(/\r?\n/)[0];
  const mergeBranch2 = sysNamedBranch;

  // Goal: Merge branch2 into branch1: HOW???
  // Get common ancestor
  const branch_1_Activity = (
    await fs.promises.readFile(
      path.resolve(myGitBranchDir, mergeBranch1, MYGIT_BRANCH_ACTIVITY),
      "utf-8"
    )
  ).split(/\r?\n/);
  const branch_2_Activity = (
    await fs.promises.readFile(
      path.resolve(myGitBranchDir, mergeBranch2, MYGIT_BRANCH_ACTIVITY),
      "utf-8"
    )
  ).split(/\r?\n/);

  // Detect if fast-forward is possible between the branches
  let canFastforward = false;
  let commonAncestorInBranch2Idx: number | undefined;
  if (branch_2_Activity.length && branch_1_Activity.length) {
    const branch_1_tip = branch_1_Activity[0];
    const branch_2_tip = branch_2_Activity[0];
    // const branch_2_Base = branch_2_Activity[branch_2_Activity.length - 1];

    if (branch_2_tip === branch_1_tip) {
      console.log("Already up to date!");
      process.exit();
    }

    // Find index of latest common ancestor
    commonAncestorInBranch2Idx = branch_2_Activity.findIndex((activity) =>
      branch_1_Activity.includes(activity)
    );
    // Find if branch 2 commit is directly ahead of branch 1
    canFastforward =
      commonAncestorInBranch2Idx === -1
        ? false
        : branch_1_tip === branch_2_Activity[commonAncestorInBranch2Idx];
  }

  console.log({
    canFastforward,
    commonAncestorInBranch2Idx,
    commAnceFromBranch2:
      branch_2_Activity[commonAncestorInBranch2Idx as number],
  });

  // Logic for fast-forward
  if (canFastforward && commonAncestorInBranch2Idx) {
    const orderedBranch_1_activity = [
      ...branch_2_Activity.slice(0, commonAncestorInBranch2Idx), // NOTE: `slice()` does not include `end` in result
      ...branch_1_Activity,
    ];

    console.log({
      orderedBranch_1_activity,
      branch_2_ActivitySliced: branch_2_Activity.slice(
        0,
        commonAncestorInBranch2Idx
      ),
    });

    // Diffing files
    // Diff files in tip of both branches
    // This merge base is also the tip of branch 1(in fast-forward)
    const mergeBase = branch_2_Activity[commonAncestorInBranch2Idx];
    const brach2Tip = branch_2_Activity[0];
    const branch_1_TipSnapPath = path.resolve(
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_REPO,
      mergeBase,
      "store"
    );
    const branch_2_TipSnapPath = path.resolve(
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_REPO,
      brach2Tip,
      "store"
    );
    // const br_1_SnapshotFiles = await getFilePathsUnderDir(
    //   undefined,
    //   branch_1_TipSnapPath
    // );
    const br_2_SnapshotFiles = await getFilePathsUnderDir(
      undefined,
      branch_2_TipSnapPath
    );

    const newFiles = [];
    for (let idx = 0; idx < br_2_SnapshotFiles.length; idx++) {
      // NOTE: It is possible for branch 2 files to be missing in branch 1. A case where new file were created.
      //   const file_1_Path = br_1_SnapshotFiles[idx];
      //   const file_1_Contents = path.join(branch_1_TipSnapPath, file_1_Path);

      const filePath = br_2_SnapshotFiles[idx];
      const br_2_FileContents = await fs.promises.readFile(
        path.join(branch_2_TipSnapPath, filePath),
        "utf-8"
      );
      // Below file read has posssibilty of missing
      let br_1_FileContents = "";
      try {
        br_1_FileContents = await fs.promises.readFile(
          path.join(branch_1_TipSnapPath, filePath),
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsError = error as NodeJS.ErrnoException;

          // If error is due to file not found then it is a new file getting merged
          if (fsError.code === "ENOENT") {
            // newFiles.push(filePath);
            br_1_FileContents = "";
            console.error("File not found:", fsError.path);
          }
        } else {
          console.error("An error occurred in merge OP:", error);
        }
      }

      // Diffing
      const diff = Diff.diffLines(br_1_FileContents, br_2_FileContents);
      const editedTkns = diff.reduce(
        (prev, current) => {
          if (current.added) {
            prev.addedCount += 1;
          } else if (current.removed) {
            prev.removedCount += 1;
          }

          return prev;
        },
        {
          addedCount: 0,
          removedCount: 0,
          path: filePath,
        }
      );

      const addedDecoratorSymbol = editedTkns.addedCount
        ? Array.from({ length: editedTkns.addedCount }, () => "+").join("")
        : "";
      const removedDecoratorSymbol = editedTkns.removedCount
        ? Array.from({ length: editedTkns.removedCount }, () => "-").join("")
        : "";

      if (addedDecoratorSymbol || removedDecoratorSymbol) {
        console.log(
          `${editedTkns.path}: ${styleText(
            "green",
            addedDecoratorSymbol
          )}${styleText("red", removedDecoratorSymbol)}`
        );
      }
    }

    // Update working directory with latest repo changes
    await synchronizeDestWithSrc({
      src: branch_2_TipSnapPath,
      dest: myGitParentDir,
    });

    /* 
      const fs = require('fs');
      const diff = require('diff');

      const current = fs.readFileSync('current.txt', 'utf8');
      const other = fs.readFileSync('other.txt', 'utf8');

      const patch = diff.createPatch('current', current, other);

      if (!diff.applyPatch(current, patch)) {
        console.error('Conflict detected when applying patch!');
      } else {
        const mergedContent = diff.applyPatch(current, patch);
        fs.writeFileSync('merged.txt', mergedContent);
      }
      */

    // Update branch1 activity
    await fs.promises.writeFile(
      path.resolve(myGitBranchDir, mergeBranch1, MYGIT_BRANCH_ACTIVITY),
      orderedBranch_1_activity.join("\n")
    );
    // Update HEAD
    const headFilePath = path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_HEAD);
    const headContent = await fs.promises.readFile(headFilePath, "utf-8");
    const newHeadContent = headContent.replace(
      /@.+$/,
      `@${orderedBranch_1_activity[0]}`
    );
    await fs.promises.writeFile(headFilePath, newHeadContent);
  }
};
