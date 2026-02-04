#!/bin/bash
# Compare Workers AI responses to OpenAI baseline

set -e

BASELINE_DIR="$(dirname "$0")/../baselines"
RESULTS_DIR="$(dirname "$0")/../results"
mkdir -p "$RESULTS_DIR"

# Find latest baseline
BASELINE_FILE=$(ls -t "$BASELINE_DIR"/openai_baseline_*.jsonl 2>/dev/null | head -1)

if [ -z "$BASELINE_FILE" ]; then
  echo "❌ No baseline found. Run capture-baseline.sh first."
  exit 1
fi

echo "📊 Comparing Workers AI to baseline: $BASELINE_FILE"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
WORKERS_FILE="$RESULTS_DIR/workersai_responses_$TIMESTAMP.jsonl"
COMPARISON_FILE="$RESULTS_DIR/comparison_$TIMESTAMP.json"

# Extract queries from baseline
QUERIES=$(jq -r '.query' "$BASELINE_FILE")

echo "Running ${#QUERIES[@]} test queries..."

TOTAL=0
PASSED=0
FAILED=0

while IFS= read -r QUERY; do
  ((TOTAL++))
  echo "[$TOTAL] Testing: $QUERY"
  
  # Call Workers AI version
  WORKERS_RESPONSE=$(curl -s https://app.kiamichibizconnect.com/api/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"messages\": [{
        \"role\": \"user\",
        \"content\": \"$QUERY\"
      }]
    }")
  
  # Save response
  echo "{
    \"query\": \"$QUERY\",
    \"response\": $WORKERS_RESPONSE,
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"model\": \"llama-3.1-8b-instruct\"
  }" >> "$WORKERS_FILE"
  
  # Extract baseline response for this query
  BASELINE_RESPONSE=$(jq -r --arg q "$QUERY" '. | select(.query == $q) | .response.content' "$BASELINE_FILE")
  WORKERS_CONTENT=$(echo "$WORKERS_RESPONSE" | jq -r '.content')
  
  # Calculate similarity (basic word overlap for now)
  SIMILARITY=$(python3 -c "
import sys
def jaccard(s1, s2):
    w1 = set(s1.lower().split())
    w2 = set(s2.lower().split())
    if not w1 or not w2:
        return 0
    return len(w1 & w2) / len(w1 | w2)

baseline = '''$BASELINE_RESPONSE'''
workers = '''$WORKERS_CONTENT'''
print(f'{jaccard(baseline, workers):.2f}')
")
  
  # Quality gate: >0.9 similarity
  if (( $(echo "$SIMILARITY >= 0.9" | bc -l) )); then
    ((PASSED++))
    STATUS="✅ PASS"
  else
    ((FAILED++))
    STATUS="❌ FAIL"
  fi
  
  echo "  Similarity: $SIMILARITY - $STATUS"
  
  sleep 1
done <<< "$QUERIES"

# Generate comparison report
cat > "$COMPARISON_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "baseline_file": "$BASELINE_FILE",
  "workers_file": "$WORKERS_FILE",
  "summary": {
    "total_queries": $TOTAL,
    "passed": $PASSED,
    "failed": $FAILED,
    "pass_rate": $(echo "scale=2; $PASSED * 100 / $TOTAL" | bc)
  }
}
EOF

echo ""
echo "============================================"
echo "Comparison Results"
echo "============================================"
echo "Total queries: $TOTAL"
echo "Passed (≥90% similarity): $PASSED"
echo "Failed (<90% similarity): $FAILED"
echo "Pass rate: $(echo "scale=1; $PASSED * 100 / $TOTAL" | bc)%"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All quality gates passed! Ready for deployment."
  exit 0
else
  echo "❌ Quality gates failed. Review failed queries before deployment."
  echo ""
  echo "Failed queries saved to: $WORKERS_FILE"
  echo "Review and adjust prompts/temperature if needed."
  exit 1
fi
