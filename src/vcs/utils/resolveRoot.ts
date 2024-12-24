import path from "path";
import fs from "fs";

import { MYGIT_DIRNAME } from "../constants";

export default class resolveRoot {
  static #currentDir = process.cwd();
  static #rootPath: string | undefined;

  /**
   * Finds the nearest parent directory of `.zeet`
   */
  static find() {
    if (this.#rootPath) {
      return this.#rootPath;
    }

    while (this.#currentDir !== path.parse(this.#currentDir).root) {
      const zeetPath = path.join(this.#currentDir, MYGIT_DIRNAME);

      if (fs.existsSync(zeetPath)) {
        const zeetParent = this.#currentDir;
        this.#rootPath = zeetParent;
        return zeetParent;
      }

      this.#currentDir = path.dirname(this.#currentDir);
    }

    // throw new Error("Could not find 'zeet' root");
    return "";
  }
}
