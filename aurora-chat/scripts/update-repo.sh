#!/usr/bin/env bash
# ---------------------------------------------------------------------------------------------
# Aurora Chat: copy this version into your EXISTING Git repository (your GitHub repo's clone),
# so you can push it as an update. Render and Vercel then redeploy automatically and your
# database (users, chats, messages) stays exactly as it is.
#
# Usage (macOS / Linux / Windows "Git Bash"), from inside this new version's folder:
#     bash scripts/update-repo.sh /path/to/your/aurora-chat-repo
#     bash scripts/update-repo.sh /path/to/your/aurora-chat-repo --yes   # also commit + push
#
# What it does:
#   * copies every file of this version over the old one;
#   * deletes only files that belonged to an OLDER Aurora Chat release and were removed since;
#   * never touches: .git, backend/data (local database + uploads), .env files, node_modules,
#     build output, or any file you added yourself.
#   * stages the changes and shows a summary; commits and pushes only if you agree (or --yes).
# ---------------------------------------------------------------------------------------------
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ARG=""
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) DEST_ARG="$arg" ;;
  esac
done

say()  { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ask()  { $ASSUME_YES && return 0; read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy] ]]; }

command -v git >/dev/null 2>&1 || fail "Git is not installed. Get it from https://git-scm.com/downloads"
[ -n "$DEST_ARG" ] || fail "Tell me where your repository is:  bash scripts/update-repo.sh /path/to/your/aurora-chat-repo"
[ -d "$DEST_ARG" ] || fail "Folder not found: $DEST_ARG"
DEST="$(cd "$DEST_ARG" && pwd)"
[ "$DEST" != "$SRC" ] || fail "Run this from the NEW version's folder and point it at your existing repository."
git -C "$DEST" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "$DEST is not a Git repository. Clone your GitHub repo first:  git clone https://github.com/<you>/aurora-chat.git"

if [ ! -f "$DEST/backend/pom.xml" ] || ! grep -q "aurora-chat-backend" "$DEST/backend/pom.xml"; then
  if [ -f "$DEST/aurora-chat/backend/pom.xml" ]; then
    fail "Your project is inside a sub-folder. Run:  bash scripts/update-repo.sh \"$DEST/aurora-chat\""
  fi
  say "Warning: $DEST doesn't look like an Aurora Chat project (no backend/pom.xml)."
  ask "Continue anyway?" || exit 1
fi

if [ -n "$(git -C "$DEST" status --porcelain)" ]; then
  git -C "$DEST" status --short | head -20
  fail "Your repository has uncommitted changes (above). Commit or stash them first, so the update is one clean commit."
fi

app_version() { # the <version> right after <artifactId>aurora-chat-backend</artifactId> (not the Spring Boot parent's)
  sed -n '/<artifactId>aurora-chat-backend<\/artifactId>/,$p' "$1" 2>/dev/null | grep -m1 -oE '<version>[0-9.]+</version>' | sed -E 's/<\/?version>//g' || true
}
OLD_VERSION="$(app_version "$DEST/backend/pom.xml")"
NEW_VERSION="$(app_version "$SRC/backend/pom.xml")"
say "Updating Aurora Chat ${OLD_VERSION:-?} → ${NEW_VERSION:-?} in $DEST"

# Files removed from Aurora Chat in earlier releases (only these are ever deleted).
OBSOLETE_FILES=(
  "docs/screenshots/03-reactions-dark.png"
  "docs/screenshots/04-reply-emoji-light.png"
  "docs/screenshots/05-new-group-dark.png"
  "docs/screenshots/07-mobile-chat-dark.png"
  "docs/screenshots/07-mobile-chat-light.png"
)

copied=0
while IFS= read -r -d '' file; do
  rel="${file#./}"
  mkdir -p "$DEST/$(dirname "$rel")"
  cp -p "$SRC/$rel" "$DEST/$rel"
  copied=$((copied + 1))
done < <(cd "$SRC" && find . -type f \
  -not -path './.git/*' \
  -not -path './frontend/node_modules/*' -not -path './frontend/dist/*' \
  -not -path './backend/target/*' -not -path './backend/data/*' \
  -not -name '.env.local' -not -name '*.log' -not -name '.DS_Store' -print0)

removed=0
for rel in "${OBSOLETE_FILES[@]}"; do
  if git -C "$DEST" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
    git -C "$DEST" rm -q -- "$rel"
    removed=$((removed + 1))
  fi
done

git -C "$DEST" add -A -- .
# Keep the Maven wrapper executable (CI runs ./mvnw), even when committing from Windows.
git -C "$DEST" update-index --chmod=+x -- backend/mvnw 2>/dev/null || true

say ""
say "Copied $copied files, removed $removed obsolete file(s). Changes ready to commit:"
git -C "$DEST" status --short | awk '{print $1}' | sort | uniq -c | sed 's/^/   /'
say ""
say "Untouched: your Git history, backend/data (local database + uploads), .env files, node_modules."

if git -C "$DEST" diff --cached --quiet; then
  say "Nothing changed: this version is already in your repository."
  exit 0
fi

if ask "Commit and push to GitHub now? (Render and Vercel will redeploy automatically)"; then
  git -C "$DEST" commit -q -m "Update Aurora Chat to v${NEW_VERSION:-new}" -m "Photos & videos, push notifications, mobile app, downloads and keep-awake. Database changes are additive: existing data is kept."
  git -C "$DEST" push
  say ""
  say "Pushed. Next: Render → your service → Environment → add CLOUDINARY_URL (see SETUP_AND_DEPLOYMENT.md, Part B)."
else
  say ""
  say "Review with:  cd \"$DEST\" && git diff --cached --stat"
  say "Then publish: git commit -m \"Update Aurora Chat to v${NEW_VERSION:-new}\" && git push"
fi
