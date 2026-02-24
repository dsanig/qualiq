#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
: "${ADMIN_JWT:?Set ADMIN_JWT (superadmin access token)}"

FUNCTION_URL="${SUPABASE_URL%/}/functions/v1/admin-create-user"
RUN_ID="$(date +%s)"
EMAIL_OK="qualiq.test.${RUN_ID}@example.com"
EMAIL_DUPLICATE="$EMAIL_OK"
EMAIL_INVALID="bad-email-${RUN_ID}"

call_function() {
  local payload="$1"
  curl -sS -i \
    -X POST "$FUNCTION_URL" \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    --data "$payload"
}

echo "== 1) valid payload should succeed =="
call_function "{\"email\":\"$EMAIL_OK\",\"password\":\"Password123!\",\"full_name\":\"QA Script\",\"role\":\"Editor\"}"

echo
echo "== 2) duplicate email should return specific error =="
call_function "{\"email\":\"$EMAIL_DUPLICATE\",\"password\":\"Password123!\",\"full_name\":\"QA Script\",\"role\":\"Editor\"}"

echo
echo "== 3) missing role should return 400 =="
call_function "{\"email\":\"$EMAIL_INVALID\",\"password\":\"Password123!\",\"full_name\":\"QA Script\"}"
