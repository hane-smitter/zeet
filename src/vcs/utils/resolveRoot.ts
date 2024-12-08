import path from "path";
import fs from "fs";

import { MYGIT_DIRNAME } from "../constants";

export default class resolveRoot {
  static #currentDir = process.cwd();
  static #rootPath: string | undefined;

  /**
   * Finds the nearest parent directory of `.mygit`
   */
  static find() {
    if (this.#rootPath) {
      return this.#rootPath;
    }

    while (this.#currentDir !== path.parse(this.#currentDir).root) {
      const mygitPath = path.join(this.#currentDir, MYGIT_DIRNAME);

      if (fs.existsSync(mygitPath)) {
        const mygitParent = this.#currentDir;
        this.#rootPath = mygitParent;
        return mygitParent;
      }

      this.#currentDir = path.dirname(this.#currentDir);
    }

    // throw new Error("Could not find 'mygit' root");
    return "";
  }
}
