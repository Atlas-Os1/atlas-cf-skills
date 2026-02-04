#!/bin/bash
# Capture OpenAI baseline responses for comparison

set -e

BASELINE_DIR="$(dirname "$0")/../baselines"
mkdir -p "$BASELINE_DIR"

echo "📊 Capturing OpenAI baseline responses..."

# Test queries covering all agent capabilities
TEST_QUERIES=(
  "What is Kiamichi Biz Connect?"
  "How do I add my business to the directory?"
  "What categories are available?"
  "Write a 100-word description for a local bakery"
  "Update the home page hero text to 'Welcome to Kiamichi'"
  "Schedule a Facebook post for tomorrow at 9 AM"
  "How many businesses are in the directory?"
  "Tell me about the first business"
  "Can you help me with SEO for my listing?"
  "What social media platforms do you support?"
)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BASELINE_FILE="$BASELINE_DIR/openai_baseline_$TIMESTAMP.jsonl"

echo "Saving to: $BASELINE_FILE"

for i in "${!TEST_QUERIES[@]}"; do
  QUERY="${TEST_QUERIES[$i]}"
  echo "[$((i+1))/${#TEST_QUERIES[@]}] Testing: $QUERY"
  
  # Call current KBC business agent (OpenAI)
  RESPONSE=$(curl -s https://app.kiamichibizconnect.com/api/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"messages\": [{
        \"role\": \"user\",
        \"content\": \"$QUERY\"
      }]
    }")
  
  # Save response with metadata
  echo "{
    \"query\": \"$QUERY\",
    \"response\": $RESPONSE,
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"model\": \"gpt-4o-mini\"
  }" >> "$BASELINE_FILE"
  
  # Rate limit: 1 req/sec
  sleep 1
done

echo "✅ Baseline captured: $BASELINE_FILE"
echo ""
echo "Summary:"
wc -l "$BASELINE_FILE"
echo ""
echo "Next steps:"
echo "  1. Review baseline responses for quality"
echo "  2. Run migration implementation"
echo "  3. Compare Workers AI responses using compare-responses.sh"
