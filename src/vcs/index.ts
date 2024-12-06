#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yargs, { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { MYGIT_DIRNAME, MYGIT_REPO, MYGIT_STAGING } from "./constants";
import { getFilePathsUnderDir, isModifiedFile, shouldStageFile } from "./utils";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve("package.json")).toString()
);

function confirmRepo(argv: ArgumentsCamelCase) {
  const dirExists = fs.existsSync(path.resolve(MYGIT_DIRNAME));
  const STAGINGExists = fs.existsSync(
    path.resolve(MYGIT_DIRNAME, MYGIT_STAGING)
  );
  const REPOExists = fs.existsSync(path.resolve(MYGIT_DIRNAME, MYGIT_REPO));

  const skippedCommands = ["init"];

  // Check if the current command is in the list of skipped commands
  if (skippedCommands.includes(String(argv._[0]))) {
    return;
  }

  if (!dirExists || !STAGINGExists || !REPOExists) {
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
║  Run '${packageJson.name} --help' for usage info.    ║
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
          dirExists = Boolean(fs.readdirSync(dirLocation));
        } catch (error) {
          dirExists = false;
        }
        if (dirExists) {
          console.log(
            `Reinitialized existing MyGit repository in ${dirLocation}`
          );
          return;
        }

        // Create .mygit directory
        fs.mkdirSync(dirLocation, { recursive: true });
        // Create working file inside .mygit directory
        const workingFilePath = path.resolve(dirLocation, MYGIT_STAGING);
        fs.writeFileSync(workingFilePath, "");
        // Create REPO dir
        const repoPath = path.resolve(dirLocation, MYGIT_REPO);
        fs.mkdirSync(repoPath);

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
      const files = argv.files;

      if (Array.isArray(files)) {
        if (files.length < 1) {
          console.error(
            "No file(s) specified. Use '.' to specify the current directory."
          );
          return;
        }

        let stgFiles = [];
        // If is a dot(`.`), add current directory to staging(modified and untracked files only)
        if (files.includes(".")) {
          const allFilePaths = await getFilePathsUnderDir(); // Will ignores patterns in `.mygitignore` or `.gitignore`

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
            fs.accessSync(file, fs.constants.F_OK);
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
          const stgIndexPath = path.resolve(MYGIT_DIRNAME, MYGIT_STAGING);
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
            "Missing required commit message. Set using --message or -m",
        })
        .check((argv) => {
          if (typeof argv.message !== "string" || argv.message.trim() === "") {
            throw new Error("--message(or -m) must be a non-empty string.");
          }
          return true;
        });
    },
    (argv) => {
      const { message } = argv;

      // Read all paths in `.mygit/STAGING`(staged files)
      try {
        const stagedPaths = fs.readFileSync(
          path.resolve(MYGIT_DIRNAME, MYGIT_STAGING),
          "utf-8"
        );
        const dedupedPaths = [...new Set(stagedPaths.split("\n"))].filter(
          (path) => path !== ""
        );
        if (!dedupedPaths.length) {
          console.log(
            "Nothing to commit.\nAdd files that will be committed. See 'mygit add --help'"
          );
          return;
        }

        // Generate snapshop directory name
        const versionedDirName =
          Math.trunc(Math.random() * 1000000)
            .toString(32)
            .toUpperCase() +
          "_" +
          Date.now().toString();
        const repoBase = path.resolve(MYGIT_DIRNAME, MYGIT_REPO);
        const versionedBase = path.join(repoBase, versionedDirName, "store"); // // Location for version snapshot
        const mygitMsgBase = path.join(repoBase, versionedDirName, "meta"); // Location for message

        // Make Version tracking directory
        fs.mkdirSync(versionedBase, { recursive: true });
        // Make version message directory
        fs.mkdirSync(mygitMsgBase); // not specifying `recursive`

        // Save version message
        fs.writeFileSync(path.join(mygitMsgBase, "MYGITMSG"), message);

        for (let i = 0; i < dedupedPaths.length; i++) {
          const filePath = dedupedPaths[i];
          const dirPath = path.dirname(filePath);

          const filePathContents = fs.readFileSync(filePath, "utf-8");
          if (dirPath) {
            fs.mkdirSync(path.join(versionedBase, dirPath), {
              recursive: true,
            });

            fs.writeFileSync(
              path.join(versionedBase, filePath),
              filePathContents
            );
          } else {
            fs.writeFileSync(
              path.join(versionedBase, filePath),
              filePathContents
            );
          }
        }

        // After commit, reset the staging index
        fs.writeFileSync(path.resolve(MYGIT_DIRNAME, MYGIT_STAGING), "");

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
