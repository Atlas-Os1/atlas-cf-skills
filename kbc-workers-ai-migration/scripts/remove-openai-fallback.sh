#!/bin/bash
# Remove OpenAI fallback after successful migration

set -e

echo "🧹 Removing OpenAI fallback code"
echo ""
echo "Prerequisites:"
echo "  - 2+ weeks at 100% Workers AI"
echo "  - No quality regressions detected"
echo "  - Error rate <1%"
echo "  - User satisfaction maintained"
echo ""

read -p "Confirm all prerequisites met? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Removal cancelled. Complete prerequisites first."
  exit 0
fi

echo "Removing fallback code..."

# Remove fallbackToOpenAI method from business-agent-do.ts
cd /home/flo/kiamichibizconnect/src/durable-objects

# Create backup
cp business-agent-do.ts business-agent-do.ts.backup

# Remove OpenAI fallback code (sed magic)
sed -i '/private async fallbackToOpenAI/,/^  }/d' business-agent-do.ts

# Remove fallback call from catch block
sed -i 's/return this.fallbackToOpenAI(messages);/throw error;/' business-agent-do.ts

echo "✅ Fallback code removed"

# Remove OpenAI API key secret
echo "Removing OPENAI_API_KEY secret..."
cd /home/flo/kiamichibizconnect
wrangler secret delete OPENAI_API_KEY --env production

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Final steps:"
echo "  1. Review changes: git diff src/durable-objects/business-agent-do.ts"
echo "  2. Run tests: npm test"
echo "  3. Deploy: wrangler deploy --env production"
echo "  4. Verify in production for 24 hours"
echo "  5. Commit changes: git commit -am 'Remove OpenAI fallback'"
