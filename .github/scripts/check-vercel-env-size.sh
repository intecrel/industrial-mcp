#!/bin/bash
# Check Vercel environment variable sizes without exposing values

set -e

echo "🔍 Checking Vercel environment variable sizes..."
echo ""

# Function to check environment size safely (no values exposed)
check_env_size() {
  local environment=$1
  echo "📊 Checking $environment environment:"

  # Pull to temp file to calculate size
  vercel env pull /tmp/.env.$environment --environment=$environment --yes 2>/dev/null || true

  if [ -f /tmp/.env.$environment ]; then
    local size=$(wc -c < /tmp/.env.$environment)
    local size_kb=$(awk "BEGIN {printf \"%.2f\", $size / 1024}")
    local var_count=$(grep -c "=" /tmp/.env.$environment || echo 0)

    echo "  Total size: $size_kb KB ($size bytes)"
    echo "  Variable count: $var_count"

    # Calculate individual var sizes WITHOUT showing values
    echo "  Top 20 variables by size:"
    while IFS='=' read -r key value; do
      if [ -n "$key" ] && [[ ! "$key" =~ ^# ]]; then
        # Calculate size as key=value but don't print the value
        local var_size=$(echo -n "$key=$value" | wc -c)
        echo "$var_size|$key"
      fi
    done < /tmp/.env.$environment | sort -rn | head -20 | awk -F'|' '{print "    " NR ". " $2 " — " $1 " bytes"}'

    rm -f /tmp/.env.$environment
  else
    echo "  ⚠️ Could not pull environment variables"
  fi

  echo ""
}

# Check all environments
check_env_size "production"
check_env_size "preview"
check_env_size "development"

# Calculate total across all environments
echo "📈 Calculating total size across all environments..."
total_size=0
for env in production preview development; do
  vercel env pull /tmp/.env.$env --environment=$env --yes 2>/dev/null || true
  if [ -f /tmp/.env.$env ]; then
    size=$(wc -c < /tmp/.env.$env)
    total_size=$((total_size + size))
    rm -f /tmp/.env.$env
  fi
done

total_kb=$(awk "BEGIN {printf \"%.2f\", $total_size / 1024}")
echo ""
echo "🎯 TOTAL SIZE (all environments): $total_kb KB ($total_size bytes)"
echo "   64KB limit = 65536 bytes"

if [ $total_size -gt 65536 ]; then
  over_kb=$(awk "BEGIN {printf \"%.2f\", ($total_size - 65536) / 1024}")
  echo "❌ ERROR: Total size exceeds 64KB limit by $over_kb KB"
  exit 2
else
  remaining=$(awk "BEGIN {printf \"%.2f\", (65536 - $total_size) / 1024}")
  echo "✅ Total size is within limit (${remaining} KB remaining)"
fi
