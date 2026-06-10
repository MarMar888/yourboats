# Ship to Main

Use this when an agent needs to get a finished workspace branch onto `main`.

Assumptions:
- The target branch is `origin/main`.
- Vercel deploys from GitHub.
- Vercel MCP is available for deployment/status checks.
- Do not rename the workspace branch.

## Fast Path

1. Check state.

```bash
git status --short --branch
git fetch origin main --prune
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Stop if there are unrelated dirty files you did not create.

2. Run the smallest useful verification.

```bash
pnpm test
pnpm lint
```

If a check fails, decide whether it is caused by this branch:

```bash
git diff origin/main...HEAD -- <path-from-error>
```

Fix failures caused by this branch. If the failure is pre-existing and unrelated, note it clearly and keep going.

3. Review the actual diff.

```bash
git diff origin/main...HEAD
```

Look for accidental env changes, debug logs, secrets, generated files, and unrelated edits.

4. Add a highlight for user-facing features or additions.

If the branch ships a new feature, visible workflow change, or meaningful addition, append a short entry to `lib/highlights.ts` before pushing. Skip this for bug fixes, internal cleanup, tests, refactors, or invisible maintenance.

Keep the highlight user-facing: what changed, why it matters, and where to use it.

5. Commit if needed.

```bash
git add <changed-files>
git commit -m "<short user-facing summary>"
```

6. Push the workspace branch.

```bash
git push -u origin HEAD
```

7. Open or update the PR.

```bash
gh pr view --web || gh pr create --base main --head "$(git branch --show-current)" --fill --web
```

8. Check Vercel with MCP.

Use the Vercel MCP to find the latest deployment for the PR/branch, wait for it to finish, and read the build logs if it fails.

Only debug failures that are caused by this branch. If Vercel fails on a known unrelated issue, report that explicitly with the failing file or log line.

9. Merge after the PR is green and reviewed.

Prefer the repo's normal merge method. If there is no stated preference, use the GitHub UI.

## Keep It Short

- Do not run broad cleanup or refactors during shipping.
- Do not chase unrelated TypeScript, lint, or test failures.
- Do not force-push unless the user explicitly asks.
- Do not deploy by hand if Vercel already deploys from GitHub.
- Final note to the user should include branch, PR/deploy status, checks run, and any unrelated failures.
