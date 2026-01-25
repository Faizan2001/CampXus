#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Scrub secret-bearing files from git history (DESTRUCTIVE).

This rewrites git history. Use only after you have rotated any leaked keys.

Usage:
  ./scripts/scrub-git-history-secrets.sh --plan
  ./scripts/scrub-git-history-secrets.sh --run [--force-dirty]

What it removes from history (default list):
  - src/js/lib/firebase/env-config.js
  - .env
  - public/env-config.js

Notes:
  - Uses git-filter-repo when available (preferred). Falls back to git filter-branch otherwise.
  - After rewriting history you must force-push to your remote and coordinate with collaborators.
EOF
}

MODE="${1:-}"
FORCE_DIRTY=false

if [[ "${2:-}" == "--force-dirty" ]]; then
  FORCE_DIRTY=true
fi

if [[ "$MODE" != "--plan" && "$MODE" != "--run" ]]; then
  usage
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not inside a git repository."
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DEFAULT_PATHS=(
  "src/js/lib/firebase/env-config.js"
  ".env"
  "public/env-config.js"
)

echo "Repository: $ROOT"
echo
echo "Paths to remove from history:"
for p in "${DEFAULT_PATHS[@]}"; do
  echo "  - $p"
done
echo

if [[ "$MODE" == "--plan" ]]; then
  cat <<'EOF'
Plan (manual checklist):
  1) Rotate any exposed credentials (Firebase + third-party tokens).
  2) Ensure you have a backup (clone, tag, or remote branch).
  3) Run: ./scripts/scrub-git-history-secrets.sh --run
  4) Force-push:
       git push --force --all
       git push --force --tags
  5) Ask all collaborators to re-clone (or hard-reset with care).
EOF
  exit 0
fi

HAVE_FILTER_REPO=true
if ! command -v git-filter-repo >/dev/null 2>&1; then
  HAVE_FILTER_REPO=false
  cat <<'EOF'
⚠️  git-filter-repo is not installed.

Falling back to `git filter-branch` (slower, deprecated by git).

Preferred install options (for next time):
  - macOS (Homebrew): brew install git-filter-repo
  - pip (user):       python3 -m pip install --user git-filter-repo
  - Debian/Ubuntu:    sudo apt-get install git-filter-repo (if available)
EOF
  echo
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  if [[ "$FORCE_DIRTY" != "true" ]]; then
    echo "❌ Working tree is not clean. Commit/stash first, or re-run with --force-dirty."
    exit 1
  fi
  echo "⚠️  Working tree is dirty (continuing due to --force-dirty)."
fi

echo "⚠️  This will rewrite git history. Continue? Type 'rewrite' to proceed:"
read -r CONFIRM
if [[ "$CONFIRM" != "rewrite" ]]; then
  echo "Aborted."
  exit 1
fi

if [[ "$HAVE_FILTER_REPO" == "true" ]]; then
  echo "Rewriting history with git-filter-repo..."
  git filter-repo \
    --force \
    --invert-paths \
    --path "src/js/lib/firebase/env-config.js" \
    --path ".env" \
    --path "public/env-config.js"
else
  echo "Rewriting history with git filter-branch..."
  git filter-branch --force --prune-empty --index-filter \
    "git rm -r --cached --ignore-unmatch src/js/lib/firebase/env-config.js .env public/env-config.js" \
    --tag-name-filter cat -- --all

  cat <<'EOF'

🧹 Cleaning rewritten objects (recommended after filter-branch):
  rm -rf .git/refs/original/
  git reflog expire --expire=now --all
  git gc --prune=now --aggressive
EOF
fi

cat <<'EOF'

✅ Done rewriting local history.

Next steps (manual):
  - Force-push rewritten history:
      git push --force --all
      git push --force --tags
  - Rotate/verify credentials again (Firebase + third-party tokens).
  - Coordinate with collaborators to re-clone or hard-reset safely.
EOF
