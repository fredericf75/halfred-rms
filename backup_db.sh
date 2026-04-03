#!/bin/bash
cd /home/frederic/projects/tara-rms
git add -A && git commit -m "Auto-backup: tara_rms.db" >> /tmp/tara-rms-backup.log 2>&1
git push origin main >> /tmp/tara-rms-backup.log 2>&1
echo "[$(date)] Backup complete" >> /tmp/tara-rms-backup.log
