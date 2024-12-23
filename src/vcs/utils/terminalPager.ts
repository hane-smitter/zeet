import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { randomBase32String } from "./crumbleText";

export class TerminalPager {
  getPlatformPager: () => Promise<string>;

  constructor() {
    this.getPlatformPager = async () => {
      if (process.platform === "win32") {
        // Try more-compatible pagers first, then fallback to type
        return (await this.commandExists("more")) ? "more" : "type";
      }
      // On Unix-like systems, prefer less, fallback to more
      return (await this.commandExists("less")) ? "less" : "more";
    };
  }

  async commandExists(command: string): Promise<boolean> {
    try {
      const where = process.platform === "win32" ? "where" : "which";
      await new Promise<void>((resolve, reject) => {
        spawn(where, [command])
          .on("exit", (code) => (code === 0 ? resolve() : reject()))
          .on("error", reject);
      });
      return true;
    } catch {
      return false;
    }
  }

  async viewContent(content: string) {
    try {
      const pager = await this.getPlatformPager();
      let pagerProcess;

      if (process.platform === "win32") {
        if (pager === "more") {
          // Windows more command needs special handling
          pagerProcess = spawn("cmd", ["/c", "more"], {
            stdio: ["pipe", "inherit", "inherit"],
            shell: true,
          });
        } else {
          // Using type command (basic fallback)
          pagerProcess = spawn("cmd", ["/c", "type con | more"], {
            stdio: ["pipe", "inherit", "inherit"],
            shell: true,
          });
        }
      } else {
        // Unix-like systems
        pagerProcess = spawn(
          pager,
          ["-R"] /* -R flag preserves ANSI colors for less */,
          {
            stdio: ["pipe", "inherit", "inherit"],
          }
        );
      }

      return new Promise<void>((resolve, reject) => {
        pagerProcess.on("exit", async () => {
          resolve();
        });

        pagerProcess.on("error", async (err) => {
          reject(err);
        });

        // Write content to stdin and close the stream
        pagerProcess.stdin.write(content);
        pagerProcess.stdin.end();

        // Handle stdin errors
        pagerProcess.stdin.on("error", (err) => {
          reject(err);
        });
      });
    } catch (err) {
      throw err;
    }
  }

  // Support for ANSI colors
  async viewColoredContent(content: string) {
    if (process.platform === "win32") {
      // Enable ANSI colors for Windows
      try {
        // Enable Windows 10+ ANSI support
        execSync(
          'reg query "HKEY_CURRENT_USER\\Console" /v VirtualTerminalLevel',
          { stdio: "ignore" }
        );
      } catch {
        try {
          // Try to enable ANSI support
          execSync(
            'reg add "HKEY_CURRENT_USER\\Console" /v VirtualTerminalLevel /t REG_DWORD /d 1 /f',
            { stdio: "ignore" }
          );
        } catch {
          // If we can't enable ANSI support, strip color codes
          content = content.replace(/\x1b\[[0-9;]*m/g, "");
        }
      }
    }
    return this.viewContent(content);
  }
}
