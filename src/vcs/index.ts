#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yargs, { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import {
  MYGIT_BRANCH,
  MYGIT_DEFAULT_BRANCH_NAME,
  MYGIT_BRANCH_ACTIVITY,
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_REPO,
  MYGIT_STAGING,
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH_MAPPER,
} from "./constants";
import { getFilePathsUnderDir, shouldStageFile } from "./utils";
import { workDirVersionInrepo } from "./utils/workDirVersionInRepo";
import { copyDir } from "./utils/copyDir";
import resolveRoot from "./utils/resolveRoot";
import { randomUUID } from "node:crypto";
import { synchronizeDestWithSrc } from "./utils/synchronizeDestWithSrc";
import { merge } from "./providers/merge";
import { prepNewVersionDir } from "./utils/prepNewVersionDir";
import { commitCloseRoutine } from "./utils/commitCloseRoutine";
import { log } from "./providers/log";
import { diff } from "./providers/diff";

function confirmRepo(argv: ArgumentsCamelCase) {
  const myGitParentDir = resolveRoot.find();

  const dirExists = fs.existsSync(path.resolve(myGitParentDir, MYGIT_DIRNAME));
  const STAGINGExists = fs.existsSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_STAGING)
  );
  const HEADExists = fs.existsSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_HEAD)
  );
  const REPOExists = fs.existsSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_REPO)
  );
  const BRANCHExists = fs.existsSync(
    path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_BRANCH)
  );

  const skippedCommands = ["init"];

  // Check if the current command is in the list of skipped commands
  if (skippedCommands.includes(String(argv._[0]))) {
    return;
  }

  if (
    !dirExists ||
    !STAGINGExists ||
    !REPOExists ||
    !HEADExists ||
    !BRANCHExists
  ) {
    console.error("IKO SHIDA! Not a MyGit repository");
    process.exit(1);
  }
}

yargs(hideBin(process.argv))
  .middleware(confirmRepo)
  .command("* ", false, {}, (argv) => {
    console.log(
      `
╔══════════════════════════════════════════════════════╗
║  🌟 Welcome! Please specify a valid command.         ║
║  Run 'mygit --help' for usage info.                  ║
╚══════════════════════════════════════════════════════╝
  `.trim()
    );
  })
  .command(
    "init",
    "Initialize mygit repository",
    (yargs) => {},
    async (argv) => {
      const myGitDirPath = path.resolve(MYGIT_DIRNAME);
      try {
        // Check if directory already exists
        let dirExists: boolean = fs.existsSync(myGitDirPath);
        if (dirExists) {
          console.warn(
            `Already initialized MyGit repository in ${myGitDirPath}`
          );
          process.exit(1);
        }

        // 1. Create `.mygit` directory
        fs.mkdirSync(myGitDirPath, { recursive: true });
        // 2. Create REPO dir
        const repoPath = path.resolve(myGitDirPath, MYGIT_REPO);
        fs.mkdirSync(repoPath);

        // 3.  Create BRANCH dir & Create Default BRANCH dir
        const defaultBranchName = randomUUID();
        const defBranchPath = path.resolve(
          myGitDirPath,
          MYGIT_BRANCH,
          defaultBranchName
        );
        fs.mkdirSync(defBranchPath, { recursive: true });
        // 4. Create ACTIVITY file that will include a branch's POINTERs
        const branchActivityFile = path.resolve(
          defBranchPath,
          MYGIT_BRANCH_ACTIVITY
        );
        fs.writeFileSync(branchActivityFile, "", {
          encoding: "utf-8",
        });
        // 5. Create ACTIVE file to track active branch. Default content is written to `defaultBranchName`
        // Meaning it will be the default active branch
        const activeBranchFile = path.resolve(
          myGitDirPath,
          MYGIT_BRANCH,
          MYGIT_ACTIVE_BRANCH
        );
        fs.writeFileSync(activeBranchFile, defaultBranchName, {
          encoding: "utf-8",
        });
        // 6. Create branch MAPPER.json
        const mapperFile = path.resolve(
          myGitDirPath,
          MYGIT_BRANCH,
          `${MYGIT_BRANCH_MAPPER}.json`
        );
        const mapperContents = [[defaultBranchName, MYGIT_DEFAULT_BRANCH_NAME]];
        fs.writeFileSync(mapperFile, JSON.stringify(mapperContents), {
          encoding: "utf-8",
        });

        // 7. Create staging file inside `.mygit` directory
        const stgFile = path.resolve(myGitDirPath, MYGIT_STAGING);
        fs.writeFileSync(stgFile, "", { encoding: "utf-8" });
        // 8. Create Head file inside `.mygit` directory
        const headFile = path.resolve(myGitDirPath, MYGIT_HEAD);
        fs.writeFileSync(headFile, "", { encoding: "utf-8" });

        // await Promise.all(initializationArr);
        // for (const asyncInit of asyncInitArr) {
        //   await asyncInit;
        // }

        console.log("Initialized MyGit repository");
      } catch (error) {
        console.error(`Error initializing ${MYGIT_DIRNAME} directory: `, error);
      }
    }
  )
  .command(
    "add <files...>",
    "Add files to staging area",
    (yargs) => {
      return yargs.positional("files", {
        describe:
          "file(s) to add to the staging area. Use '.' to add current directory.",
      });
    },
    async (argv) => {
      const myGitParentDir = resolveRoot.find();
      const files = argv.files;

      if (Array.isArray(files)) {
        if (files.length < 1) {
          console.error(
            "No file(s) specified. Add file path or use '.' to specify the current directory."
          );
          process.exit(1);
        }

        let stgFiles: string[] = [];
        // If is a dot(`.`), add current directory to staging(modified and untracked files only)
        if (files.includes(".")) {
          const wdFilePaths = await getFilePathsUnderDir(); // Will ignore patterns in `.mygitignore` or `.gitignore`

          // Filter out file paths that did not change
          const indexableFilePaths = await Promise.all(
            wdFilePaths.map(async (filePath) => {
              const shouldStage = await shouldStageFile(filePath);

              return shouldStage || null;
            })
          ).then((filePaths) =>
            filePaths.filter((filePath): filePath is string =>
              Boolean(filePath)
            )
          );

          // NOTE: There's need to find files from previous REPO snapshot, to mark which file are deleted
          const nowSnapshotPath = await workDirVersionInrepo().then(
            (vesrionPath) => path.join(vesrionPath, "store")
          );
          // Find files in repo that are not in current list of staging files
          const nowSnapshotFiles = await getFilePathsUnderDir(
            undefined,
            nowSnapshotPath
          );
          // const wdFiles = await getFilePathsUnderDir();
          // const deletedFiles = [...new Set([...nowSnapshotFiles, ...wdFilePaths])];
          const deletedFiles = nowSnapshotFiles
            .filter((snapshotfile) => {
              return !wdFilePaths.includes(snapshotfile);
            })
            .map((deletedFile) => `D:${deletedFile}`);

          stgFiles = [...indexableFilePaths, ...deletedFiles];
        } else {
          const decoratedFilePaths = await Promise.all(
            files.map(async (filePath) => {
              let fileToStage = path.isAbsolute(filePath)
                ? filePath
                : path.join(process.cwd(), filePath); // will correctly handle paths like '../../file'
              if (!fileToStage.includes(myGitParentDir)) {
                console.error(
                  `IKO SHIDA! Path: '${fileToStage}' is outside repository at '${myGitParentDir}'`
                );
                process.exit(1);
              }
              // Convert path to relative
              filePath = path.relative(myGitParentDir, filePath);

              let shouldStage = "";
              try {
                shouldStage = await shouldStageFile(filePath);
              } catch (error) {
                if (
                  error instanceof Error &&
                  (error as NodeJS.ErrnoException).code
                ) {
                  const fsError = error as NodeJS.ErrnoException;

                  // If error is due to file not found Allow to proceed with a decorator of `u`.
                  // It will be filtered in the next steps as `not found`
                  if (fsError.code === "ENOENT") {
                    shouldStage = `U:${filePath}`;
                  }
                }
              }

              return shouldStage || null;
            })
          ).then((filePaths) =>
            filePaths.filter((filePath): filePath is string =>
              Boolean(filePath)
            )
          );

          stgFiles = [...decoratedFilePaths];
        }

        // Look up specified files on the disk
        const fileExistenceInfo = await Promise.all(
          stgFiles.map(async (unsanitizedFile) => {
            const file = unsanitizedFile.split(":");
            let existentFile: {
              path: string;
              exists: boolean;
            } | null;

            try {
              // Check if file exists; but skip check for 'D' marked file paths
              if (file[0] !== "D")
                await fs.promises.access(
                  path.resolve(myGitParentDir, file[1]),
                  fs.constants.F_OK
                );

              existentFile = { path: unsanitizedFile, exists: true };
            } catch (error) {
              existentFile = {
                path: unsanitizedFile !== "" ? unsanitizedFile : "<empty>",
                exists: false,
              };
            }

            return existentFile;
          })
        );

        // Write existent files to staging file(inside `.mygit`)
        try {
          const stgIndexPath = path.resolve(
            myGitParentDir,
            MYGIT_DIRNAME,
            MYGIT_STAGING
          );
          let stgNewContent = "";
          for (let i = 0; i < fileExistenceInfo.length; i++) {
            const item = fileExistenceInfo[i];
            if (!item.exists) continue;

            // Record paths of existent files to be moved to staging index
            stgNewContent = stgNewContent + item.path + "\n";
          }

          // Write existent paths to staging index
          await fs.promises.appendFile(stgIndexPath, stgNewContent, {
            encoding: "utf-8",
          });

          // Read STAGING file into array
          const stgContent = await fs.promises.readFile(stgIndexPath, "utf-8");
          const stgContentArr = stgContent.split(/\r?\n/).filter(Boolean);

          // 1. Remove dups
          const dedupedStgContent = [...new Set(stgContentArr)];
          // 2. Confirm the files paths are indexable
          // Solves case where a file is 'untracked/modified' in previous `mygit add ...`, and now it is undone(in current mygit add ...)
          const confirmedIndexables = await Promise.all(
            dedupedStgContent.map(async function (filePath) {
              const file = filePath.split(":");
              const indexablePath =
                file[0] === "D" ? filePath : await shouldStageFile(file[1]);
              return indexablePath || null;
            })
          ).then((filePaths) =>
            filePaths.filter((filePath): filePath is string =>
              Boolean(filePath)
            )
          );

          const prunedStgContent = confirmedIndexables.join("\n") + "\n";
          await fs.promises.writeFile(stgIndexPath, prunedStgContent, {
            encoding: "utf-8",
          });

          // Files that were not found on disk
          const skippedPaths = fileExistenceInfo
            .filter((fileInfo) => !fileInfo.exists)
            .map((fileInfo) => "\n" + fileInfo.path.split(":")[1]);

          if (skippedPaths.length) {
            // Tell about added paths only when we have skipped files
            const addedPaths = confirmedIndexables.map(
              (filePath) => "\n" + filePath.split(":")[1]
            );
            addedPaths.length &&
              console.log(
                `\nAdded to index\n══════════════${addedPaths.join("")}`
              );

            console.error(`\nNot Found\n═════════${skippedPaths.join("")}`);
          }
        } catch (error) {
          console.error("Error updating staging index:", error);
        }
      }
    }
  )
  .command(
    "commit",
    "Commit files",
    (yargs) => {
      return yargs
        .option("message", {
          alias: "m",
          type: "string",
          description: "Add message to commit",
          demandOption:
            "Commit message is required. Set using --message or -m shorthand",
        })
        .check((argv) => {
          if (typeof argv.message !== "string" || argv.message.trim() === "") {
            console.error(
              "No message was provided. --message(or -m) must be a non-empty string."
            );
            process.exit(1);
          }
          return true;
        });
    },
    async (argv) => {
      const myGitParentDir = resolveRoot.find();
      const { message } = argv;

      // Read all paths in `.mygit/STAGING`(staged files)
      try {
        const stagedPaths = fs.readFileSync(
          path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_STAGING),
          "utf-8"
        );
        const dedupedPaths = [...new Set(stagedPaths.split(/\r?\n/))].filter(
          Boolean
        );
        if (!dedupedPaths.length) {
          console.log(
            "Nothing to commit.\nAdd files that will be committed. See 'mygit add --help'"
          );
          process.exit(1);
        }

        const { repoBase, copyOverVersionDir, new_V_Base, new_V_DirName } =
          await prepNewVersionDir(message);

        // Overwrite copied over version with changes from work dir
        for (let i = 0; i < dedupedPaths.length; i++) {
          // If `wdFilePath` is from STAGING, it should be a relative path
          const [fileMode, wdFilePath] = dedupedPaths[i].split(":");
          // const wdFilePath = dedupedPaths[i];

          let stats: fs.Stats;
          // If mode is 'D', we do not look for the file in work dir since it is not there
          // We instead look for it in REPO, of immediate previous version - that is being replaced
          if (fileMode === "D") {
            stats = await fs.promises.stat(
              path.resolve(repoBase, copyOverVersionDir, "store", wdFilePath)
            );
          } else {
            stats = await fs.promises.stat(
              path.resolve(myGitParentDir, wdFilePath)
            );
          }

          if (stats.isDirectory()) {
            const newSnapshotPath = path.resolve(new_V_Base, wdFilePath);

            if (fileMode === "D") {
              await fs.promises.rm(newSnapshotPath, { recursive: true });
            } else {
              copyDir({
                src: path.resolve(myGitParentDir, wdFilePath),
                dest: newSnapshotPath,
                ignore: true,
              });
            }
          } else if (stats.isFile()) {
            const newSnapshotPath = path.join(new_V_Base, wdFilePath);

            if (fileMode === "D") {
              await fs.promises.unlink(newSnapshotPath);
            } else {
              // `wdFilePath` could be under nested dir structure, and we need to replicate that structure
              const dirPath = path.dirname(wdFilePath);

              const wdFilePathContents = await fs.promises.readFile(
                path.resolve(myGitParentDir, wdFilePath),
                "utf-8"
              );

              if (dirPath) {
                // Create `dirPath`: a replica of work dir directory structure - where file will be written
                await fs.promises.mkdir(path.join(new_V_Base, dirPath), {
                  recursive: true,
                });
              }
              // Write file at its `filepath`
              await fs.promises.writeFile(newSnapshotPath, wdFilePathContents);
              // console.log(`${wdFilePath} is a file`);
            }
          } else {
            console.warn(`skipping non-regular file: ${wdFilePath}`);
            continue;
          }
        }

        commitCloseRoutine(new_V_DirName);

        // console.log("stagedPaths SPLIT: ", stagedPaths.split("\n"));
        // console.log({ dedupedPaths });
      } catch (error) {
        console.error("Error occured while doing commit:", error);
      }
      // Copy all these paths to `repository` as per versioned directory
    }
  )
  .command(
    "branch [branchName]",
    "List, create, or delete branches",
    (yargs) => {
      return yargs
        .positional("branchName", {
          describe: "Name of branch to create",
          type: "string",
        })
        .option("list", {
          alias: "l",
          type: "boolean",
          description: "List branches",
        })
        .option("delete", {
          alias: "d",
          type: "string",
          description: "Delete a branch",
        });
    },
    async (argv) => {
      const { branchName, list, delete: deletion } = argv;
      const myGitParentDir = resolveRoot.find();

      const nowSnapshotFullPath = await workDirVersionInrepo();
      const nowSnapshotTkn = nowSnapshotFullPath
        ? path.relative(
            path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_REPO),
            nowSnapshotFullPath
          )
        : "";
      const checkedOutBranch = await fs.promises.readFile(
        path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_BRANCH,
          MYGIT_ACTIVE_BRANCH
        ),
        "utf-8"
      );
      const branchMapsFilePath = path.resolve(
        myGitParentDir,
        MYGIT_DIRNAME,
        MYGIT_BRANCH,
        `${MYGIT_BRANCH_MAPPER}.json`
      );

      // 1. Create branch
      if (typeof branchName === "string") {
        // Valid git-scm branch names: ^[a-zA-Z0-9][-a-zA-Z0-9]*(\/[a-zA-Z0-9][-a-zA-Z0-9]*)?$
        // Iinvalid directory name: [<>:"/\\|?*\x00-\x1F]+|^\s+|\s+$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$|\.$
        if (!branchName.length) {
          console.error("Invalid. Branch name must be non-empty string");
          process.exit(1);
        }

        const branchToCreate = branchName.trim();
        try {
          const myGitBranchDir = path.resolve(
            myGitParentDir,
            MYGIT_DIRNAME,
            MYGIT_BRANCH
          );

          const branchMappings = await fs.promises
            .readFile(branchMapsFilePath, "utf-8")
            .then((mappings): [string, string][] => JSON.parse(mappings));

          // Check if given branch name already exists
          const branchExists = (function () {
            const found = branchMappings.find(
              ([_systemNamed, userNamed]) => userNamed === branchToCreate
            );

            return Boolean(found);
          })();
          if (branchExists) {
            console.error(
              `The branch: ${branchToCreate}, already exists!.\nSwitch to it with 'mygit switch ${branchToCreate}'`
            );
            process.exit(1);
          }

          const genBranchName = randomUUID();
          branchMappings.push([genBranchName, branchToCreate]);

          // Save the modified mappings
          await fs.promises.writeFile(
            branchMapsFilePath,
            JSON.stringify(branchMappings),
            { encoding: "utf-8" }
          );
          // Make new `<genBranchName>` Dir in `<myGitBranchDir>`
          await fs.promises.mkdir(path.resolve(myGitBranchDir, genBranchName));
          // Make branch's ACTIVITY file with pointer to current snapshot
          await fs.promises.writeFile(
            path.resolve(myGitBranchDir, genBranchName, MYGIT_BRANCH_ACTIVITY),
            nowSnapshotTkn,
            { encoding: "utf-8" }
          );

          console.log("Branch created SUCCESSFULLY.");
        } catch (error) {
          console.error("Error creating branch: ", error);
          process.exit(1);
        }
      }

      // 2. Delete branch
      else if (typeof deletion === "string") {
        const userGivenBranchName = deletion.trim();
        if (userGivenBranchName === "") {
          console.error(
            "Missing branch name. --delete(or -d) must be a non-empty string."
          );
          process.exit(1);
        }

        const branchMappings = await fs.promises
          .readFile(branchMapsFilePath, "utf-8")
          .then((mappings): [string, string][] => JSON.parse(mappings));

        // Get system named equivalent of user named/user given branch name
        const markedBranchMap = branchMappings.find(
          ([_systemNamed, userNamed]) => userNamed === userGivenBranchName
        );
        const markDeleteBranch = markedBranchMap ? markedBranchMap[0] : "";

        try {
          // 1. HEAD/ACTIVE branch should not be `markDeleteBranch`
          if (checkedOutBranch === markDeleteBranch) {
            console.error(
              "CANNOT DELETE. You are 'checked out' on this branch"
            );
            process.exit(1);
          }

          // 2. Find branch by the name specified
          const branchDirContents = await fs.promises.readdir(
            path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_BRANCH),
            {
              withFileTypes: true,
            }
          );
          // Find branch for deletion
          const markedBranchPath = branchDirContents
            .filter((item) => item.isDirectory())
            .map((dirEnt) =>
              path.join(
                path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_BRANCH),
                dirEnt.name
              )
            )
            .find((dirname) => path.basename(dirname) === markDeleteBranch);

          if (!markedBranchPath) {
            console.error(
              "Branch does not exist! See a list with 'mygit branch --list'."
            );
            process.exit(1);
          }

          // `markedBranchPath` is an absolute path
          await fs.promises.rm(markedBranchPath, { recursive: true });

          console.log("Branch DELETED.");
        } catch (error) {
          console.error("Error Deleting branch: ", error);
          process.exit(1);
        }
      }

      // 3. List branches - Also matches when `list` option is provided
      else {
        try {
          const branchMappings = await fs.promises
            .readFile(branchMapsFilePath, "utf-8")
            .then((mappings): [string, string][] => JSON.parse(mappings));
          const branchMappingsObj = Object.fromEntries(branchMappings);

          const branchDirContents = await fs.promises.readdir(
            path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_BRANCH),
            {
              withFileTypes: true,
            }
          );
          // Filter for direct child directories and get their full paths
          const genBranches = branchDirContents
            .filter((item) => item.isDirectory())
            .map((dir) => dir.name);

          const userNamedBranches = genBranches.map((genBranch) => {
            return genBranch === checkedOutBranch
              ? `* ${branchMappingsObj[genBranch]}`
              : branchMappingsObj[genBranch];
          });
          userNamedBranches.sort((a, b) => a.localeCompare(b));

          console.log(`Branches\n════════\n${userNamedBranches.join("\n")}`);
        } catch (error) {
          console.error("Error listing branches: ", error);
          process.exit(1);
        }
      }
    }
  )
  .command(
    "switch <branchName>",
    "switch branches",
    (yargs) => {
      return yargs
        .positional("branchName", {
          type: "string",
          describe: "Branch to switch to",
        })
        .check((argv) => {
          if (
            typeof argv.branchName !== "string" ||
            argv.branchName.trim() === ""
          ) {
            console.error("Branch name must be a non-empty string.");
            process.exit(1);
          }
          return true;
        });
    },
    async (argv) => {
      const myGitParentDir = resolveRoot.find();
      const { branchName } = argv;
      const switchToBranch = branchName!.trim();
      const branchMapsFilePath = path.resolve(
        myGitParentDir,
        MYGIT_DIRNAME,
        MYGIT_BRANCH,
        `${MYGIT_BRANCH_MAPPER}.json`
      );

      try {
        // If files are indexed in staging, reset the index
        const stgIndexPath = path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_STAGING
        );
        const stgIndex = await fs.promises
          .readFile(stgIndexPath, "utf-8")
          .then((filesStr) => filesStr.split(/\r?\n/).filter(Boolean));
        if (stgIndex.length) {
          await fs.promises.writeFile(stgIndexPath, "");
        }

        const branchMappings = await fs.promises
          .readFile(branchMapsFilePath, "utf-8")
          .then((mappings): [string, string][] => JSON.parse(mappings));

        const sysNamedBranchFind = branchMappings.find(function ([
          _systemNamed,
          userNamed,
        ]) {
          return userNamed === switchToBranch;
        });

        const sysNamedBranch = sysNamedBranchFind
          ? sysNamedBranchFind[0]
          : undefined;

        if (!sysNamedBranch) {
          console.error(
            "Branch does not exist! See a list with 'mygit branch --list'."
          );
          process.exit(1);
        }

        const checkedOutBranchPath = path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_BRANCH,
          MYGIT_ACTIVE_BRANCH
        );
        const checkedOutBranch = await fs.promises.readFile(
          checkedOutBranchPath,
          "utf-8"
        );
        if (sysNamedBranch === checkedOutBranch) {
          console.log("Already on branch!");
          process.exit(1);
        }

        const branchDirPath = path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_BRANCH
        );
        // 1. Update ACTIVE branch
        await fs.promises.writeFile(
          path.resolve(branchDirPath, MYGIT_ACTIVE_BRANCH),
          sysNamedBranch,
          { encoding: "utf-8" }
        );

        // 2. Update HEAD
        // Get branch's latest snapshot
        const branchLatestSnapshot = (
          await fs.promises.readFile(
            path.resolve(branchDirPath, sysNamedBranch, MYGIT_BRANCH_ACTIVITY),
            "utf-8"
          )
        ).split(/\r?\n/)[0];
        // console.log({ branchLatestSnapshot });

        if (branchLatestSnapshot) {
          await fs.promises.writeFile(
            path.resolve(myGitParentDir, MYGIT_DIRNAME, MYGIT_HEAD),
            `${sysNamedBranch}@${branchLatestSnapshot}`,
            { encoding: "utf-8" }
          );

          // 3. Pick POINTER from branch's ACTIVITY
          // 4. Reset work dir with contents of pointer
          const snapshotStorePath = path.resolve(
            myGitParentDir,
            MYGIT_DIRNAME,
            MYGIT_REPO,
            branchLatestSnapshot.split("&")[0],
            "store"
          );

          await synchronizeDestWithSrc({
            src: snapshotStorePath,
            dest: myGitParentDir,
          });
        }

        console.log(`Switched to branch: ${switchToBranch}.`);
      } catch (error) {
        console.error("Error switching branch: ", error);
        process.exit(1);
      }
    }
  )
  .command(
    "merge <branchName>",
    "Merge branches",
    (yargs) => {
      return yargs
        .positional("branchName", {
          type: "string",
          describe: "Branch to merge with",
        })
        .check((argv) => {
          if (
            typeof argv.branchName !== "string" ||
            argv.branchName.trim() === ""
          ) {
            console.error("Branch name must be a non-empty string.");
            process.exit(1);
          }
          return true;
        });
    },
    merge
  )
  .command(
    "diff [fileOrVersion]",
    "Show changes between commit and work directory",
    (yargs) => {
      return yargs.positional("fileOrVersion", {
        type: "string",
        describe: "A commit id, or branch or file path",
      });
    },
    diff
  )
  .command("log", "View commit history", (yargs) => {}, log)
  .demandCommand(1, "You must provide a valid command")
  .parse();
