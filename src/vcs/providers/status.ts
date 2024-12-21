import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { type ArgumentsCamelCase } from "yargs";

import resolveRoot from "../utils/resolveRoot";
import {
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH,
  MYGIT_BRANCH_MAPPER,
  MYGIT_DIRNAME,
  MYGIT_STAGING,
} from "../constants";
import { getFilePathsUnderDir, shouldStageFile } from "../utils";
import { workDirVersionInrepo } from "../utils/workDirVersionInRepo";

export const status = async (argv: ArgumentsCamelCase<{}>) => {
  const myGitParentDir = resolveRoot.find();
  const customTab = "  "; // Two white spaces

  const wdFilePaths = await getFilePathsUnderDir(); // Will ignore patterns in `.mygitignore` or `.gitignore`
  const wdFilePathsSet = new Set([...wdFilePaths]);

  // 1. Extract paths that have modifications from `wdFilePaths`
  const indexableFilePaths = await Promise.all(
    wdFilePaths.map(async (filePath) => {
      const shouldStage = await shouldStageFile(filePath);

      return shouldStage || null;
    })
  ).then((filePaths) =>
    filePaths.filter((filePath): filePath is string => Boolean(filePath))
  );

  // 2. Detect DELETED files
  const recentCommitPath = await workDirVersionInrepo().then((vesrionPath) =>
    path.join(vesrionPath, "store")
  );
  const recentCommitFiles = await getFilePathsUnderDir(
    undefined,
    recentCommitPath
  );
  const deletedFiles = recentCommitFiles
    .filter((recentCommFile) => {
      return !wdFilePathsSet.has(recentCommFile);
    })
    .map((deletedFile) => `D:${deletedFile}`);

  // 3. Merge findings of 'modified' and 'deleted' files into one array
  const allFileChanges = [...indexableFilePaths, ...deletedFiles];

  // 4. Get Files paths added in staging area
  const stagingFiles = (
    await fs.promises.readFile(
      path.join(myGitParentDir, MYGIT_DIRNAME, MYGIT_STAGING),
      "utf-8"
    )
  )
    .split(/\r?\n/)
    .filter((filePath) => Boolean(filePath));
  const stagingFilesSet = new Set([...stagingFiles]);

  // 5. Separate changed files that are added to staging from those that are not
  const stagedChanges: string[] = [];
  const unstagedChanges: string[] = [];
  allFileChanges.forEach((fileChange) => {
    if (stagingFilesSet.has(fileChange)) stagedChanges.push(fileChange);
    else unstagedChanges.push(fileChange);
  });

  // 6. Logs output
  // 6.1 Log checked out branch
  const activeBranchFilePath = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_BRANCH,
    MYGIT_ACTIVE_BRANCH
  );
  const branchMapsFilePath = path.resolve(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_BRANCH,
    `${MYGIT_BRANCH_MAPPER}.json`
  );

  const activeBranch = (
    await fs.promises.readFile(activeBranchFilePath, "utf-8")
  ).trim();
  const branchMappings = await fs.promises
    .readFile(branchMapsFilePath, "utf-8")
    .then((mappings): [string, string][] => JSON.parse(mappings));

  const coBranch = branchMappings.find(
    (branchMap) => branchMap[0] === activeBranch
  );

  if (coBranch)
    console.log(`Checked out on branch: ${styleText("bold", coBranch[1])}`);

  // 6.2 Log staged changes
  if (stagedChanges.length) {
    console.log("Changes to be committed:");
    let fileStatusOutput: string = "";
    stagedChanges.forEach((staged) => {
      const [mode, relPath] = staged.split(":");

      const absPath = path.resolve(myGitParentDir, relPath);
      const relToCurrDir = path.relative(process.cwd(), absPath);

      switch (mode) {
        case "M":
          fileStatusOutput += `${
            customTab + customTab
          }MODIFIED: ${relToCurrDir}\n`;
          break;
        case "U":
          fileStatusOutput += `${customTab + customTab}NEW: ${relToCurrDir}\n`;
          break;
        case "D":
          fileStatusOutput += `${
            customTab + customTab
          }DELETED: ${relToCurrDir}\n`;
          break;

        default:
          fileStatusOutput += `${customTab + customTab}${staged}\n`;
          break;
      }
    });
    console.log(styleText("green", fileStatusOutput));
  }

  // 6.3 Log unstaged changes
  if (unstagedChanges.length) {
    let changedOutput: string = "";
    let untrackedOutput: string = "";

    unstagedChanges.forEach((unstaged) => {
      const [mode, relPath] = unstaged.split(":");

      const absPath = path.resolve(myGitParentDir, relPath);
      const relToCurrDir = path.relative(process.cwd(), absPath);

      switch (mode) {
        case "M":
          changedOutput += `${
            customTab + customTab
          }MODIFIED: ${relToCurrDir}\n`;
          break;

        case "U":
          untrackedOutput += `${customTab + customTab}NEW: ${relToCurrDir}\n`;
          break;

        case "D":
          changedOutput += `${customTab + customTab}DELETED: ${relToCurrDir}\n`;
          break;

        default:
          changedOutput += `${customTab + customTab}${unstaged}\n`;
          break;
      }
    });

    if (changedOutput.length) {
      console.log(
        `Changes not staged:\n${customTab}(Use 'mygit add <files>...' to stage them)`
      );
      console.log(styleText("red", changedOutput));
    }

    if (untrackedOutput.length) {
      console.log(
        `Untracked Files:\n${customTab}(Use 'mygit add <files>...' to include them in next commit)`
      );
      console.log(styleText("red", untrackedOutput));
    }
  }
};
