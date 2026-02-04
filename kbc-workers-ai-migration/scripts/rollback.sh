#!/bin/bash
# Emergency rollback to 100% OpenAI

set -e

echo "🚨 ROLLBACK: Reverting to 100% OpenAI"
echo ""

# Confirm rollback
read -p "Are you sure you want to rollback? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback cancelled."
  exit 0
fi

echo "Rolling back..."

# Update environment variable to disable Workers AI
cd /home/flo/kiamichibizconnect
wrangler secret put ENABLE_WORKERS_AI --env production <<< "false"

# Redeploy with 100% OpenAI
wrangler deploy --env production

echo ""
echo "✅ Rollback complete. 100% traffic now on OpenAI."
echo ""
echo "Next steps:"
echo "  1. Investigate issues using analyze-failures.sh"
echo "  2. Fix problems in code"
echo "  3. Test thoroughly in staging"
echo "  4. Retry migration when ready"
