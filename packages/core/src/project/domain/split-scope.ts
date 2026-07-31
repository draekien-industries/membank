import type { Project } from "../../schemas.js";

export interface SplitScopePair {
  local: Project;
  remote: Project;
}

const GIT_URL_PREFIX = /^(https?:\/\/|ssh:\/\/|git:\/\/|git@)/;

function isGitUrl(origin: string): boolean {
  return GIT_URL_PREFIX.test(origin);
}

// A repo that gains an `origin` after membank first sees it re-hashes from its
// filesystem root to its remote URL, forking into a second project. The two halves
// keep the same derived name, which is the only signal available after the fact.
export function findSplitScopePairs(projects: readonly Project[]): SplitScopePair[] {
  const byName = new Map<string, Project[]>();
  for (const project of projects) {
    if (project.origin === null) continue;
    const group = byName.get(project.name);
    if (group === undefined) {
      byName.set(project.name, [project]);
    } else {
      group.push(project);
    }
  }

  const pairs: SplitScopePair[] = [];
  for (const group of byName.values()) {
    const remotes = group.filter((p) => p.origin !== null && isGitUrl(p.origin));
    const locals = group.filter((p) => p.origin !== null && !isGitUrl(p.origin));
    const [remote] = remotes;
    const [local] = locals;
    if (remotes.length !== 1 || locals.length !== 1) continue;
    if (remote === undefined || local === undefined) continue;
    pairs.push({ local, remote });
  }
  return pairs;
}
