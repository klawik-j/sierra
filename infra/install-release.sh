#!/bin/bash
# Installs releases/current.tgz on the instance. Uploaded and invoked by scripts/deploy.sh via SSM.
#   [ALLOW_SIGNUP=true|false] install-release.sh <releases-bucket> [seed-password]
set -euo pipefail
BUCKET=$1
SEED_PASSWORD=${2:-}
APP_DIR=/opt/sierra

# Public sign-up switch; the value on the instance is kept when the variable is not passed.
if [ -n "${ALLOW_SIGNUP:-}" ]; then
  sed -i '/^ALLOW_SIGNUP=/d' /etc/sierra.env
  echo "ALLOW_SIGNUP=$ALLOW_SIGNUP" >> /etc/sierra.env
fi

set -a
# shellcheck disable=SC1091
. /etc/sierra.env
set +a

TARGET="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
PREV=$(readlink -f "$APP_DIR/current" || true)
mkdir -p "$TARGET"
aws s3 cp "s3://$BUCKET/releases/current.tgz" /tmp/release.tgz --only-show-errors
tar -xzf /tmp/release.tgz -C "$TARGET"
rm -f /tmp/release.tgz

# npm ci takes minutes on a t4g.nano; reuse dependencies when the lockfile is unchanged.
if [ -n "$PREV" ] && [ -d "$PREV/node_modules" ] && cmp -s "$PREV/package-lock.json" "$TARGET/package-lock.json"; then
  cp -a "$PREV/node_modules" "$TARGET/"
else
  (cd "$TARGET" && HOME=/tmp npm ci --omit=dev --no-audit --no-fund --loglevel=error)
fi
chown -R sierra:sierra "$TARGET"

if [ -n "$SEED_PASSWORD" ]; then
  (cd "$TARGET" && sudo -u sierra env DATABASE_URL="$DATABASE_URL" STORAGE_DRIVER="$STORAGE_DRIVER" S3_BUCKET="$S3_BUCKET" S3_REGION="$S3_REGION" SEED_PASSWORD="$SEED_PASSWORD" node apps/api/dist/db/seed.js)
fi

ln -sfn "$TARGET" "$APP_DIR/current"
systemctl restart sierra
ls -1dt "$APP_DIR"/releases/* | tail -n +4 | xargs -r rm -rf
echo "deployed $TARGET"
