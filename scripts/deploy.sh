#!/usr/bin/env bash
# Build the app, upload the release to S3 and install it on the instance via SSM.
#
#   scripts/deploy.sh                    deploy current working tree
#   SEED_PASSWORD=... scripts/deploy.sh  also create the demo farm (demo@example.com and three more accounts)
#   ALLOW_SIGNUP=false scripts/deploy.sh  close (or reopen with "true") public sign-up; kept when unset
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

tf() { terraform -chdir=infra output -raw "$1"; }
BUCKET=$(tf releases_bucket)
INSTANCE=$(tf instance_id)
URL=$(tf url)
REGION=${AWS_REGION:-eu-central-1}
VERSION=$(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo "-dirty")

echo "==> build ($VERSION)"
npm run build >/dev/null

echo "==> package"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar -czf "$STAGE/release.tgz" \
  package.json package-lock.json \
  packages/shared/package.json \
  apps/web/package.json apps/web/dist \
  apps/api/package.json apps/api/dist apps/api/drizzle

echo "==> upload s3://$BUCKET"
aws s3 cp "$STAGE/release.tgz" "s3://$BUCKET/releases/history/$(date +%Y%m%d%H%M%S)-$VERSION.tgz" --only-show-errors
aws s3 cp "$STAGE/release.tgz" "s3://$BUCKET/releases/current.tgz" --only-show-errors
aws s3 cp infra/install-release.sh "s3://$BUCKET/releases/install-release.sh" --only-show-errors

echo "==> wait for SSM agent on $INSTANCE"
for _ in $(seq 1 60); do
  STATUS=$(aws ssm describe-instance-information --region "$REGION" \
    --filters "Key=InstanceIds,Values=$INSTANCE" --query 'InstanceInformationList[0].PingStatus' --output text)
  [ "$STATUS" = "Online" ] && break
  sleep 10
done
[ "$STATUS" = "Online" ] || { echo "instance not reachable via SSM"; exit 1; }

# Wait until first-boot provisioning (cloud-init) has finished.
INSTALLER=/opt/sierra/bin/install-release.sh
INSTALL_ENV=""
if [ -n "${ALLOW_SIGNUP:-}" ]; then
  [[ "$ALLOW_SIGNUP" =~ ^(true|false)$ ]] || { echo "ALLOW_SIGNUP must be true or false"; exit 1; }
  INSTALL_ENV="ALLOW_SIGNUP=$ALLOW_SIGNUP "
fi
CMD="cloud-init status --wait >/dev/null 2>&1 || true; aws s3 cp s3://$BUCKET/releases/install-release.sh $INSTALLER --only-show-errors && chmod 755 $INSTALLER && $INSTALL_ENV$INSTALLER $BUCKET ${SEED_PASSWORD:-}"

echo "==> install release"
CMD_ID=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript --comment "deploy $VERSION" \
  --timeout-seconds 1800 \
  --parameters "$(jq -nc --arg c "$CMD" '{commands: [$c], executionTimeout: ["1800"]}')" \
  --query Command.CommandId --output text)

while true; do
  STATE=$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$STATE" in
    Success) break ;;
    Failed|Cancelled|TimedOut)
      aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" \
        --query '[StandardOutputContent,StandardErrorContent]' --output text
      exit 1 ;;
  esac
  sleep 5
done
aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query StandardOutputContent --output text | tail -3

echo "==> health"
for _ in $(seq 1 30); do
  curl -fsS "$URL/api/health" && echo && break
  sleep 5
done
echo "==> $URL"
