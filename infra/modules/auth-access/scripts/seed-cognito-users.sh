#!/usr/bin/env bash
# ST-036 → bàn giao ST-042: tạo sẵn 103 tài khoản thử trên Amazon Cognito.
#
#   100 sinh viên  student001@eventflow.vn … student100@eventflow.vn
#   2 Ban tổ chức  organizer01@eventflow.vn, organizer02@eventflow.vn
#   1 Quản trị     admin@eventflow.vn
#
# Email được đánh dấu "đã xác thực" (địa chỉ giả, không cần mã) và mật khẩu đặt vĩnh viễn.
# KHÔNG cần ghi gì vào PostgreSQL: lần đăng nhập đầu tiên, backend (POST /api/auth/cognito/session)
# tự gắn cognito_sub vào đúng dòng users có cùng email → giữ nguyên users.id, vai trò, lịch sử vé.
#
# Chạy trong AWS CloudShell (đã đăng nhập sẵn quyền của bạn):
#   export USER_POOL_ID=ap-southeast-2_XXXXXXXXX     # terraform output -json cognito
#   read -rs SEED_PASSWORD && export SEED_PASSWORD    # mật khẩu chung cho student + organizer
#   read -rs SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD
#   bash seed-cognito-users.sh
# Mật khẩu phải có chữ hoa, chữ thường, số, ký tự đặc biệt, tối thiểu 8 ký tự.
# Chạy lại nhiều lần không lỗi: tài khoản đã có thì chỉ đặt lại mật khẩu.
set -euo pipefail

: "${USER_POOL_ID:?Thiếu USER_POOL_ID}"
: "${SEED_PASSWORD:?Thiếu SEED_PASSWORD}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-$SEED_PASSWORD}"
REGION="${AWS_REGION:-${USER_POOL_ID%%_*}}"

created=0
updated=0

upsert_user() {
  local email=$1 name=$2 password=$3 out
  if out=$(aws cognito-idp admin-create-user \
      --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --user-attributes Name=email,Value="$email" Name=email_verified,Value=true Name=name,Value="$name" \
      --message-action SUPPRESS \
      --output text --query 'User.Username' 2>&1); then
    created=$((created + 1))
  elif [[ $out == *UsernameExistsException* ]]; then
    updated=$((updated + 1))
  else
    echo "Lỗi tạo $email: $out" >&2
    return 1
  fi
  # Mật khẩu vĩnh viễn → đăng nhập được ngay, không bị bắt đổi mật khẩu lần đầu.
  aws cognito-idp admin-set-user-password \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --password "$password" \
    --permanent
}

for i in $(seq -w 1 100); do
  num=$(printf '%03d' "$((10#$i))")
  upsert_user "student${num}@eventflow.vn" "Sinh viên ${num}" "$SEED_PASSWORD"
done
upsert_user "organizer01@eventflow.vn" "Ban tổ chức 01" "$SEED_PASSWORD"
upsert_user "organizer02@eventflow.vn" "Ban tổ chức 02" "$SEED_PASSWORD"
upsert_user "admin@eventflow.vn" "Quản trị viên" "$SEED_ADMIN_PASSWORD"

echo "Xong: tạo mới ${created}, đã có ${updated} (đặt lại mật khẩu). Tổng $((created + updated))/103."
