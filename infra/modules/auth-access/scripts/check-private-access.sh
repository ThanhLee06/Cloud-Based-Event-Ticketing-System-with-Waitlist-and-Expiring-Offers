#!/usr/bin/env bash
# ST-037: Kiểm tra kho S3 và cơ sở dữ liệu RDS không thể truy cập trực tiếp từ Internet.
#
# Chạy trong AWS CloudShell (Sydney) hoặc máy có AWS CLI v2 + quyền đọc RDS/EC2/S3.
# Script CHỈ ĐỌC cấu hình, không tạo/sửa/xoá tài nguyên. Kết quả in ra dạng bảng Markdown.
#
#   export AWS_REGION=ap-southeast-2
#   export DB_INSTANCE_ID=eventflow-staging-db        # tên RDS instance
#   export UPLOADS_BUCKET=eventflow-staging-uploads    # (ST-048) để trống nếu chưa có
#   export SAMPLE_OBJECT_KEY=uploads/exports/test.csv  # (ST-048) một tệp có thật trong bucket
#   bash check-private-access.sh | tee st037-private-access.md
set -uo pipefail

REGION="${AWS_REGION:-ap-southeast-2}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-}"
UPLOADS_BUCKET="${UPLOADS_BUCKET:-}"
SAMPLE_OBJECT_KEY="${SAMPLE_OBJECT_KEY:-}"

PASS=0
TOTAL=0
ROWS=()

row() { # $1 thao tác, $2 mong đợi, $3 thực tế, $4 đạt(0/1)
  TOTAL=$((TOTAL + 1))
  local mark="❌"
  if [ "$4" = "1" ]; then PASS=$((PASS + 1)); mark="✅"; fi
  ROWS+=("| ${TOTAL} | $1 | $2 | $3 | ${mark} |")
}

# ------------------------------------------------------------------ RDS
if [ -n "$DB_INSTANCE_ID" ]; then
  DB_JSON=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$DB_INSTANCE_ID" \
    --query 'DBInstances[0].{public:PubliclyAccessible,host:Endpoint.Address,port:Endpoint.Port,sgs:VpcSecurityGroups[].VpcSecurityGroupId}' \
    --output json 2>&1)
  if [ $? -ne 0 ]; then
    row "Đọc cấu hình RDS \`${DB_INSTANCE_ID}\`" "Đọc được" "Lỗi: $(echo "$DB_JSON" | tail -1)" 0
  else
    PUBLIC=$(echo "$DB_JSON" | python3 -c 'import json,sys;print(str(json.load(sys.stdin)["public"]).lower())')
    HOST=$(echo "$DB_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["host"])')
    PORT=$(echo "$DB_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["port"])')
    SGS=$(echo "$DB_JSON" | python3 -c 'import json,sys;print(" ".join(json.load(sys.stdin)["sgs"]))')

    [ "$PUBLIC" = "false" ] && ok=1 || ok=0
    row "RDS có bật Publicly accessible không" "false" "$PUBLIC" "$ok"

    # Mọi luật inbound vào cổng DB phải đến từ Security Group, không từ dải IP (đặc biệt 0.0.0.0/0).
    for SG in $SGS; do
      RULES=$(aws ec2 describe-security-group-rules --region "$REGION" \
        --filters "Name=group-id,Values=${SG}" --output json \
        --query "SecurityGroupRules[?IsEgress==\`false\`]")
      SUMMARY=$(echo "$RULES" | PORT="$PORT" python3 -c '
import json, os, sys
port = int(os.environ["PORT"])
rules = json.load(sys.stdin)
sources, open_cidr = [], False
for r in rules:
    lo, hi = r.get("FromPort", -1), r.get("ToPort", -1)
    if r.get("IpProtocol") != "-1" and not (lo <= port <= hi):
        continue
    if r.get("ReferencedGroupInfo"):
        sources.append("SG " + r["ReferencedGroupInfo"]["GroupId"])
    else:
        cidr = r.get("CidrIpv4") or r.get("CidrIpv6") or r.get("PrefixListId") or "?"
        sources.append(cidr)
        open_cidr = True
print(("OPEN" if open_cidr else "SGONLY") + "|" + (", ".join(sources) or "không có luật nào"))
')
      KIND="${SUMMARY%%|*}"
      SRC="${SUMMARY#*|}"
      [ "$KIND" = "SGONLY" ] && ok=1 || ok=0
      row "Nguồn được vào cổng ${PORT} của SG \`${SG}\`" "Chỉ Security Group của API / tác vụ migrate" "${SRC}" "$ok"
    done

    # Thử mở kết nối TCP trực tiếp tới DB từ máy đang chạy script (ngoài VPC).
    if timeout 5 bash -c "exec 3<>/dev/tcp/${HOST}/${PORT}" 2>/dev/null; then
      row "Mở kết nối TCP tới ${PORT} của DB từ Internet" "Không kết nối được" "Kết nối ĐƯỢC" 0
    else
      row "Mở kết nối TCP tới ${PORT} của DB từ Internet" "Không kết nối được" "Hết thời gian / bị từ chối" 1
    fi
  fi
else
  row "Kiểm tra RDS" "Có DB_INSTANCE_ID" "Bỏ qua (chưa đặt DB_INSTANCE_ID)" 0
fi

# ------------------------------------------------------------------ S3 (ST-048)
if [ -n "$UPLOADS_BUCKET" ]; then
  PAB=$(aws s3api get-public-access-block --region "$REGION" --bucket "$UPLOADS_BUCKET" --output json \
    --query 'PublicAccessBlockConfiguration' 2>&1)
  if echo "$PAB" | python3 -c 'import json,sys;c=json.load(sys.stdin);sys.exit(0 if all(c.values()) and len(c)==4 else 1)' 2>/dev/null; then
    row "Block Public Access của bucket" "Bật cả 4 mục" "Bật cả 4 mục" 1
  else
    row "Block Public Access của bucket" "Bật cả 4 mục" "$(echo "$PAB" | tr -d '\n' | cut -c1-120)" 0
  fi

  IS_PUBLIC=$(aws s3api get-bucket-policy-status --region "$REGION" --bucket "$UPLOADS_BUCKET" \
    --query 'PolicyStatus.IsPublic' --output text 2>/dev/null || echo "false (không có bucket policy)")
  case "$IS_PUBLIC" in false*) ok=1 ;; *) ok=0 ;; esac
  row "Bucket policy có công khai không" "false" "$IS_PUBLIC" "$ok"

  if [ -n "$SAMPLE_OBJECT_KEY" ]; then
    URL="https://${UPLOADS_BUCKET}.s3.${REGION}.amazonaws.com/${SAMPLE_OBJECT_KEY}"
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
    [ "$CODE" = "403" ] && ok=1 || ok=0
    row "Mở trực tiếp link tệp S3 không kèm chữ ký (\`${SAMPLE_OBJECT_KEY}\`)" "403 Forbidden" "$CODE" "$ok"
  else
    row "Mở trực tiếp link tệp S3" "403 Forbidden" "Bỏ qua (chưa đặt SAMPLE_OBJECT_KEY)" 0
  fi
else
  row "Kiểm tra kho S3 (ST-048)" "Có UPLOADS_BUCKET" "Bỏ qua (chưa đặt UPLOADS_BUCKET)" 0
fi

# ------------------------------------------------------------------ báo cáo
echo "# ST-037 · Kiểm tra kho S3 và cơ sở dữ liệu không mở ra Internet"
echo
echo "- Thời điểm: $(TZ=Asia/Ho_Chi_Minh date '+%H:%M %d/%m/%Y') (giờ Việt Nam) · region \`${REGION}\`"
echo "- Kết quả: **${PASS}/${TOTAL} mục đạt**"
echo
echo "| # | Thao tác | Mong đợi | Thực tế | Đạt |"
echo "|---|---|---|---|---|"
printf '%s\n' "${ROWS[@]}"
[ "$PASS" -eq "$TOTAL" ]
