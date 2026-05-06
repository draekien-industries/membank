# Ubiquitous Language — Core

## Terms

### Scope
Deprecated. A raw SHA-256 hash of the git remote URL or cwd, previously used to associate a memory with its source location. Replaced by Project and Association.
usage: "Prior to the Project entity, a Scope hash was the only way to group memories by source directory."
related:
  - Project (replaced by)
  - Association (replaced by)

### Association
The relationship between a memory and a project. Adding an association links a memory to a project; removing it unlinks the memory. The correct term for what the UI calls "move" — there is no exclusive transfer of ownership.
usage: "When a user 'moves' a memory to a different project in the dashboard, they are adding and removing Associations."
related:
  - Project (links)
  - GlobalMemory (produced by removing)

### GlobalMemory
aliases: Global Memory
A memory with no project associations. Applies across all contexts. Displayed under a "Global" group in the dashboard.
usage: "A memory saved without any project context becomes a GlobalMemory, visible regardless of which Project the user is working in."
related:
  - Association (produced by removing)
  - Project (independent of)

### Project
A first-class entity representing a working directory. Identified by a hash of its git remote URL or absolute path. Has a human-readable name auto-derived from the repo or directory name. A project has many memories; a memory can belong to many projects.
usage: "When a user opens membank in a new git repo, a Project is created or matched by hashing the remote URL."
related:
  - Association (contains)
