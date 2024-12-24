import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import type { ArgumentsCamelCase } from "yargs";
import * as Diff from "diff";

import resolveRoot from "../utils/resolveRoot";
import {
  ZEET_BRANCH,
  ZEET_BRANCH_ACTIVITY,
  ZEET_BRANCH_MAPPER,
  ZEET_DIRNAME,
  ZEET_REPO,
} from "../constants";
import { workDirVersionInrepo } from "../utils/workDirVersionInRepo";
import { getFilePathsUnderDir } from "../utils";
import { validCommitPattern } from "../utils/regexPatterns";
import { readFileLines } from "../utils/readFileLines";
import { TerminalPager } from "../utils/terminalPager";

export const diff = async (
  argv: ArgumentsCamelCase<{ fileOrVersion?: string[] }>
) => {
  const zeetParentDir = resolveRoot.find();

  const [diffTarget1, diffTarget2] = (argv.fileOrVersion || []).map((t) =>
    t?.trim()
  );

  const termPager = new TerminalPager();
  let LOG_OUTPUT = "";

  if (isCommitId(diffTarget1)) {
    // diffTarget1 is a commit
    const commitId1 = diffTarget1.split("&")[0]; // accounts for merge commit structure
    const versionPath1 = path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      commitId1
    );
    const versionStore1 = path.join(versionPath1, "store");

    if (!fs.existsSync(versionPath1)) {
      console.error(`This revision: ${diffTarget1} is not known`);
      process.exit(1);
    }

    const versionStoreFiles1 = await getFilePathsUnderDir(
      undefined,
      versionStore1
    );

    if (isCommitId(diffTarget2)) {
      // diffTarget2 is a commit
      const commitId2 = diffTarget2.split("&")[0];
      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        commitId2
      );
      const versionStore2 = path.join(versionPath2, "store");

      // Continue only if `commitId` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        console.error(`This revision: ${diffTarget2} is not known`);
        process.exit(1);
      }

      for (let idx = 0; idx < versionStoreFiles1.length; idx++) {
        const filePath = versionStoreFiles1[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    } else if (getBranch(diffTarget2, zeetParentDir)) {
      // diffTarget2 is a branch
      const branch2 = getBranch(diffTarget2, zeetParentDir);
      if (!branch2) throw new Error("Branch2 not found");

      // If branch exists, get the most recent commit from it
      const branchActivityPath = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_BRANCH,
        branch2[0],
        ZEET_BRANCH_ACTIVITY
      );

      const branchLatestComm2 = await readFileLines(branchActivityPath, 1).then(
        (commit) => commit.split("&")[0]
      );
      if (!branchLatestComm2) {
        console.error("Branch: " + branch2[1] + " has no commits made");
        process.exit(1);
      }

      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        branchLatestComm2
      );
      const versionStore2 = path.join(versionPath2, "store");
      // Continue only if `branchLatestComm` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        console.error(
          `This revision: ${branchLatestComm2} in branch '${branch2[1]}' is corrupt`
        );
        process.exit(1);
      }

      for (let idx = 0; idx < versionStoreFiles1.length; idx++) {
        const filePath = versionStoreFiles1[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    } else if (
      diffTarget2 &&
      fs.existsSync(
        path.isAbsolute(diffTarget2)
          ? diffTarget2
          : path.join(process.cwd(), diffTarget2)
      )
    ) {
      // diffTarget2 is a file - We'll compare the file with the file from the commit: diffTarget1

      let filePath = path.isAbsolute(diffTarget2)
        ? diffTarget2
        : path.join(process.cwd(), diffTarget2); // will correctly handle paths like '../../file'
      if (!filePath.includes(zeetParentDir)) {
        console.error(
          `IKO SHIDA! Path: '${filePath}' is outside repository at '${zeetParentDir}'`
        );
        process.exit(1);
      }

      // Convert path to relative
      filePath = path.relative(zeetParentDir, filePath);

      const versionStore2 = zeetParentDir; // working directory

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(versionStore1, filePath),
        newFilePath: path.join(versionStore2, filePath),
        newFileName: filePath,
        oldFileName: filePath,
      });

      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    }
    // diffTarget2 has a value but is not a commit, branch or file
    else if (diffTarget2) {
      displayError(diffTarget2);
      process.exit(1);
    } else {
      const versionStore2 = zeetParentDir;

      for (let idx = 0; idx < versionStoreFiles1.length; idx++) {
        const filePath = versionStoreFiles1[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    }
  } else if (getBranch(diffTarget1, zeetParentDir)) {
    // diffTarget1 is a branch

    const branch1 = getBranch(diffTarget1, zeetParentDir);
    if (!branch1) throw new Error("Branch1 not found");

    // If branch exists, get the most recent commit from it
    const branchActivityPath1 = path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_BRANCH,
      branch1[0],
      ZEET_BRANCH_ACTIVITY
    );

    const branchLatestComm1 = await readFileLines(branchActivityPath1, 1).then(
      (commit) => commit.split("&")[0] /* accounts for merge commit structure */
    );
    if (!branchLatestComm1) {
      console.error("Branch: " + branch1[1] + " has no commits made");
      process.exit(1);
    }

    const commitId1 = branchLatestComm1;
    const versionPath1 = path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      commitId1
    );
    const versionStore1 = path.join(versionPath1, "store");

    if (!fs.existsSync(versionPath1)) {
      console.error(`Branch recent revision: ${diffTarget1} is corrupt`);
      process.exit(1);
    }

    const versionStoreFiles1 = await getFilePathsUnderDir(
      undefined,
      versionStore1
    );

    if (isCommitId(diffTarget2)) {
      // diffTarget2 is a commit
      const commitId2 = diffTarget2.split("&")[0];
      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        commitId2
      );
      const versionStore2 = path.join(versionPath2, "store");

      // Continue only if `commitId` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        displayError(diffTarget2);
        process.exit(1);
      }
      const mergedFileSources = await getFilePathsUnderDir(
        undefined,
        versionStore2
      ).then((files) => [...new Set([...versionStoreFiles1, ...files])]);

      for (let idx = 0; idx < mergedFileSources.length; idx++) {
        const filePath = mergedFileSources[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    } else if (getBranch(diffTarget2, zeetParentDir)) {
      // diffTarget2 is a branch
      const branch2 = getBranch(diffTarget2, zeetParentDir);
      if (!branch2) throw new Error("Branch2 not found");

      // If branch exists, get the most recent commit from it
      const branchActivityPath = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_BRANCH,
        branch2[0],
        ZEET_BRANCH_ACTIVITY
      );

      const branchLatestComm2 = await readFileLines(branchActivityPath, 1).then(
        (commit) => commit.split("&")[0]
      );
      if (!branchLatestComm2) {
        console.error("Branch: " + branch2[1] + " has no commits made");
        process.exit(1);
      }

      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        branchLatestComm2
      );
      const versionStore2 = path.join(versionPath2, "store");
      // Continue only if `branchLatestComm` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        console.error(
          `This revision: ${branchLatestComm2} in branch '${branch2[1]}' is corrupt`
        );
        process.exit(1);
      }

      const mergedFileSources = await getFilePathsUnderDir(
        undefined,
        versionStore2
      ).then((files) => [...new Set([...versionStoreFiles1, ...files])]);

      for (let idx = 0; idx < mergedFileSources.length; idx++) {
        const filePath = mergedFileSources[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    } else if (
      diffTarget2 &&
      fs.existsSync(
        path.isAbsolute(diffTarget2)
          ? diffTarget2
          : path.join(process.cwd(), diffTarget2)
      )
    ) {
      // diffTarget2 is a file - We'll compare the file with the file from the selected branch1 commit

      let filePath = path.isAbsolute(diffTarget2)
        ? diffTarget2
        : path.join(process.cwd(), diffTarget2); // will correctly handle paths like '../../file'
      if (!filePath.includes(zeetParentDir)) {
        console.error(
          `IKO SHIDA! Path: '${filePath}' is outside repository at '${zeetParentDir}'`
        );
        process.exit(1);
      }

      // Convert path to relative
      filePath = path.relative(zeetParentDir, filePath);

      const versionStore2 = zeetParentDir; // working directory

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(versionStore1, filePath),
        newFilePath: path.join(versionStore2, filePath),
        newFileName: filePath,
        oldFileName: filePath,
      });

      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    }
    // diffTarget2 has a value but is not a commit, branch or file
    else if (diffTarget2) {
      displayError(diffTarget2);
      process.exit(1);
    } else {
      const versionStore2 = zeetParentDir;

      for (let idx = 0; idx < versionStoreFiles1.length; idx++) {
        const filePath = versionStoreFiles1[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    }
  } else if (
    diffTarget1 &&
    fs.existsSync(
      path.isAbsolute(diffTarget1)
        ? diffTarget1
        : path.join(process.cwd(), diffTarget1)
    )
  ) {
    // diffTarget1 is a file
    let filePath1 = path.isAbsolute(diffTarget1)
      ? diffTarget1
      : path.join(process.cwd(), diffTarget1); // will correctly handle paths like '../../file'
    if (!filePath1.includes(zeetParentDir)) {
      console.error(
        `IKO SHIDA! Path: '${filePath1}' is outside repository at '${zeetParentDir}'`
      );
      process.exit(1);
    }

    // Convert path to relative
    filePath1 = path.relative(zeetParentDir, filePath1);

    if (isCommitId(diffTarget2)) {
      // diffTarget2 is a commit
      const commitId2 = diffTarget2.split("&")[0];
      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        commitId2
      );
      const versionStore2 = path.join(versionPath2, "store");

      // Continue only if `commitId` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        console.error(`This revision: ${diffTarget2} is not known`);
        process.exit(1);
      }

      // Find filePath1 in the commit: diffTarget2
      const workDirPath = zeetParentDir;

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(workDirPath, filePath1),
        newFilePath: path.join(versionStore2, filePath1),
        newFileName: filePath1,
        oldFileName: filePath1,
      });

      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    } else if (getBranch(diffTarget2, zeetParentDir)) {
      // diffTarget2 is a branch
      const branch2 = getBranch(diffTarget2, zeetParentDir);
      if (!branch2) throw new Error("Branch2 not found");

      // If branch exists, get the most recent commit from it
      const branchActivityPath = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_BRANCH,
        branch2[0],
        ZEET_BRANCH_ACTIVITY
      );

      const branchLatestComm2 = await readFileLines(branchActivityPath, 1).then(
        (commit) => commit.split("&")[0]
      );
      if (!branchLatestComm2) {
        console.error("Branch: " + branch2[1] + " has no commits made");
        process.exit(1);
      }

      const versionPath2 = path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_REPO,
        branchLatestComm2
      );
      const versionStore2 = path.join(versionPath2, "store");
      // Continue only if `branchLatestComm` exists in `.zeet` REPO
      if (!fs.existsSync(versionPath2)) {
        console.error(
          `This revision: ${branchLatestComm2} in branch '${branch2[1]}' is corrupt`
        );
        process.exit(1);
      }

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(zeetParentDir, filePath1),
        newFilePath: path.join(versionStore2, filePath1),
        newFileName: filePath1,
        oldFileName: filePath1,
      });

      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    } else if (
      diffTarget2 &&
      fs.existsSync(
        path.isAbsolute(diffTarget2)
          ? diffTarget2
          : path.join(process.cwd(), diffTarget2)
      )
    ) {
      // If both diffTarget1 and diffTarget2 are files, we'll compare the files with last recent commit in the repository

      let filePath2 = path.isAbsolute(diffTarget2)
        ? diffTarget2
        : path.join(process.cwd(), diffTarget2); // will correctly handle paths like '../../file'
      if (!filePath2.includes(zeetParentDir)) {
        console.error(
          `IKO SHIDA! Path: '${filePath2}' is outside repository at '${zeetParentDir}'`
        );
        process.exit(1);
      }

      // Convert path to relative
      filePath2 = path.relative(zeetParentDir, filePath2);

      const compareFiles = [...new Set([filePath1, filePath2])]; // dedupe incase the same file path is provided twice
      const versionStore2 = zeetParentDir; // working directory

      const mostRecentVersion = await workDirVersionInrepo();
      const versionStore1 = path.join(mostRecentVersion, "store");

      for (let idx = 0; idx < compareFiles.length; idx++) {
        const filePath = compareFiles[idx];

        const modelledPatch = await generateDiff({
          oldFilePath: path.join(versionStore1, filePath),
          newFilePath: path.join(versionStore2, filePath),
          newFileName: filePath,
          oldFileName: filePath,
        });

        if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
      }
    } else if (diffTarget2) {
      displayError(diffTarget2);
      process.exit(1);
    } else {
      const mostRecentVersion = await workDirVersionInrepo();
      const versionStore1 = path.join(mostRecentVersion, "store");
      const versionStore2 = zeetParentDir; // working directory

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(versionStore1, filePath1),
        newFilePath: path.join(versionStore2, filePath1),
        newFileName: filePath1,
        oldFileName: filePath1,
      });

      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    }
  } else if (diffTarget1) {
    displayError(diffTarget1);
    process.exit(1);
  }
  // Default action is to Diff the work dir and most recent commit
  else {
    const mostRecentVersion = await workDirVersionInrepo();
    const versionStore1 = path.join(mostRecentVersion, "store");
    const versionStore2 = zeetParentDir;
    const recentCommitFiles = await Promise.all([
      getFilePathsUnderDir(undefined, versionStore1),
      getFilePathsUnderDir(undefined, versionStore2),
    ]).then(([files, filesInWorkDir]) => [
      ...new Set([...files, ...filesInWorkDir]),
    ]);

    for (let idx = 0; idx < recentCommitFiles.length; idx++) {
      const filePath = recentCommitFiles[idx];

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(versionStore1, filePath),
        newFilePath: path.join(versionStore2, filePath),
        oldFileName: filePath,
        newFileName: filePath,
      });

      // Log changes(if any) on the console
      if (modelledPatch) LOG_OUTPUT += modelledPatch + "\n";
    }
  }

  LOG_OUTPUT
    ? termPager.viewContent(LOG_OUTPUT)
    : console.log("No changes found");
};

function displayError(term: string) {
  console.error(`${styleText("red", "Argument: " + term + " is unknown.")}
The argument is neither a revision nor an existent file path under this repo.
Use a revision from 'zeet log' or branch from 'zeet branch'. Or a valid file path under this repository`);
}

function isCommitId(id: string) {
  if (!id) return false;

  const versionComplex = id.split("&");

  const isValidId = versionComplex.every((version) => {
    return validCommitPattern.test(version);
  });

  return isValidId;
}

function getBranch(branchName: string, projectRoot: string) {
  if (!branchName) return;
  const branchMapsFilePath = path.resolve(
    projectRoot,
    ZEET_DIRNAME,
    ZEET_BRANCH,
    `${ZEET_BRANCH_MAPPER}.json`
  );

  try {
    const branchMappings: [string, string][] = JSON.parse(
      fs.readFileSync(branchMapsFilePath, "utf-8")
    );

    const branch = branchMappings.find(
      (branchMap) => branchMap[1] === branchName
    );

    return branch;
  } catch (error) {
    return;
  }
}

async function generateDiff({
  oldFilePath,
  newFilePath,
  oldFileName = "File 1",
  newFileName = "File 2",
}: {
  oldFilePath: string;
  newFilePath: string;
  oldFileName?: string;
  newFileName?: string;
}): Promise<string | undefined> {
  let oldFilePathContents: string = "";
  try {
    oldFilePathContents = await fs.promises.readFile(oldFilePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
      const fsErr = error as NodeJS.ErrnoException;

      if (fsErr.code === "ENOENT") {
        oldFilePathContents = "";
      }
    }
  }

  let newFilePathContents: string = "";
  try {
    newFilePathContents = await fs.promises.readFile(newFilePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
      const fsErr = error as NodeJS.ErrnoException;

      if (fsErr.code === "ENOENT") {
        newFilePathContents = "";
      }
    }
  }

  const fileCreated =
    oldFilePathContents.length <= 0 && newFilePathContents.length > 0;
  const fileDeleted =
    oldFilePathContents.length > 0 && newFilePathContents.length <= 0;

  const patchDiff = Diff.structuredPatch(
    oldFileName,
    newFileName,
    oldFilePathContents,
    newFilePathContents
  );

  const modelledPatch = colorizeAndStringifyPatch(patchDiff, {
    fileDeleted,
    fileCreated,
  });

  return modelledPatch;
}

function colorizeAndStringifyPatch(
  patchDiff: Diff.ParsedDiff,
  opt: { fileCreated?: boolean; fileDeleted?: boolean } = {}
): string | undefined {
  // Check if there are any hunks with changes
  const hasChanges = patchDiff.hunks.some((hunk) =>
    hunk.lines.some((line) => line.startsWith("+") || line.startsWith("-"))
  );

  // If no changes, return null
  if (!hasChanges) {
    return undefined;
  }

  // Start with the header
  let patchString = styleText(
    "bold",
    `diff --zeet a/${patchDiff.oldFileName} b/${patchDiff.newFileName}\n`
  );
  // patchString += styleText("bold", `--- a/${patchDiff.oldFileName}\n`);
  patchString += styleText(
    "bold",
    `--- ${opt.fileCreated ? "/dev/null" : "a/" + patchDiff.oldFileName}\n`
  );
  patchString += styleText(
    "bold",
    `+++ ${opt.fileDeleted ? "/dev/null" : "b/" + patchDiff.newFileName}\n`
  );

  patchDiff.hunks.sort((a, b) => a.oldStart - b.oldStart);
  // Add each hunk
  patchDiff.hunks.forEach((hunk) => {
    // Construct hunk header
    patchString += styleText(
      "blue",
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`
    );
    // Construct apply color to hunk body
    hunk.lines.forEach((line) => {
      // console.log("Line in coloredPatch:", line);
      if (line.startsWith("-")) patchString += styleText("red", line + "\n");
      else if (line.startsWith("+"))
        patchString += styleText("green", line + "\n");
      else patchString += line + "\n";
    });
  });

  return patchString;
}
