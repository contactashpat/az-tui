# az-tui
## Azure DevOps PR Viewer — Setup & Usage

Interactive terminal viewer for Azure DevOps pull requests powered by the Azure CLI. List, explore, filter, and open PRs without leaving the terminal.

## Prerequisites
- Node.js 14+ (or Bun)
- pnpm (or npm)
- Azure CLI
- Azure DevOps CLI extension

## Install Azure CLI (macOS)
```bash
brew install azure-cli
```

Add the Azure DevOps CLI extension:
```bash
az extension add --name azure-devops
az config set extension.dynamic_install_allow_preview=true
az devops --help
```

## Create a Personal Access Token (PAT)
- Go to https://dev.azure.com/<your-organization>
- User avatar → Personal Access Tokens → New Token
- Name it (e.g., pr-viewer-cli), pick expiry, scopes: Code (Read) is required; Work Items (Read) is optional
- Create and copy the token (you will not see it again)

Treat the PAT like a password; never commit it.

## Authenticate Azure DevOps CLI
```bash
az devops login --organization https://dev.azure.com/<your-organization>
```

## Set Default Organization & Project
```bash
az devops configure --defaults \
  organization=https://dev.azure.com/<your-organization> \
  project=<your-project>

# example
az devops configure --defaults organization=https://dev.azure.com/cc-digital project=CodeAlign

az devops configure --list
```

## Install & Run the PR Viewer
```bash
pnpm install
chmod +x pr-interactive.js
```

Add an alias to your shell profile (`.zshrc` or `.bashrc`):
```bash
alias az-pr='node /path/to/your/cloned/repo/pr-interactive.js'
```

## Interactive Menu
```
1) View PR Details
2) Show Less Fields (condensed)
3) Filter by Created By
4) Filter by Reviewer
5) Refresh PR List
6) Exit
```



