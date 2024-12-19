import fs from "node:fs";
import path from "node:path";
import type { ArgumentsCamelCase } from "yargs";
import * as Diff from "diff";

import resolveRoot from "../utils/resolveRoot";
import {
  MYGIT_BRANCH,
  MYGIT_BRANCH_MAPPER,
  MYGIT_DIRNAME,
  MYGIT_REPO,
} from "../constants";
import { styleText } from "node:util";
import { workDirVersionInrepo } from "../utils/workDirVersionInRepo";
import { getFilePathsUnderDir } from "../utils";
import { validCommitPattern } from "../utils/regexPatterns";

export const diff = async (
  argv: ArgumentsCamelCase<{ fileOrVersion?: string }>
) => {
  const myGitParentDir = resolveRoot.find();
  const { fileOrVersion } = argv;
  let diffTarget = fileOrVersion || "";
  diffTarget = diffTarget.trim();

  // 1. If `fileOrVersion` is not given diff the workdir with the previous version
  // 2. Identify structure of a version/commit id
  // 3. If `fileOrVersion` is not a 'version/commit id', is it a branch? And if it is, use tip of the branch to compare with work Dir.

  if (!diffTarget) {
    const mostRecentVersion = await workDirVersionInrepo();
    const repoVersionPath = path.join(mostRecentVersion, "store");
    const workDirPath = myGitParentDir;
    const recentCommitFiles = await getFilePathsUnderDir(
      undefined,
      repoVersionPath
    );

    for (let idx = 0; idx < recentCommitFiles.length; idx++) {
      const filePath = recentCommitFiles[idx];
      const repoFilePath = path.join(repoVersionPath, filePath);
      const wdFilePath = path.join(workDirPath, filePath);

      const modelledPatch = await generateDiff({
        oldFilePath: repoFilePath,
        newFilePath: wdFilePath,
        oldFileName: filePath,
        newFileName: filePath,
      });

      // Log changes(if any) on the console
      if (modelledPatch) console.log(modelledPatch);
    }
  }
  // `diffTarget` is a commit
  else if (isCommitId(diffTarget)) {
    // Handle case for a merge commit
    const commitId = diffTarget.split("&")[0];

    const versionPath = path.join(
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_REPO,
      commitId
    );
    const versionStore = path.join(versionPath, "store");
    const workDirPath = myGitParentDir;
    // Continue only if `commitId` exists in `.mygit` REPO
    if (!fs.existsSync(versionPath)) {
      console.error(`This revision: ${commitId} is not known`);
      process.exit(1);
    }

    const versionStoreFiles = await getFilePathsUnderDir(
      undefined,
      versionStore
    );

    for (let idx = 0; idx < versionStoreFiles.length; idx++) {
      const filePath = versionStoreFiles[idx];

      const modelledPatch = await generateDiff({
        oldFilePath: path.join(versionStore, filePath),
        newFilePath: path.join(workDirPath, filePath),
        newFileName: filePath,
        oldFileName: filePath,
      });

      if (modelledPatch) console.log(modelledPatch);
    }
  }
  // `diffTarget` is a file on work dir
  else if (fs.existsSync(diffTarget)) {
  } else {
    const branchMapsFilePath = path.resolve(
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_BRANCH,
      `${MYGIT_BRANCH_MAPPER}.json`
    );

    const branchMappings = await fs.promises
      .readFile(branchMapsFilePath, "utf-8")
      .then((mappings): [string, string][] => JSON.parse(mappings));
    const branchMappingsObj = Object.fromEntries(branchMappings);

    const branch = branchMappings.find(
      (branchMap) => branchMap[1] === diffTarget
    );
    if (!branch) {
      console.error(`${styleText(
        "red",
        "Argument: " + diffTarget + " is unknown"
      )}.
The argument could not be a revision or a file path under this repo.
Find a valid revision using 'mygit log or a branch using 'mygit branch'. Or a file under this repository`);
      process.exit(1);
    }
  }
};

function isCommitId(id: string) {
  const versionComplex = id.split("&");

  const isValidId = versionComplex.every((version) => {
    return validCommitPattern.test(version);
  });

  return isValidId;
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
}): Promise<string | null> {
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
  });

  return modelledPatch;
}

function colorizeAndStringifyPatch(
  patchDiff: Diff.ParsedDiff,
  opt: { fileDeleted?: boolean } = {}
): string | null {
  // Check if there are any hunks with changes
  const hasChanges = patchDiff.hunks.some((hunk) =>
    hunk.lines.some((line) => line.startsWith("+") || line.startsWith("-"))
  );

  // If no changes, return null
  if (!hasChanges) {
    return null;
  }

  // Start with the header
  let patchString = styleText(
    "bold",
    `diff --mygit a/${patchDiff.oldFileName} b/${patchDiff.newFileName}\n`
  );
  patchString += styleText("bold", `--- a/${patchDiff.oldFileName}\n`);
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
