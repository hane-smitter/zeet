import { obfuscate } from "./utils/crumbleText";

export const MYGIT_DIRNAME = ".mygit";
export const MYGIT_STAGING = "STAGING";
export const MYGIT_REPO = "REPO";
export const MYGIT_HEAD = "HEAD";
export const MYGIT_BRANCH = obfuscate("BRANCH");
export const MYGIT_BRANCH_MAPPER = obfuscate("MAPPER");
export const MYGIT_ACTIVE_BRANCH = "ACTIVE";
export const MYGIT_BRANCH_ACTIVITY = "ACTIVITY";
export const MYGIT_DEFAULT_BRANCH_NAME = "stem";
export const MYGIT_MESSAGE = "MYGITMSG";


const COLOR_OFF = "\x1b[39m";
/**Color mapping object for ANSI codes */
export const ANSI_CODES = {
  // Colors
  black: "\x1b[30m",
  blackOff: COLOR_OFF, // Reset to default color

  red: "\x1b[31m",
  redOff: COLOR_OFF, // Reset to default color

  green: "\x1b[32m",
  greenOff: COLOR_OFF, // Reset to default color

  yellow: "\x1b[33m",
  yellowOff: COLOR_OFF, // Reset to default color

  blue: "\x1b[34m",
  blueOff: COLOR_OFF, // Reset to default color

  magenta: "\x1b[35m",
  magentaOff: COLOR_OFF, // Reset to default color

  cyan: "\x1b[36m",
  cyanOff: COLOR_OFF, // Reset to default color

  white: "\x1b[37m",
  whiteOff: COLOR_OFF, // Reset to default color

  // Text styles
  bold: "\x1b[1m",
  boldOff: "\x1b[22m", // Turn off bold

  italic: "\x1b[3m",
  italicOff: "\x1b[23m", // Turn off italic

  reset: "\x1b[0m", // Reset all formatting
};
export const customTab = "  "; // Two whitespace characters
