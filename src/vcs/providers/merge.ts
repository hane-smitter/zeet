import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { type ArgumentsCamelCase } from "yargs";
import * as Diff from "diff";

import resolveRoot from "../utils/resolveRoot";
import {
  ZEET_ACTIVE_BRANCH,
  ZEET_BRANCH,
  ZEET_BRANCH_ACTIVITY,
  ZEET_BRANCH_MAPPER,
  ZEET_DIRNAME,
  ZEET_HEAD,
  ZEET_REPO,
} from "../constants";
import { getFilePathsUnderDir } from "../utils";
import { synchronizeDestWithSrc } from "../utils/synchronizeDestWithSrc";
import { prepNewVersionDir } from "../utils/prepNewVersionDir";
import { commitCloseRoutine } from "../utils/commitCloseRoutine";

export const merge = async (
  argv: ArgumentsCamelCase<{
    branchName: string;
  }>
) => {
  // Parlance to understand here
  // Branch1 is the branched you are checked out on
  // Branch2 is the branch you want into you current checkedout branch
  const { branchName } = argv;
  const branchToMerge = branchName.trim();

  const zeetParentDir = resolveRoot.find();
  const zeetBranchDir = path.resolve(
    zeetParentDir,
    ZEET_DIRNAME,
    ZEET_BRANCH
  );

  const branchMapsFilePath = path.resolve(
    zeetParentDir,
    ZEET_DIRNAME,
    ZEET_BRANCH,
    `${ZEET_BRANCH_MAPPER}.json`
  );
  const branchMappings = await fs.promises
    .readFile(branchMapsFilePath, "utf-8")
    .then((mappings): [string, string][] => JSON.parse(mappings));
  const branchMappingsObj = Object.fromEntries(branchMappings);

  // Check if given branch name already exists
  const sysNamedBranch = (function () {
    const found = branchMappings.find(
      ([_systemNamed, userNamed]) => userNamed === branchToMerge
    );

    return found ? found[0] : undefined;
  })();
  if (!sysNamedBranch) {
    console.error(
      `${branchToMerge} is unknown. See 'zeet branch --list' for available branches`
    );
    process.exit(1);
  }

  /**  Active branch: Currently checked out */
  const mergeBranch1 = (
    await fs.promises.readFile(
      path.resolve(zeetBranchDir, ZEET_ACTIVE_BRANCH),
      "utf-8"
    )
  ).split(/\r?\n/)[0];
  /** The 'branch 2' we want to introduce its work onto 'branch 1' */
  const mergeBranch2 = sysNamedBranch;

  const branch_1_Activity = (
    await fs.promises.readFile(
      path.resolve(zeetBranchDir, mergeBranch1, ZEET_BRANCH_ACTIVITY),
      "utf-8"
    )
  ).split(/\r?\n/);
  const branch_1_ActivitySet = new Set(branch_1_Activity);
  const branch_2_Activity = (
    await fs.promises.readFile(
      path.resolve(zeetBranchDir, mergeBranch2, ZEET_BRANCH_ACTIVITY),
      "utf-8"
    )
  ).split(/\r?\n/);

  if (!branch_2_Activity.length) {
    console.error(
      styleText("red", "Branch: " + branchToMerge + " has nothing to merge.")
    );
    process.exit(1);
  }

  const branch_1_tip = branch_1_Activity[0];
  const branch_2_tip = branch_2_Activity[0];
  // const branch_2_Base = branch_2_Activity[branch_2_Activity.length - 1];

  if (branch_2_tip === branch_1_tip) {
    console.log("Already up to date!");
    process.exit();
  }
  // Detect if fast-forward is possible between the branches
  let canFastforward = false;
  /** Common ancestor by index position: btwn `branch1` and `branch2`, deduced from branch2 line */
  let branch2LineCommonBaseIdx: number | -1 = -1;

  // Logic to get common ancestor/base
  // Find index of latest common ancestor
  branch2LineCommonBaseIdx = branch_2_Activity.findIndex((activity) =>
    branch_1_ActivitySet.has(activity)
  );
  // Find if branch 2 commit is directly ahead of branch 1
  canFastforward =
    branch2LineCommonBaseIdx === -1
      ? false
      : branch_1_tip === branch_2_Activity[branch2LineCommonBaseIdx];

  // 1. Do a fast-forward merge
  if (canFastforward && branch2LineCommonBaseIdx !== -1) {
    const orderedBranch_1_activity = [
      ...branch_2_Activity.slice(0, branch2LineCommonBaseIdx), // NOTE: `slice()` does not include `end` in result
      ...branch_1_Activity,
    ];

    // Diffing files
    // Diff files in tip of both branches
    // This merge base is also the tip of branch 1(in fast-forward)
    const mergeBase = branch_2_Activity[branch2LineCommonBaseIdx];
    const brach2Tip = branch_2_Activity[0];
    const branch_1_TipSnapPath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      mergeBase,
      "store"
    );
    const branch_2_TipSnapPath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      brach2Tip,
      "store"
    );

    const br_2_SnapshotFiles = await getFilePathsUnderDir(
      undefined,
      branch_2_TipSnapPath
    );

    for (let idx = 0; idx < br_2_SnapshotFiles.length; idx++) {
      // NOTE: It is possible for branch 2 files to be missing in branch 1. A case where new file were created.
      //   const file_1_Path = br_1_SnapshotFiles[idx];
      //   const file_1_Contents = path.join(branch_1_TipSnapPath, file_1_Path);

      const filePath = br_2_SnapshotFiles[idx];
      const br_2_FileContents = await fs.promises.readFile(
        path.join(branch_2_TipSnapPath, filePath),
        "utf-8"
      );
      // Below file read OP has posssibilty of missing file, So we handle `ENOENT` error code that will be thrown
      let br_1_FileContents = "";
      try {
        br_1_FileContents = await fs.promises.readFile(
          path.join(branch_1_TipSnapPath, filePath),
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsError = error as NodeJS.ErrnoException;

          // If error is due to file not found then it is a new file getting merged
          if (fsError.code === "ENOENT") {
            br_1_FileContents = "";
          }
        } else {
          console.error(
            styleText("red", "An error occurred in ff merge OP:"),
            error
          );
          process.exit(1);
        }
      }

      beautyDiffsPrint(br_1_FileContents, br_2_FileContents, filePath);
    }

    // Update working directory with latest repo changes
    await synchronizeDestWithSrc({
      src: branch_2_TipSnapPath,
      dest: zeetParentDir,
    });

    // Update branch1 activity
    await fs.promises.writeFile(
      path.resolve(zeetBranchDir, mergeBranch1, ZEET_BRANCH_ACTIVITY),
      orderedBranch_1_activity.join("\n")
    );
    // Update HEAD
    const headFilePath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_HEAD
    );
    const headContent = await fs.promises.readFile(headFilePath, "utf-8");
    const newHeadContent = headContent.replace(
      /@.+$/,
      `@${orderedBranch_1_activity[0]}`
    );
    await fs.promises.writeFile(headFilePath, newHeadContent);
  }

  // 2. Do a 3-way merge
  // Get files under 'br 1 tip' and diff against 'base commit'. Also files under 'br 2 tip' and diff against 'base commit'
  else if (branch2LineCommonBaseIdx !== -1) {
    const mergeBase = branch_2_Activity[branch2LineCommonBaseIdx];
    const branch1Tip = branch_1_Activity[0].replace(
      /&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+$/,
      ""
    );
    const branch2Tip = branch_2_Activity[0].replace(
      /&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+&[a-zA-Z0-9_]+$/,
      ""
    );
    /**`REPO` 'store' path to the version pointed by 'common ancestor' between 'branch 1' and 'branch 2' */
    const mergeBaseSnapPath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      mergeBase,
      "store"
    );
    /**`REPO` 'store' path to the version pointed by tip of' branch 1' */
    const branch_1_TipSnapPath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      branch1Tip,
      "store"
    );
    /**`REPO` 'store' path to the version pointed by tip of' branch 2' */
    const branch_2_TipSnapPath = path.resolve(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      branch2Tip,
      "store"
    );

    if (
      `${branch_1_Activity[1]}&${branch2Tip}&${mergeBase}` ===
      branch_1_Activity[0].replace(/^.+?&/, "")
    ) {
      console.log("Already up to date!");
      process.exit();
    }

    if (
      !fs.existsSync(mergeBaseSnapPath) ||
      !fs.existsSync(branch_1_TipSnapPath) ||
      !fs.existsSync(branch_2_TipSnapPath)
    ) {
      console.error(
        styleText("red", "Merge could not complete due to missing repository!")
      );
      process.exit(1);
    }

    const mergeConflicts: {
      file: string;
    }[] = [];
    const mergeCommitMsg = `Merge '${branchMappingsObj[mergeBranch2]}' branch into ${branchMappingsObj[mergeBranch1]}`;

    // console.log({ mergeBaseSnapPath });
    const { repoBase, new_V_Base, new_V_DirName } = await prepNewVersionDir(
      mergeCommitMsg,
      mergeBaseSnapPath
    );

    // Get files under 'br 2 tip' snapshot store, then diff against 'br 1 tip' and 'ancestor/base'
    const br_2_SnapshotFiles = await getFilePathsUnderDir(
      undefined,
      branch_2_TipSnapPath
    );
    for (let i = 0; i < br_2_SnapshotFiles.length; i++) {
      const filePath = br_2_SnapshotFiles[i];

      // Files existing in 'branch 2' may be missing in base/ancestor commit since 'branch 2' may have evolved
      let basePathContents: string | undefined;
      try {
        // NOTE: Contents of Base/ancestor commit is copied to `new_V_Base` that will contain merge commit
        basePathContents = await fs.promises.readFile(
          path.join(new_V_Base, filePath),
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsError = error as NodeJS.ErrnoException;

          // If error is due to file not found then it is a new file getting merged
          if (fsError.code === "ENOENT") {
            basePathContents = "";
          }
        } else {
          console.error(
            styleText("red", "An error occurred in lvl 1 3-way merge OP: "),
            error
          );
          process.exit(1);
        }
      }
      // Files existing in 'branch 2' may be missing in 'branch 1' commit since 'branch 2' may have evolved
      let br1FilePathContents: string | undefined;
      try {
        // NOTE: Contents of Base/ancestor commit is copied to `new_V_Base` that will contain merge commit
        br1FilePathContents = await fs.promises.readFile(
          path.join(branch_1_TipSnapPath, filePath),
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
          const fsError = error as NodeJS.ErrnoException;

          // If error is due to file not found then it is a new file getting merged
          if (fsError.code === "ENOENT") {
            br1FilePathContents = "";
          }
        } else {
          console.error(
            styleText("red", "An error occurred in lvl 1 3-way merge OP: "),
            error
          );
          process.exit(1);
        }
      }
      const br2FilePathContents = await fs.promises.readFile(
        path.join(branch_2_TipSnapPath, filePath),
        "utf-8"
      );

      // Combine the diffs
      // Method prefers newer content when conflicts are detected
      const [mergedContent, isConflicting] = AdvancedFileMerge.mergeFiles(
        basePathContents || "",
        br1FilePathContents || "",
        br2FilePathContents,
        {
          preferNewerChanges: false,
          preserveConflicts: true,
          conflictMarkers: {
            start: `<<<<<<< (${branchMappingsObj[mergeBranch1]})`,
            separator: "=======",
            end: `>>>>>>> (${branchMappingsObj[mergeBranch2]})`,
          },
        }
      );

      // `isConflicting` will be `true` `mergedContent` is marked with conflict markers.
      // When conflicts are solved with newest change automatically, `isConflicting` won't be true in this case.
      if (isConflicting) {
        mergeConflicts.push({ file: filePath });
      }

      const patchApplyPath = path.join(new_V_Base, filePath);
      const dirPath = path.dirname(patchApplyPath);
      const patchApplyPathContents = await fs.promises
        .readFile(patchApplyPath, "utf-8")
        .catch((err) => "");

      if (dirPath && !fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      await fs.promises.writeFile(patchApplyPath, mergedContent, {
        encoding: "utf-8",
      });
      // Log colored diffs summary
      beautyDiffsPrint(patchApplyPathContents, mergedContent, filePath);
    }

    // Synchronize the work dir regardless if conflicts occured or not
    await synchronizeDestWithSrc({
      src: new_V_Base,
      dest: zeetParentDir,
    });

    // If merge conflicts do not exist, we do a merge commit, else we remove the merge version creted while maintaining changes in work dir
    // This is so to allow one to fix conflicts and do their own commit
    if (mergeConflicts.length === 0) {
      // Update head, active branch e.t.c
      // [version][br1][br2][base]
      const mergeCommitNaming = `${new_V_DirName}&${branch1Tip}&${branch2Tip}&${mergeBase}`;
      commitCloseRoutine(mergeCommitNaming);

      console.log(styleText("green", "Merge completed SUCCESSFULY"));
    }
    // Log conflicts that occured
    else if (mergeConflicts.length > 0) {
      // Undo the merge REPO created. NOTE: This will leave changes aplied to files
      await fs.promises.rm(path.join(repoBase, new_V_DirName), {
        recursive: true,
      });

      console.group("Merge encountered conflicts in the following paths:");
      mergeConflicts.forEach((conflict) => {
        console.log(styleText("red", conflict.file));
      });
      console.groupEnd();
      console.log(
        "Changes could not be merged for above path.\nYou can manually fix conflicts at the filepaths, then commit."
      );
    }
  } else {
    console.error(
      styleText(
        ["blackBright", "bgRed"],
        "Branches have unrelated history and could not be merged"
      )
    );
    process.exit(1);
  }
};

function beautyDiffsPrint(
  receivercontent: string,
  producerContents: string,
  filePath: string
) {
  // Console log diffs summary symbols
  const diff = Diff.diffLines(receivercontent, producerContents);
  const editedTkns = diff.reduce(
    (prev, current) => {
      if (current.added) {
        prev.addedCount += 1;
      } else if (current.removed) {
        prev.removedCount += 1;
      }

      return prev;
    },
    {
      addedCount: 0,
      removedCount: 0,
      path: filePath,
    }
  );

  const addedDecoratorSymbol = editedTkns.addedCount
    ? `${Array.from({ length: editedTkns.addedCount }, () => "+").join("")}`
    : "";
  const removedDecoratorSymbol = editedTkns.removedCount
    ? `${Array.from({ length: editedTkns.removedCount }, () => "-").join("")}`
    : "";

  if (addedDecoratorSymbol || removedDecoratorSymbol) {
    console.log(
      `${editedTkns.path} (${
        editedTkns.addedCount + editedTkns.removedCount
      }) │ ${styleText("green", addedDecoratorSymbol)}${styleText(
        "red",
        removedDecoratorSymbol
      )}`
    );
  }
}

// Interfaces for type safety
interface ConflictMarkers {
  start: string;
  separator: string;
  end: string;
}

interface MergeOptions {
  conflictMarkers: ConflictMarkers;
  preserveConflicts: boolean;
  preferNewerChanges: boolean;
}

interface ConflictDetails {
  hunk: Diff.Hunk;
  originalContent: string;
}

class AdvancedFileMerge {
  /**
   * Default merge configuration
   */
  private static defaultOptions: MergeOptions = {
    conflictMarkers: {
      start: "<<<<<<< File1",
      separator: "=======",
      end: ">>>>>>> File2",
    },
    preserveConflicts: false,
    preferNewerChanges: true,
  };

  /**
   * Merge changes from two file contents with intelligent conflict resolution
   * @param baseContent Original file content
   * @param file1Content First modified file content
   * @param file2Content Second modified file content
   * @param options Merge configuration options
   * @returns Merged file content and boolean if conflict occured
   */
  public static mergeFiles(
    baseContent: string,
    file1Content: string,
    file2Content: string,
    options: Partial<MergeOptions> = {}
  ): [string, boolean] {
    // Merge default options with provided options
    const mergeOptions: MergeOptions = {
      ...this.defaultOptions,
      ...options,
      conflictMarkers: {
        ...this.defaultOptions.conflictMarkers,
        ...(options.conflictMarkers || {}),
      },
      preserveConflicts:
        options.preserveConflicts ?? this.defaultOptions.preserveConflicts,
      preferNewerChanges:
        options.preferNewerChanges ?? this.defaultOptions.preferNewerChanges,
    };

    try {
      // Generate structured diffs
      const diff1 = Diff.structuredPatch(
        "base",
        "file1",
        baseContent,
        file1Content
      );
      const diff2 = Diff.structuredPatch(
        "base",
        "file2",
        baseContent,
        file2Content
      );

      // Advanced merge strategy
      return this.intelligentMerge(baseContent, diff1, diff2, mergeOptions);
    } catch (error) {
      console.error("Merge process failed:", error);
      throw error;
    }
  }

  /**
   * Intelligent merge with conflict resolution
   * @param baseContent Original file content
   * @param diff1 Diff from first file
   * @param diff2 Diff from second file
   * @param options Merge options
   * @returns An array of length `2`. Index `1` is Merged content, index `2` is boolean if conflicts happened in the merge
   */
  private static intelligentMerge(
    baseContent: string,
    diff1: Diff.ParsedDiff,
    diff2: Diff.ParsedDiff,
    options: MergeOptions
  ): [string, boolean] {
    let mergedContent = baseContent;
    const conflicts: ConflictDetails[] = [];

    // Combine and sort hunks
    const allHunks = [...diff1.hunks, ...diff2.hunks].sort(
      (a, b) => a.oldStart - b.oldStart
    );

    // Apply patches with conflict detection
    allHunks.forEach((hunk) => {
      try {
        // Try applying the patch
        const patchedContent = Diff.applyPatch(mergedContent, {
          hunks: [hunk],
        });

        // If patch applies cleanly
        if (patchedContent !== false) {
          mergedContent = patchedContent;
        } else {
          // Conflict detected
          conflicts.push({
            hunk,
            originalContent: mergedContent,
          });
        }
      } catch (error) {
        console.warn("Patch application failed:", error);
      }
    });

    // Resolve conflicts
    const hasConflicts = conflicts.length > 0;
    if (hasConflicts) {
      mergedContent = this.resolveConflicts(mergedContent, conflicts, options);
    }

    return [mergedContent, hasConflicts && options.preserveConflicts];
  }

  /**
   * Resolve merge conflicts
   * @param content Current merged content
   * @param conflicts List of conflicts
   * @param options Merge options
   * @returns Content with resolved conflicts
   */
  private static resolveConflicts(
    content: string,
    conflicts: ConflictDetails[],
    options: MergeOptions
  ): string {
    let resolvedContent = content;

    conflicts.forEach((conflict) => {
      if (options.preserveConflicts) {
        // Add conflict markers
        resolvedContent = this.addConflictMarkers(
          resolvedContent,
          conflict,
          options.conflictMarkers
        );
      } else if (options.preferNewerChanges) {
        // Prefer newer changes (in this case, second file's changes)
        resolvedContent = this.preferNewerChanges(resolvedContent, conflict);
      }
    });

    return resolvedContent;
  }

  /**
   * Add conflict markers to unresolved changes
   * @param content Current content
   * @param conflict Conflict details
   * @param markers Conflict marker configuration
   * @returns Content with conflict markers
   */
  private static addConflictMarkers(
    content: string,
    conflict: ConflictDetails,
    markers: ConflictMarkers
  ): string {
    const lines = content.split(/\r?\n/); // Split content into lines
    const { hunk } = conflict;

    // Convert 1-based index to 0-based index for slicing
    const conflictStartIdx = hunk.oldStart - 1;
    const conflictEndIdx = conflictStartIdx + hunk.oldLines;

    // Extract lines before and after the conflict
    const beforeConflict = lines.slice(0, conflictStartIdx).join("\n");
    const afterConflict = lines.slice(conflictEndIdx).join("\n");

    // Extract old (to be removed) and new (to be added) conflicting lines
    const oldConflictingLines = hunk.lines
      .filter((line) => line.startsWith("-")) // Lines to be removed
      .map((line) => line.slice(1).trim()); // Remove '-' and trim whitespace

    const newConflictingLines = hunk.lines
      .filter((line) => line.startsWith("+")) // Lines to be added
      .map((line) => line.slice(1).trim()); // Remove '+' and trim whitespace

    // Construct the conflict-marked section
    const conflictMarkedSection = `${markers.start}
${oldConflictingLines.join("\n")}
${markers.separator}
${newConflictingLines.join("\n")}
${markers.end}`;

    // Combine sections
    return [beforeConflict, conflictMarkedSection, afterConflict]
      .filter(Boolean) // Remove empty sections
      .join("\n");
  }

  /**
   * Prefer newer changes (second file's changes)
   * @param content Current content
   * @param conflict Conflict details
   * @returns Content with newer changes
   */
  private static preferNewerChanges(
    content: string,
    conflict: ConflictDetails
  ): string {
    return content.replace(
      conflict.originalContent,
      conflict.hunk.lines.join("\n")
    );
  }
}
