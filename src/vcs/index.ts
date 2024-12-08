#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yargs, { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import {
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_REPO,
  MYGIT_STAGING,
} from "./constants";
import { getFilePathsUnderDir, isModifiedFile, shouldStageFile } from "./utils";
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

  const skippedCommands = ["init"];

  // Check if the current command is in the list of skipped commands
  if (skippedCommands.includes(String(argv._[0]))) {
    return;
  }

  if (!dirExists || !STAGINGExists || !REPOExists || !HEADExists) {
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
    (argv) => {
      const dirLocation = path.resolve(MYGIT_DIRNAME);
      try {
        // Check if directory already exists
        let dirExists: boolean | undefined;
        try {
          dirExists = fs.existsSync(dirLocation);
        } catch (error) {
          dirExists = false;
        }
        if (dirExists) {
          console.warn(
            `Already initialized MyGit repository in ${dirLocation}`
          );
          return;
        }

        // Create `.mygit` directory
        fs.mkdirSync(dirLocation, { recursive: true });
        // Create REPO dir
        const repoPath = path.resolve(dirLocation, MYGIT_REPO);
        fs.mkdirSync(repoPath);
        // Create staging file inside `.mygit` directory
        const stgFilePath = path.resolve(dirLocation, MYGIT_STAGING);
        fs.writeFileSync(stgFilePath, "", { encoding: "utf-8" });
        // Create Head file inside `.mygit` directory
        const headFilePath = path.resolve(dirLocation, MYGIT_HEAD);
        fs.writeFileSync(headFilePath, "", { encoding: "utf-8" });

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
        describe: "file(s) to add to the staging area",
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

          // Read file into array
          const stgContent = await fs.promises.readFile(stgIndexPath, "utf-8");
          const stgContentArr = stgContent.split(/\r?\n/).filter(Boolean);
          // Remove dups
          const stgContentDeduped = [...new Set(stgContentArr)];
          const cycledStgContent = stgContentDeduped.join("\n") + "\n";
          await fs.promises.writeFile(stgIndexPath, cycledStgContent, {
            encoding: "utf-8",
          });

          const skippedPaths = fileExistenceInfo
            .filter((fileInfo) => !fileInfo.exists)
            .map((fileInfo) => "\n" + fileInfo.path);

          if (skippedPaths.length) {
            // Tell about added paths only when we have skipped files
            const addedPaths = fileExistenceInfo
              .filter((fileInfo) => fileInfo.exists)
              .map((fileInfo) => "\n" + fileInfo.path);
            addedPaths.length &&
              console.log(
                `\nAdded to index\n══════════════${addedPaths.join("")}`
              );

            console.error(`\n\nNot Found\n═════════${skippedPaths.join("")}`);
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
      const { message } = argv;

      // Read all paths in `.mygit/STAGING`(staged files)
      try {
        const stagedPaths = fs.readFileSync(
          path.resolve(MYGIT_DIRNAME, MYGIT_STAGING),
          "utf-8"
        );
        const dedupedPaths = [...new Set(stagedPaths.split(/\r?\n/))].filter(
          (path) => path !== ""
        );
        if (!dedupedPaths.length) {
          console.log(
            "Nothing to commit.\nAdd files that will be committed. See 'mygit add --help'"
          );
          return;
        }

        // Generate snapshot directory name
        const new_V_DirName =
          Math.trunc(Math.random() * 1000000)
            .toString(32)
            .toUpperCase() +
          "_" +
          Date.now().toString();
        const repoBase = path.resolve(MYGIT_DIRNAME, MYGIT_REPO);
        const new_V_Base = path.join(repoBase, new_V_DirName, "store"); // // Location for version snapshot
        const mygitMsgBase = path.join(repoBase, new_V_DirName, "meta"); // Location for message

        // Make Version tracking directory
        fs.mkdirSync(new_V_Base, { recursive: true });
        // Make version message directory
        fs.mkdirSync(mygitMsgBase); // not specifying `recursive`

        // Save version message
        fs.writeFileSync(path.join(mygitMsgBase, "MYGITMSG"), message, {
          encoding: "utf-8",
        });

        // Copy a version referenced by `head` before adding new files
        const copyOverVersionDir = await workDirVersionInrepo();
        // If prev vers dir DOES NOT EXIST(e.g in init commit): Copy working directory. NOTE: No need for this, because staging will list all paths(if not in VERSION REPO)
        // Overwrite files in current version dir with file paths from staging
        console.log({
          cpSrc: path.resolve(repoBase, copyOverVersionDir, "store"),
          spDest: new_V_Base,
        });
        copyDir(
          path.resolve(repoBase, copyOverVersionDir, "store"),
          new_V_Base
        );

        for (let i = 0; i < dedupedPaths.length; i++) {
          const wdFilePath = dedupedPaths[i]; // If path is from STAGING, it should be a relative path
          const dirPath = path.dirname(wdFilePath);

          const wdFilePathContents = fs.readFileSync(
            path.resolve(wdFilePath),
            "utf-8"
          );

          if (dirPath) {
            // Prepare directory structure if any
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

        // After commit, reset the staging index
        fs.writeFileSync(path.resolve(MYGIT_DIRNAME, MYGIT_STAGING), "", {
          encoding: "utf-8",
        });
        // After commit, update the `HEAD`
        fs.writeFileSync(
          path.resolve(MYGIT_DIRNAME, MYGIT_HEAD),
          new_V_DirName,
          { encoding: "utf-8" }
        );

        // console.log("stagedPaths SPLIT: ", stagedPaths.split("\n"));
        // console.log({ dedupedPaths });
      } catch (error) {
        console.error("Error occured while doing commit:", error);
      }
      // Copy all these paths to `repository` as per versioned directory
    }
  )
  .demandCommand(1, "You must provide a valid command")
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .parse();
