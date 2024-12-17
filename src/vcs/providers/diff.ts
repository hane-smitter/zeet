import fs from "node:fs";
import path from "node:path";
import type { ArgumentsCamelCase } from "yargs";
import * as Diff from "diff";

import resolveRoot from "../utils/resolveRoot";
import { MYGIT_BRANCH, MYGIT_BRANCH_MAPPER, MYGIT_DIRNAME } from "../constants";
import { styleText } from "node:util";
import { workDirVersionInrepo } from "../utils/workDirVersionInRepo";
import { getFilePathsUnderDir } from "../utils";

export const diff = async (
  argv: ArgumentsCamelCase<{ fileOrVersion?: string }>
) => {
  const myGitParentDir = resolveRoot.find();
  const { fileOrVersion } = argv;
  let diffPath = fileOrVersion || "";
  diffPath = diffPath.trim();

  // 1. If `fileOrVersion` is not given diff the workdir with the previous version
  // 2. Identify structure of a version/commit id
  // 3. If `fileOrVersion` is not a 'version/commit id', is it a branch? And if it is, use tip of the branch to compare with work Dir.

  if (!diffPath) {
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

      let wdFilePathContents: string = "";
      try {
        wdFilePathContents = await fs.promises.readFile(wdFilePath, "utf-8");
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsErr = error as NodeJS.ErrnoException;

          if (fsErr.code === "ENOENT") {
            wdFilePathContents = "";
          }
        }
      }
      let repoFilePathContents: string = "";
      try {
        repoFilePathContents = await fs.promises.readFile(
          repoFilePath,
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsErr = error as NodeJS.ErrnoException;

          if (fsErr.code === "ENOENT") {
            repoFilePathContents = "";
          }
        }
      }

      const patchDiff = Diff.structuredPatch(
        `${filePath}`,
        `${filePath}`,
        repoFilePathContents,
        wdFilePathContents
      );

      const mouldedPatch = colorizeAndStringifyPatch(patchDiff);

      // Log changes on the console
      if (mouldedPatch) console.log(mouldedPatch);
    }
  } else if (isCommitId(diffPath)) {
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
      (branchMap) => branchMap[1] === diffPath
    );
    if (!branch) {
      console.error(`${styleText(
        "red",
        "Argument: " + diffPath + " is unknown"
      )}.
You provided an argument that could not be a revision or a file path under this repo.
You can find a revision using 'mygit log or a branch using 'mygit branch'. Or specify a file that exists under this repository`);
      process.exit(1);
    }
  }
};

function isCommitId(id: string) {
  const versIdRegex = /^[A-Z2-7]{8}T[0-9]+$/;

  return versIdRegex.test(id);
}

function colorizeAndStringifyPatch(patchDiff: Diff.ParsedDiff): string | null {
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
  patchString += styleText("bold", `+++ b/${patchDiff.newFileName}\n`);

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
