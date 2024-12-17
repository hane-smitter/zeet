import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { type ArgumentsCamelCase } from "yargs";

import resolveRoot from "../utils/resolveRoot";
import {
  MYGIT_ACTIVE_BRANCH,
  MYGIT_BRANCH,
  MYGIT_BRANCH_ACTIVITY,
  MYGIT_BRANCH_MAPPER,
  MYGIT_DIRNAME,
  MYGIT_HEAD,
  MYGIT_MESSAGE,
  MYGIT_REPO,
} from "../constants";
import { createScreen } from "../utils/screen";
import { readFileLines } from "../utils/readFileLines";

export const log = async (argv: ArgumentsCamelCase<{}>) => {
  const myGitParentDir = resolveRoot.find();
  const branchMappings = await fs.promises
    .readFile(
      path.join(
        myGitParentDir,
        MYGIT_DIRNAME,
        MYGIT_BRANCH,
        `${MYGIT_BRANCH_MAPPER}.json`
      ),
      "utf-8"
    )
    .then((branchMaps): [string, string][] => {
      return JSON.parse(branchMaps);
    });
  const branchMappingsObj = Object.fromEntries(branchMappings);

  /** Checked out branch */
  const coBranch = await getActiveBranch(myGitParentDir, branchMappings);

  // If no checked out branch, then `.mygit` repo set up is corrupted/altered
  if (!coBranch) {
    console.error(styleText("red", "IKO SHIDA! Repository is corrupted."));
    process.exit(1);
  }

  const { computedName, enteredName } = coBranch;
  const activeBranchActivityPath = path.join(
    myGitParentDir,
    MYGIT_DIRNAME,
    MYGIT_BRANCH,
    computedName,
    MYGIT_BRANCH_ACTIVITY
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
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_REPO,
      versionRepo
    );

    // 1. Get version stats
    const versionDirInfo = await fs.promises.stat(repoDirPath);
    // 2. Get version message
    const versionMsg = (
      await fs.promises.readFile(
        path.join(repoDirPath, "meta", MYGIT_MESSAGE),
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
  const branchesPath = path.join(myGitParentDir, MYGIT_DIRNAME, MYGIT_BRANCH);
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
      myGitParentDir,
      MYGIT_DIRNAME,
      MYGIT_BRANCH,
      branchName
    );
    const branchActivityFile = path.join(branchPath, MYGIT_BRANCH_ACTIVITY);

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

  for (let idx = 0; idx < commitDetails.length; idx++) {
    const commitDetail = commitDetails[idx];
    let commitToken = commitDetails[idx].commitId;
    const thisCommitPointers = sharedPointers
      .filter((commPointer) => commPointer.tipCommit === commitDetail.commitId)
      .map((groupComm) => groupComm.enteredName);

    // TAGS to color output on terminal screen: {yellow-fg}{bold}...{/bold}{/yellow-fg}
    const withHead =
      idx === 0
        ? `{blue-fg}{bold}HEAD{/bold}{/blue-fg} -> ${coBranch.enteredName}, `
        : "";
    if (thisCommitPointers.length) {
      commitToken = `{yellow-fg}{bold}${commitToken} ({/bold}{/yellow-fg}${withHead}${thisCommitPointers.join(
        ", "
      )}{yellow-fg}{bold}){/bold}{/yellow-fg}`;
    } else {
      commitToken = withHead
        ? `{yellow-fg}{bold}${commitToken} ({/bold}{/yellow-fg}${withHead.replace(
            /,\s+?/,
            ""
          )}{yellow-fg}{bold}){/bold}{/yellow-fg}`
        : commitToken;
    }
    commitDetails[idx].commitId = commitToken;
  }

  const { addMsg } = createScreen();
  //   addMsg("YOUR COMMITS \n\n");
  for (let idx = 0; idx < commitDetails.length; idx++) {
    const history = commitDetails[idx];
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
    const commitDate = new Intl.DateTimeFormat("en-KE", options).format(
      history.created
    );

    const logOutput = `Commit: ${history.commitId}
Date: {blue-fg}${commitDate}{/blue-fg}
\t${history.message}`;

    addMsg(logOutput);
  }
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
    const headFilePath = path.join(projectRoot, MYGIT_DIRNAME, MYGIT_HEAD);
    const headContents = await fs.promises
      .readFile(headFilePath, "utf-8")
      .then((content) => content.split("@"));
    sysNamedBranch = headContents[0].trim();

    if (sysNamedBranch) {
      branchInfo.computedName = sysNamedBranch;
      branchInfo.enteredName = branchMappingsObj[sysNamedBranch];
      return branchInfo;
    }

    // 2. Read active branch from Branches in `.mygit`
    const activeBranchFile = path.join(
      projectRoot,
      MYGIT_DIRNAME,
      MYGIT_BRANCH,
      MYGIT_ACTIVE_BRANCH
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
