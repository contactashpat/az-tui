# az-tui
## Azure DevOps PR Viewer — Setup & Usage

Interactive terminal viewer for Azure DevOps pull requests powered by the Azure CLI. List, explore, filter, and open PRs without leaving the terminal.
<img width="2209" height="699" alt="CleanShot 2025-12-15 at 23 38 56" src="https://github.com/user-attachments/assets/66b0ee4f-83fc-40f5-a598-24f75cf241f9" />



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
2) Toggle Field Density (defaults to condensed)
3) Filter by Created By
4) Filter by Reviewer
5) Refresh PR List
h) Help (list options)
q) Exit
```

## View Open Board Tasks
Use `board-tasks.js` to list open Tasks from your Azure Boards project (uses the Azure DevOps CLI defaults for org/project).

```bash
# Show all open tasks
node board-tasks.js

# Filter by title and state (regex, case-insensitive)
node board-tasks.js --name "checkout" --state "Active"

# Override org/project if defaults are not set
node board-tasks.js --org https://dev.azure.com/your-org --project YourProject

# Reduce query size (default last 180 days)
node board-tasks.js --changed-since 90

# Or set environment variables for reuse
export AZURE_DEVOPS_ORG=https://dev.azure.com/your-org
export AZURE_DEVOPS_PROJECT=YourProject
node board-tasks.js

# Run a custom WIQL query (string or file) and control displayed fields
node board-tasks.js --wiql "SELECT [System.Id],[System.WorkItemType],[System.Title],[System.AssignedTo],[System.State],[System.Tags] FROM workitems WHERE [System.TeamProject]='DevOps-SRE'"
# or
cat > /tmp/query.wiql <<'EOF'
SELECT
    [System.Id],
    [System.WorkItemType],
    [System.Title],
    [System.AssignedTo],
    [System.State],
    [System.Tags]
FROM workitems
WHERE
    [System.TeamProject] = 'DevOps-SRE'
    AND [System.ChangedDate] > @startOfDay('-30d')
    AND [System.WorkItemType] = 'Product Backlog Item'
    AND [System.State] = 'In Progress'
    AND [System.AssignedTo] = 'Patil, Ash (INFOSYS) <ash.pat@bp.com>'
EOF
node board-tasks.js --wiql-file /tmp/query.wiql --fields "System.Id,System.WorkItemType,System.Title,System.AssignedTo,System.State,System.Tags"

# Filter by any field (regex, case-insensitive)
# e.g., only items assigned to “Ash”
node board-tasks.js --wiql-file /tmp/query.wiql --filter-field "System.AssignedTo" --filter-value "Ash"

# Interactive filtering (default on): choose a column and enter a regex after the table renders
# Use --no-interactive to disable the prompt loop
node board-tasks.js --wiql-file /tmp/query.wiql
# You can type a column number (1 = first column) or pick from the list, then enter a regex (case-insensitive)
```
