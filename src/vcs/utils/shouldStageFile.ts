import { isModifiedFile } from "./isModifiedFile";
import { isUntrackedFile } from "./isUntrackedFile";

export async function shouldStageFile(filePath: string) {
  let shouldStage = "";
  const isUntracked = await isUntrackedFile(filePath);

  if (!isUntracked) {
    const isModified = await isModifiedFile(filePath);
    isModified && (shouldStage = `M:${filePath}`);
  } else if (isUntracked) {
    shouldStage = `U:${filePath}`;
  }

  return shouldStage;
}
