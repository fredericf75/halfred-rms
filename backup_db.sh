#!/bin/bash
# Hourly backup of rms.db to GitHub
set -e

cd /home/frederic/projects/halfred-rms

# Only backup if db changed since last commit
if git diff --quiet rms.db rms.db-shm rms.db-wal 2>/dev/null; then
  exit 0
fi

git add rms.db
[ -f rms.db-shm ] && git add rms.db-shm
[ -f rms.db-wal ] && git add rms.db-wal
git commit -m "Auto-backup: rms.db ($(date '+%Y-%m-%d %H:%M:%S'))" || true
git push origin main || true
