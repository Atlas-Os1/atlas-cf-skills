#!/bin/bash
# Monitor gradual rollout of Workers AI

TRAFFIC_PERCENT=${1:-10}

if [ -z "$TRAFFIC_PERCENT" ] || [ "$TRAFFIC_PERCENT" -lt 0 ] || [ "$TRAFFIC_PERCENT" -gt 100 ]; then
  echo "Usage: $0 <traffic_percent>"
  echo "Example: $0 10  # Route 10% of traffic to Workers AI"
  exit 1
fi

echo "📊 Monitoring rollout: $TRAFFIC_PERCENT% traffic to Workers AI"
echo "Press Ctrl+C to stop monitoring"
echo ""

RESULTS_DIR="$(dirname "$0")/../results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
METRICS_FILE="$RESULTS_DIR/rollout_metrics_${TRAFFIC_PERCENT}pct_$TIMESTAMP.jsonl"

while true; do
  # Fetch metrics from KBC business agent
  METRICS=$(curl -s https://app.kiamichibizconnect.com/api/metrics)
  
  # Parse metrics
  TOTAL_REQUESTS=$(echo "$METRICS" | jq -r '.total_requests // 0')
  WORKERS_AI_REQUESTS=$(echo "$METRICS" | jq -r '.workers_ai_requests // 0')
  OPENAI_REQUESTS=$(echo "$METRICS" | jq -r '.openai_requests // 0')
  FALLBACK_COUNT=$(echo "$METRICS" | jq -r '.fallback_count // 0')
  ERROR_RATE=$(echo "$METRICS" | jq -r '.error_rate // 0')
  AVG_RESPONSE_TIME=$(echo "$METRICS" | jq -r '.avg_response_time_ms // 0')
  
  # Calculate actual traffic split
  ACTUAL_WORKERS_PCT=0
  if [ "$TOTAL_REQUESTS" -gt 0 ]; then
    ACTUAL_WORKERS_PCT=$(echo "scale=1; $WORKERS_AI_REQUESTS * 100 / $TOTAL_REQUESTS" | bc)
  fi
  
  # Log metrics
  echo "{
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"total_requests\": $TOTAL_REQUESTS,
    \"workers_ai_requests\": $WORKERS_AI_REQUESTS,
    \"openai_requests\": $OPENAI_REQUESTS,
    \"fallback_count\": $FALLBACK_COUNT,
    \"error_rate\": $ERROR_RATE,
    \"avg_response_time_ms\": $AVG_RESPONSE_TIME,
    \"target_traffic_pct\": $TRAFFIC_PERCENT,
    \"actual_workers_pct\": $ACTUAL_WORKERS_PCT
  }" >> "$METRICS_FILE"
  
  # Display current stats
  clear
  echo "============================================"
  echo "Rollout Monitoring: $TRAFFIC_PERCENT% → Workers AI"
  echo "============================================"
  echo ""
  echo "Traffic Split:"
  echo "  Target:  $TRAFFIC_PERCENT% Workers AI"
  echo "  Actual:  $ACTUAL_WORKERS_PCT% Workers AI"
  echo "  Total:   $TOTAL_REQUESTS requests"
  echo ""
  echo "Performance:"
  echo "  Avg Response Time: ${AVG_RESPONSE_TIME}ms"
  echo "  Error Rate:        ${ERROR_RATE}%"
  echo "  Fallback Count:    $FALLBACK_COUNT"
  echo ""
  echo "Model Usage:"
  echo "  Workers AI: $WORKERS_AI_REQUESTS"
  echo "  OpenAI:     $OPENAI_REQUESTS"
  echo ""
  
  # Health checks
  if (( $(echo "$ERROR_RATE > 5" | bc -l) )); then
    echo "⚠️  WARNING: Error rate >5% - consider rollback"
  fi
  
  if [ "$FALLBACK_COUNT" -gt 100 ]; then
    echo "⚠️  WARNING: High fallback count - Workers AI may be unstable"
  fi
  
  if (( $(echo "$AVG_RESPONSE_TIME > 2000" | bc -l) )); then
    echo "⚠️  WARNING: Response time >2s - performance degraded"
  fi
  
  echo ""
  echo "Metrics logged to: $METRICS_FILE"
  echo "Last updated: $(date)"
  
  sleep 30
done
