#!/bin/bash
# Analyze failures during Workers AI migration

set -e

RESULTS_DIR="$(dirname "$0")/../results"

echo "🔍 Analyzing migration failures..."
echo ""

# Check if results directory exists
if [ ! -d "$RESULTS_DIR" ]; then
  echo "❌ No results found. Run comparison tests first."
  exit 1
fi

# Find latest comparison file
COMPARISON_FILE=$(ls -t "$RESULTS_DIR"/comparison_*.json 2>/dev/null | head -1)
WORKERS_FILE=$(ls -t "$RESULTS_DIR"/workersai_responses_*.jsonl 2>/dev/null | head -1)

if [ -z "$COMPARISON_FILE" ] || [ -z "$WORKERS_FILE" ]; then
  echo "❌ No comparison data found. Run compare-responses.sh first."
  exit 1
fi

echo "Analyzing: $COMPARISON_FILE"
echo ""

# Extract summary
TOTAL=$(jq -r '.summary.total_queries' "$COMPARISON_FILE")
PASSED=$(jq -r '.summary.passed' "$COMPARISON_FILE")
FAILED=$(jq -r '.summary.failed' "$COMPARISON_FILE")
PASS_RATE=$(jq -r '.summary.pass_rate' "$COMPARISON_FILE")

echo "============================================"
echo "Migration Quality Report"
echo "============================================"
echo "Total Queries:     $TOTAL"
echo "Passed (≥90%):     $PASSED"
echo "Failed (<90%):     $FAILED"
echo "Pass Rate:         ${PASS_RATE}%"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo "✅ No failures detected!"
  exit 0
fi

echo "Failed Queries:"
echo "============================================"

# Analyze failure patterns
BASELINE_FILE=$(jq -r '.baseline_file' "$COMPARISON_FILE")

# Extract failed queries (similarity <0.9)
# This would need more sophisticated parsing in production
echo "Review these responses manually:"
echo ""

jq -r '.query' "$WORKERS_FILE" | while read -r QUERY; do
  # Extract responses
  BASELINE=$(jq -r --arg q "$QUERY" '. | select(.query == $q) | .response.content' "$BASELINE_FILE")
  WORKERS=$(jq -r --arg q "$QUERY" '. | select(.query == $q) | .response.content' "$WORKERS_FILE")
  
  # Calculate similarity
  SIMILARITY=$(python3 -c "
import sys
def jaccard(s1, s2):
    w1 = set(s1.lower().split())
    w2 = set(s2.lower().split())
    if not w1 or not w2:
        return 0
    return len(w1 & w2) / len(w1 | w2)

baseline = '''$BASELINE'''
workers = '''$WORKERS'''
print(f'{jaccard(baseline, workers):.2f}')
")
  
  # Only show failures
  if (( $(echo "$SIMILARITY < 0.9" | bc -l) )); then
    echo ""
    echo "Query: $QUERY"
    echo "Similarity: $SIMILARITY"
    echo ""
    echo "OpenAI Response:"
    echo "$BASELINE" | head -c 200
    echo "..."
    echo ""
    echo "Workers AI Response:"
    echo "$WORKERS" | head -c 200
    echo "..."
    echo ""
    echo "----------------------------------------"
  fi
done

echo ""
echo "Common Failure Patterns:"
echo "============================================"

# Analyze failure patterns (basic pattern matching)
echo "Tool execution failures:"
jq -r '.toolCalls // []' "$WORKERS_FILE" | grep -c "null" || echo "0"

echo ""
echo "Recommendations:"
echo "============================================"
echo "  1. Review failed queries above"
echo "  2. Check if Workers AI needs different prompting"
echo "  3. Consider adjusting temperature (current: 0.7)"
echo "  4. Try Llama 3.3 70B if 8B insufficient"
echo "  5. Verify tool schemas are correct"
echo ""
echo "Next steps:"
echo "  - Fix identified issues"
echo "  - Re-run compare-responses.sh"
echo "  - Ensure >90% pass rate before deployment"
