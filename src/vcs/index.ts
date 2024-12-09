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
} from "./constants";
import { getFilePathsUnderDir, shouldStageFile } from "./utils";
import { workDirVersionInrepo } from "./utils/workDirVersionInRepo";
import { copyDir } from "./utils/copyDir";
import resolveRoot from "./utils/resolveRoot";

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
        const defBranchPath = path.resolve(
          myGitDirPath,
          MYGIT_BRANCH,
          MYGIT_DEFAULT_BRANCH_NAME
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
        // 5. Create ACTIVE file to track active branch. Default content is written to `MYGIT_DEFAULT_BRANCH_NAME`
        // Meaning it will be the default active branch
        const activeBranchFile = path.resolve(
          myGitDirPath,
          MYGIT_BRANCH,
          MYGIT_ACTIVE_BRANCH
        );
        fs.writeFileSync(activeBranchFile, MYGIT_DEFAULT_BRANCH_NAME, {
          encoding: "utf-8",
        });
        // 6. Create staging file inside `.mygit` directory
        const stgFile = path.resolve(myGitDirPath, MYGIT_STAGING);
        fs.writeFileSync(stgFile, "", { encoding: "utf-8" });
        // 7. Create Head file inside `.mygit` directory
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

        let stgFiles = [];
        // If is a dot(`.`), add current directory to staging(modified and untracked files only)
        if (files.includes(".")) {
          const allFilePaths = await getFilePathsUnderDir(); // Will ignore patterns in `.mygitignore` or `.gitignore`

          const indexableFilePaths = (
            await Promise.all(
              allFilePaths.map(async (filePath) => {
                const shouldStage = await shouldStageFile(filePath);

                return shouldStage ? filePath : null;
              })
            )
          ).filter(Boolean);

          stgFiles = [...indexableFilePaths];
        } else {
          stgFiles = [...files] as string[];
        }

        // if (argv.verbose) {}

        // Look up specified files on the disk
        const fileExistenceInfo = stgFiles.map((file) => {
          let existentFile: { path: string; exists: boolean } | null;
          try {
            // Check if file exists
            fs.accessSync(
              path.resolve(myGitParentDir, file),
              fs.constants.F_OK
            );
            existentFile = { path: file, exists: true };
          } catch (error) {
            existentFile = {
              path: file !== "" ? file : "<empty>",
              exists: false,
            };
          }

          return existentFile;
        });

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
          // Solves case where a file is 'untracked/modified' in previous `mygit add ...`, and now it is undone
          const confirmedIndexables = (
            await Promise.all(
              dedupedStgContent.map(async function (filePath) {
                const isIndexable = await shouldStageFile(filePath);
                return isIndexable ? filePath : null;
              })
            )
          ).filter(Boolean);

          const prunedStgContent = confirmedIndexables.join("\n") + "\n";
          await fs.promises.writeFile(stgIndexPath, prunedStgContent, {
            encoding: "utf-8",
          });

          const skippedPaths = fileExistenceInfo
            .filter((fileInfo) => !fileInfo.exists)
            .map((fileInfo) => "\n" + fileInfo.path);

          if (skippedPaths.length) {
            // Tell about added paths only when we have skipped files
            const addedPaths = confirmedIndexables.map(
              (filePath) => "\n" + filePath
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

        // Generate snapshot directory name
        const new_V_DirName =
          Math.trunc(Math.random() * 1000000)
            .toString(32)
            .toUpperCase() +
          "_" +
          Date.now().toString();
        const repoBase = path.resolve(
          myGitParentDir,
          MYGIT_DIRNAME,
          MYGIT_REPO
        );
        const new_V_Base = path.join(repoBase, new_V_DirName, "store"); // // Location for version snapshot
        const mygitMsgBase = path.join(repoBase, new_V_DirName, "meta"); // Location for snapshot message

        // Make Version tracking directory
        fs.mkdirSync(new_V_Base, { recursive: true });
        // Make version meta directory
        fs.mkdirSync(mygitMsgBase); // not specifying `recursive`

        // Save version message
        fs.writeFileSync(path.join(mygitMsgBase, "MYGITMSG"), message, {
          encoding: "utf-8",
        });

        // Copy a version referenced by `head` before adding new files
        const copyOverVersionDir = await workDirVersionInrepo();
        // If prev vers dir DOES NOT EXIST(e.g in init commit): Copy working directory. NOTE: No need for this, because staging will list all paths(if not in VERSION REPO)
        // Overwrite files in current version dir with file paths from staging
        copyDir(
          path.resolve(repoBase, copyOverVersionDir, "store"),
          new_V_Base
        );

        // Overwrite copied over version with changes from work dir
        for (let i = 0; i < dedupedPaths.length; i++) {
          const wdFilePath = dedupedPaths[i];
          const dirPath = path.dirname(wdFilePath); // If `wdFilePath` is from STAGING, it should be a relative path

          const wdFilePathContents = fs.readFileSync(
            path.resolve(myGitParentDir, wdFilePath),
            "utf-8"
          );

          if (dirPath) {
            // Create `dirPath` replica directory structure
            fs.mkdirSync(path.join(new_V_Base, dirPath), {
              recursive: true,
            });
          }
          // Write file at its `filepath`
          fs.writeFileSync(
            path.join(new_V_Base, wdFilePath),
            wdFilePathContents
          );
        }

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
        // After versioning, update a branch's `ACTIVITY` with the `new_V_DirName`
        // Reading file belonging to a branch that stores pointers
        const existingPointers = fs.readFileSync(
          path.resolve(
            myGitParentDir,
            MYGIT_DIRNAME,
            MYGIT_BRANCH,
            currentActiveBranch,
            MYGIT_BRANCH_ACTIVITY
          ),
          "utf-8"
        );
        const updatedPointers = new_V_DirName + "\n" + existingPointers;
        fs.writeFileSync(
          path.resolve(
            myGitParentDir,
            MYGIT_DIRNAME,
            MYGIT_BRANCH,
            currentActiveBranch,
            MYGIT_BRANCH_ACTIVITY
          ),
          updatedPointers
        );

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
        .positional("branchName", { describe: "Name of branch to create" })
        .check((argv) => {
          if (
            typeof argv.branchName !== "string" ||
            argv.branchName.trim() === ""
          ) {
            console.error(
              "A non-empty string is required for the branch name."
            );
            process.exit(1);
          }
          return true;
        })
        .check((argv) => {
          if (
            typeof argv.branchName === "string" &&
            !/^[a-zA-Z0-9][-a-zA-Z0-9]*(\/[a-zA-Z0-9][-a-zA-Z0-9]*)?$/.test(
              argv.branchName
            )
          ) {
            console.error("Invalid branch name");
            process.exit(1);
          }
          return true;
        });
    },
    (argv) => {
      const { branchName } = argv;

      // Make new Dir in `mygit` tawi
    }
  )
  .demandCommand(1, "You must provide a valid command")
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .parse();
