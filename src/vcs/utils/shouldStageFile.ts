import { isModifiedFile } from "./isModifiedFile";
import { isUntrackedFile } from "./isUntrackedFile";

export async function shouldStageFile(filePath: string) {
  const shouldStage = await isUntrackedFile(filePath).then(
    async (isUntracked) => {
      if (!isUntracked) {
        const isModified = await isModifiedFile(filePath);
        return isModified;
      } else {
        return true;
      }
    }
  );

  return shouldStage;
}
