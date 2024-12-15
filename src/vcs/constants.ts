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

function obfuscate(str: string) {
  //obfuscate by moving the character by the `offset` e.g A -> D
  const offset = 3;
  return str
    .split("")
    .map(function (char) {
      return String.fromCharCode(char.charCodeAt(0) + offset);
    })
    .join("");
}
