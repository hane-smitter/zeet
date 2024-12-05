#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve("package.json")).toString()
);
const MYGIT_DIRNAME = ".mygit";
const MYGIT_STAGING = "STAGING";

yargs(hideBin(process.argv))
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
    (argv) => {
      const files = argv.files;

      if (Array.isArray(files)) {
        const stgFiles = [...files] as string[];
        // if (argv.verbose) {}

        // Look up specified files on the disk
        const fileExistenceInfo = stgFiles.map((file) => {
          let existentFile: { path: string; exists: boolean } | null;
          try {
            fs.readFileSync(file);
            existentFile = { path: file, exists: true };
          } catch (error) {
            existentFile = { path: file, exists: false };
          }

          return existentFile;
        });

        // Write existent files to staging file(inside `.mygit`)
        try {
          for (let i = 0; i < fileExistenceInfo.length; i++) {
            const item = fileExistenceInfo[i];
            if (!item.exists) continue;

            // Write existent file paths to staging file(inside `.mygit`)
            fs.appendFileSync(
              path.resolve(MYGIT_DIRNAME, MYGIT_STAGING),
              item.path + "\n"
            );
          }

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

            console.log(`\n\nNot Found\n═════════${skippedPaths.join("")}`);
          }
        } catch (error) {
          console.log("Error updating staging index:", error);
        }
      }
    }
  )
  .demandCommand(1, "You must provide a valid command")
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .parse();
