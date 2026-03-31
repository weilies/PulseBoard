#!/bin/bash
# Safe sync to GitHub with security checks
# Run this when ready: bash scripts/safe-sync-github.sh

set -e

echo "🔒 PulseBox Safe Sync to GitHub"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check for sensitive files
echo ""
echo "Checking for sensitive files..."

SENSITIVE_PATTERNS=(
  ".env"
  ".env.local"
  ".env.*.local"
  "node_modules/"
  ".DS_Store"
  ".git/"
  "*.pem"
  "*.key"
  "*.private"
  ".supabase/"
  "supabase/seed.sql"
)

FOUND_SENSITIVE=0

for file in $(git status --porcelain | awk '{print $2}'); do
  for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if [[ "$file" == *"$pattern"* ]]; then
      echo -e "${RED}⚠️  BLOCKED: $file matches sensitive pattern '$pattern'${NC}"
      FOUND_SENSITIVE=1
    fi
  done
done

if [ $FOUND_SENSITIVE -eq 1 ]; then
  echo -e "${RED}❌ Security check failed. Remove sensitive files before pushing.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ No sensitive files detected${NC}"

# 2. Show what will be pushed
echo ""
echo "Changes to be committed:"
echo "========================"
git status --short
echo ""

# 3. Show diff summary (files only, not content)
echo "Files modified/added/deleted:"
git diff --name-status HEAD...origin/master 2>/dev/null || git diff --name-status || echo "(No unpushed commits yet)"
echo ""

# 4. Confirm before pushing
echo -e "${YELLOW}⚠️  Review the changes above carefully${NC}"
read -p "Continue with push to GitHub? (yes/no): " -r CONFIRM

if [[ ! $CONFIRM =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# 5. Check branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "Current branch: $CURRENT_BRANCH"

# 6. Commit if changes exist
if [ -n "$(git status --porcelain)" ]; then
  echo "Staging changes..."
  git add -A

  read -p "Commit message (or press Enter for auto-message): " -r COMMIT_MSG

  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="chore: sync local changes to GitHub"
  fi

  echo "Committing: '$COMMIT_MSG'"
  git commit -m "$COMMIT_MSG"
else
  echo "No changes to commit."
fi

# 7. Push to remote
echo ""
echo "Pushing to GitHub..."
git push origin $CURRENT_BRANCH

echo ""
echo -e "${GREEN}✅ Sync complete!${NC}"
echo "Branch: $CURRENT_BRANCH"
echo "Repo: $(git config --get remote.origin.url)"
