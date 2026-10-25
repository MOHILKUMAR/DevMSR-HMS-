# syntax=docker/dockerfile:1
# Backup, restore and log upload tools: pg_dump and psql 17 (matching the database's major version),
# age for encryption and rclone for R2 or any S3-compatible store. Built by deploy/deploy.sh as
# hms-backup:<tag>. Build from the repo root: docker build -f deploy/backup/Dockerfile .
FROM postgres:17-alpine
RUN apk add --no-cache age rclone bash curl
COPY deploy/backup/hms-backup.sh /usr/local/bin/hms-backup
COPY deploy/sql/check-number-series.sql deploy/sql/restore-checks.sql /usr/local/share/hms/
# The image's own postgres user, never root. The work folder is a volume or tmpfs.
USER postgres
ENV HOME=/tmp BACKUP_WORK_DIR=/work
ENTRYPOINT ["hms-backup"]
