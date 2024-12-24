import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { type ArgumentsCamelCase } from "yargs";

import resolveRoot from "../utils/resolveRoot";
import {
  ANSI_CODES,
  customTab,
  ZEET_ACTIVE_BRANCH,
  ZEET_BRANCH,
  ZEET_BRANCH_ACTIVITY,
  ZEET_BRANCH_MAPPER,
  ZEET_DIRNAME,
  ZEET_HEAD,
  ZEET_MESSAGE,
  ZEET_REPO,
} from "../constants";
import { readFileLines } from "../utils/readFileLines";
import { TerminalPager } from "../utils/terminalPager";

export const log = async (argv: ArgumentsCamelCase<{}>) => {
  const zeetParentDir = resolveRoot.find();
  const branchMappings = await fs.promises
    .readFile(
      path.join(
        zeetParentDir,
        ZEET_DIRNAME,
        ZEET_BRANCH,
        `${ZEET_BRANCH_MAPPER}.json`
      ),
      "utf-8"
    )
    .then((branchMaps): [string, string][] => {
      return JSON.parse(branchMaps);
    });
  const branchMappingsObj = Object.fromEntries(branchMappings);

  /** Checked out branch */
  const coBranch = await getActiveBranch(zeetParentDir, branchMappings);

  // If no checked out branch, then `.zeet` repo set up is corrupted/altered
  if (!coBranch) {
    console.error(styleText("red", "IKO SHIDA! Repository is corrupted."));
    process.exit(1);
  }

  const { computedName, enteredName } = coBranch;
  const activeBranchActivityPath = path.join(
    zeetParentDir,
    ZEET_DIRNAME,
    ZEET_BRANCH,
    computedName,
    ZEET_BRANCH_ACTIVITY
  );
  const branchHistoryLogs = (
    await fs.promises.readFile(activeBranchActivityPath, "utf-8")
  )
    .split(/\r?\n/)
    .filter((log): log is string => Boolean(log));

  if (branchHistoryLogs.length < 1) {
    console.log(
      `No commits made on this branch(${styleText(
        ["blue", "italic"],
        enteredName
      )})`
    );
    process.exit();
  }

  // Read branch's ACTIVITY containing pointers to REPO to derive commit details
  const commitDetails = [];
  for (let idx = 0; idx < branchHistoryLogs.length; idx++) {
    const versionRepo = branchHistoryLogs[idx];
    const repoDirPath = path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_REPO,
      versionRepo
    );

    // 1. Get version stats
    const versionDirInfo = await fs.promises.stat(repoDirPath);
    // 2. Get version message
    const versionMsg = (
      await fs.promises.readFile(
        path.join(repoDirPath, "meta", ZEET_MESSAGE),
        "utf-8"
      )
    ).trim();

    commitDetails.push({
      created: versionDirInfo.ctime,
      commitId: versionRepo,
      message: versionMsg,
    });
  }
  // Sort date in descending order
  commitDetails.sort((a, b) => b.created.getTime() - a.created.getTime());

  // Get names of other branches
  const branchesPath = path.join(zeetParentDir, ZEET_DIRNAME, ZEET_BRANCH);
  const otherBranches = await fs.promises
    .readdir(branchesPath, {
      withFileTypes: true,
    })
    .then((entries) =>
      entries
        .filter(
          (entry) => entry.isDirectory() && entry.name !== coBranch.computedName
        )
        .map((dirEnt) => dirEnt.name)
    );

  // Read the tip commits of other branches
  const otherBranchTips: {
    tipCommit: string;
    computedName: string;
    enteredName: string;
  }[] = [];
  for (let idx = 0; idx < otherBranches.length; idx++) {
    const branchName = otherBranches[idx];
    const branchPath = path.join(
      zeetParentDir,
      ZEET_DIRNAME,
      ZEET_BRANCH,
      branchName
    );
    const branchActivityFile = path.join(branchPath, ZEET_BRANCH_ACTIVITY);

    if (fs.existsSync(branchActivityFile)) {
      const tipCommit = await readFileLines(branchActivityFile, 1);
      otherBranchTips.push({
        tipCommit: tipCommit.trim(),
        computedName: branchName,
        enteredName: branchMappingsObj[branchName],
      });
    }
  }

  // Mark other branch pointers on current branch commits
  // for (let idx = 0; idx < otherBranchTips.length; idx++) {
  //   const element = otherBranchTips[idx];
  // }
  let sharedPointers: {
    tipCommit: string;
    computedName: string;
    enteredName: string;
  }[] = [];
  for (let idx = 0; idx < commitDetails.length; idx++) {
    const commitInfo = commitDetails[idx];
    // if(commitInfo.commitId){}
    otherBranchTips.forEach((otherBr) => {
      if (otherBr.tipCommit === commitInfo.commitId) {
        sharedPointers.push(otherBr);
      }
    });
  }

  // Finding shared commits with other branches and colorizing output
  for (let idx = 0; idx < commitDetails.length; idx++) {
    const commitDetail = commitDetails[idx];
    let commitToken = commitDetails[idx].commitId;

    const thisCommitPointers = sharedPointers
      .filter((commPointer) => commPointer.tipCommit === commitDetail.commitId)
      .map((groupComm) => groupComm.enteredName);

    // Setting colors to terminal output
    const withHead =
      idx === 0
        ? `${styleText(["blue", "bold"], "HEAD")} ${styleText(
            "yellow",
            "->"
          )} ${coBranch.enteredName}, `
        : "";

    if (thisCommitPointers.length) {
      commitToken =
        styleText(["yellow", "bold"], `${commitToken} (`) +
        withHead +
        thisCommitPointers.join(", ") +
        styleText(["yellow", "bold"], ")");
    } else {
      commitToken = withHead
        ? styleText(["yellow", "bold"], `${commitToken} (`) +
          withHead.replace(/,\s+?/, "") +
          styleText(["yellow", "bold"], ")")
        : styleText(["yellow", "bold"], commitToken);
    }
    commitDetails[idx].commitId = commitToken;
  }

  const logPager = new TerminalPager();
  let logContent = "";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  };
  for (let idx = 0; idx < commitDetails.length; idx++) {
    const history = commitDetails[idx];
    const commitDate = new Intl.DateTimeFormat("en-KE", options).format(
      history.created
    );

    const logOutput = `Commit: ${history.commitId}
Date: ${ANSI_CODES.blue}${commitDate}${ANSI_CODES.blueOff}
${customTab + customTab}${history.message}\n`;

    logContent += logOutput;
  }

  logPager.viewColoredContent(logContent);
};

async function getActiveBranch(
  projectRoot: string,
  branchMappings: [string, string][]
) {
  try {
    const branchInfo: { computedName: string; enteredName: string } = {
      computedName: "",
      enteredName: "",
    };
    const branchMappingsObj = Object.fromEntries(branchMappings);
    let sysNamedBranch: string | undefined;

    // 1. Read Head
    const headFilePath = path.join(projectRoot, ZEET_DIRNAME, ZEET_HEAD);
    const headContents = await fs.promises
      .readFile(headFilePath, "utf-8")
      .then((content) => content.split("@"));
    sysNamedBranch = headContents[0].trim();

    if (sysNamedBranch) {
      branchInfo.computedName = sysNamedBranch;
      branchInfo.enteredName = branchMappingsObj[sysNamedBranch];
      return branchInfo;
    }

    // 2. Read active branch from Branches in `.zeet`
    const activeBranchFile = path.join(
      projectRoot,
      ZEET_DIRNAME,
      ZEET_BRANCH,
      ZEET_ACTIVE_BRANCH
    );
    const activeBranch = (
      await fs.promises.readFile(activeBranchFile, "utf-8")
    ).trim();
    if (activeBranch) {
      branchInfo.computedName = activeBranch;
      branchInfo.enteredName = branchMappingsObj[activeBranch];
      return branchInfo;
    }

    return null;
  } catch (error) {
    console.error("Error trying to retrieve active branch: ", error);
    return null;
  }
}
