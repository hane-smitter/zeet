# `zeet` ― A Distributed Source Control System (Git-like)

This project implements a distributed source control system in the style of Git. It is called `zeet`. It provides core functionalities required for version control, such as initializing repositories, staging files, committing changes, and more. The tool is built to manage repositories on the local disk and is designed to be used as a CLI tool.

## Features

- **Initialize Repository**: Create a repository in a directory, with the repository data stored in a `.zeet` subdirectory.
- **Staging Files**: Add files to the staging area. (`zeet add .`)
- **Committing Changes**: Commit staged files with _messages_.
- **Branching**: Create and switch between branches.
- **Merging**: Merge branches with parallel work into mainline. _Fast-forward_ and _3-way merge_ are intelligently used to merge.
- **Conflicts marking**: Conflicts are detected during merge and affected region in files are marked with symbols: `<<<<<<<`, `=======` and `>>>>>>>`.(conflicts require manual resolution)
- **File Ignoring**: Specify files to be ignored during commits in `.zeetignore` file. Will look for `.gitignore` file if missing.
- **Viewing Commit History**: View the commit history with detailed information in a colorized output.
- **Diffs**: View differences between commits and branches.

  ### Upcoming features

  - **Cloning Repositories**: Clone a repository locally, copying the contents of the original repository to a new directory.

The project doesn't yet include advanced features like rebasing or conflict resolution beyond detection, but it covers the essential functionalities of version control systems like Git.

## Software requirements

`zeet` is **platform agnostic**. It runs on node.js.  
You need to ensure you have [_node.js_](https://nodejs.org/en/download/package-manager) installed on your machine. The recommended version is at least version **>=20**.

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/hane-smitter/zeet.git
   cd zeet
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build CLI tool**:

   ```bash
   npm run build
   ```

4. **Link the CLI tool globally**:
   After cloning the project and building, use the `npm link` command to make the tool available globally on your machine.

   ```bash
   npm link
   ```

   This will allow you to use the `zeet` command in any repository.

## Usage

Once the project is linked globally, you can use it directly from the command line. Here are some example commands:

- **Initialize a repository**:

  ```bash
  zeet init
  ```

  This creates a new repository in the current directory, storing the repository data in a `.zeet` subdirectory.

- **Stage files**:

  ```bash
  zeet add <file1> <file2> ...
  ```

  This stages the specified files, preparing them for commit.  
  Alternatively, you can use:

  ```bash
  zeet add .
  ```

- **View commit status**:

  ```bash
  zeet status
  ```

  Shows files added to staging area and those that are not. Convenient to check files that will go into the next commit.

  <figure>
    <img src="https://raw.githubusercontent.com/hane-smitter/zeet/refs/heads/assets/zeet-status-out.jpg" alt="status of changed files" />
    <figcaption>Sample output of <code>zeet status</code></figcaption>
  </figure>

- **Commit changes**:

  ```bash
  zeet commit -m "Commit message"
  ```

  This commits the staged changes with the provided commit message.

- **View commit history**:

  ```bash
  zeet log
  ```

  This displays the commit history, showing commit hashes, messages, and timestamps.

  <figure>
    <img src="https://raw.githubusercontent.com/hane-smitter/zeet/refs/heads/assets/zeet-commit-hist3.jpg" alt="commit history log from CLI too called zeet" />
    <figcaption>Sample output of <code>zeet log</code></figcaption>
  </figure>

- **Create branches**:

  ```bash
  zeet branch <branch-name>
  ```

  This creates a new branch.

  - **Switch branches**:

  ```bash
  zeet switch <branch-name>
  ```

  This switches to a created branch.

- **Merge branches**:

  ```bash
  zeet merge <branch-name>
  ```

  This merges `<branch-name>` into the current checked out branch, with conflict detection.  
  _Fast-forward_ merge strategy is used when history between the branches is linear. _3-way merge_ is used otherwise.

- **View diffs**:

  ```bash
  zeet diff <commit-hash>
  ```

  This shows the differences between working directory and the commit. In place of `<commit-hash>`, you can also specify branch or path to a file under repository.

  <figure>
    <img src="https://raw.githubusercontent.com/hane-smitter/zeet/refs/heads/assets/zeet-diff-out2.jpg" alt="Diff between commits" />
    <figcaption>Sample output of <code>zeet diff</code></figcaption>
  </figure>

  Other than diffing with the working directory, you can also diff between 2 commits, branches or files. For example:

  ```bash
  # Compare changes between commits
  zeet diff <commit-hash1> <commit-hash2>

  # Compare changes between branches
  zeet diff <stem> <feature-branch>

  # Compare differences of 'file1' in working directory with 'file1' in 'feature-branch'
  zeet diff <file1> <feature-branch>

  # Compare changes in files in workdir with the last recent commit
  zeet diff <file1> <file2>
  ```

- **Ignore files**:
  Create a `.zeetignore` file in your repository root and list the files to be ignored.  
  It accepts the same patterns as `git`.

<!-- - **Clone a repository**:
  ```bash
  zeet clone <source-directory> <destination-directory>
  ```
  This clones the repository from the source directory to the destination directory. -->

## Contribution

Feel free to open issues or submit pull requests to contribute to the project. Contributions are welcome!

## License

Distributed under the _MIT_ License. See `LICENSE` for more information.

## Author

[Zacky](https://lookupzach.netlify.app)

---

### Star✨ the REPO👍
