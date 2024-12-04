#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv)).argv;

yargs(hideBin(process.argv))
  .command(
    "init",
    "Initialize mygit repository",
    (yargs) => {},
    (argv) => {
      const dirLocation = path.resolve(".mygit");
      try {
        // Check if directory already exists
        let dirExists: boolean | undefined;
        try {
          dirExists = Boolean(fs.readdirSync(dirLocation));
        } catch (error) {
          dirExists = false;
        }
        if (dirExists) {
          console.log("Reinitializing mygit!");
          return;
        }

        // Create .mygit directory
        fs.mkdirSync(dirLocation, { recursive: true });
        // Create working file inside .mygit directory
        const workingFilePath = path.resolve(dirLocation, "working");
        fs.writeFileSync(workingFilePath, "");

        console.log("Initialized mygit");
      } catch (error) {
        console.error(
          "Error creating .mygit directory or working file:",
          error
        );
      }
    }
  )
  .command(
    "serve [port]",
    "start the server",
    (yargs) => {
      return yargs.positional("port", {
        describe: "port to bind on",
        default: 5000,
      });
    },
    (argv) => {
      if (argv.verbose) console.info(`start server on :${argv.port}`);
      console.log("argv2_", argv);
    }
  )
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .parse();

console.log("Before");
console.log(argv);
console.log("Hey yoh, CLI stuff is FUN!");
