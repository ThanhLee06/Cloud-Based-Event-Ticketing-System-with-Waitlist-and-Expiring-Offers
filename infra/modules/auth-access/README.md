# Module `auth-access` (ST-036)

Module này tạo phần **đăng nhập, quyền máy chủ và mạng** cho EventFlow trên AWS (Sydney `ap-southeast-2`).
Nó độc lập với hạ tầng chung (VPC, ECS, RDS do ST-045/ST-042 làm): chỉ cần truyền `vpc_id` vào và dùng các output.

| Thành phần | Tài nguyên | Ghi chú |
|---|---|---|
| Đăng nhập | `aws_cognito_user_pool`, domain Hosted UI, app client `web` | Đăng ký bằng email, tự xác thực email, Authorization Code + PKCE, không có client secret |
| Mạng | SG `<prefix>-api`, `<prefix>-migrate`, `<prefix>-db` | DB **chỉ** nhận 5432 từ SG api và SG migrate (tác vụ chạy một lần) |
| Bí mật | Secrets Manager `<prefix>/api`, `<prefix>/migration` | Module chỉ tạo "vỏ", giá trị đặt bằng CLI (không nằm trong state/git) |
| IAM | 2 execution role (api, migrate) + 1 task role (api) | Execution role chỉ đọc đúng secret của nó; task role chỉ đụng tới `s3://<bucket>/<uploads_prefix>*` |

## 1. Gắn module vào cấu hình chung

```hcl
module "auth_access" {
  source = "../modules/auth-access"   # đường dẫn tính từ thư mục môi trường

  name_prefix = "eventflow-staging"
  vpc_id      = data.aws_vpc.default.id   # VPC Thanh đang dùng

  # SG của load balancer/Express Gateway đứng trước API (null nếu chưa có)
  load_balancer_security_group_id = null

  # Địa chỉ web: callback = <url>/auth/callback, logout = <url>/login
  app_base_urls = [
    "https://ev-bdd71c0a93674b039bc3d735c844024f.ecs.ap-southeast-2.on.aws",
    "http://localhost:3000",
  ]
  cognito_domain_prefix = "eventflow-staging-q7m4"   # phải duy nhất toàn region

  # ST-048 (khi đã có bucket ảnh)
  uploads_bucket_arn = null
  uploads_prefix     = "uploads/"
}
```

Sau đó trong task definition:

| Chỗ dùng | Lấy từ output |
|---|---|
| `executionRoleArn` của api / migrate | `module.auth_access.execution_role_arns["api"]` / `["migrate"]` |
| `taskRoleArn` của api | `module.auth_access.api_task_role_arn` |
| `network_configuration.security_groups` | `module.auth_access.security_group_ids.api` / `.migrate` |
| `vpc_security_group_ids` của RDS | `[module.auth_access.security_group_ids.db]` |
| `secrets[].valueFrom` | `"${module.auth_access.secret_arns["api"]}:DATABASE_URL::"` (tương tự `JWT_SECRET`, `SMTP_PASS`...) |
| `environment` của api | `module.auth_access.api_environment` + `{ name = "TRUST_PROXY", value = "1" }` |

> **Lưu ý gỡ quyền cũ:** nếu RDS đang gắn SG khác cho phép 5432 rộng hơn (ví dụ cả VPC), phải gỡ SG đó ra,
> nếu không quy tắc "DB chỉ nhận api + migrate" sẽ không còn đúng.

### Biến đầu vào

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `name_prefix` | `eventflow` | Tiền tố tên tài nguyên |
| `tags` | `{}` | Tag thêm |
| `vpc_id` | (bắt buộc) | VPC chứa ECS + RDS |
| `api_port` | `4000` | Cổng NestJS |
| `load_balancer_security_group_id` | `null` | SG load balancer, được mở vào `api_port` |
| `manage_load_balancer_egress` | `true` | Thêm luật egress từ SG load balancer tới api |
| `app_base_urls` | (bắt buộc) | Danh sách địa chỉ web (https, hoặc http://localhost) |
| `cognito_domain_prefix` | (bắt buộc) | Tiền tố Hosted UI, không chứa `aws`, `amazon`, `cognito` |
| `enable_password_auth_flow` | `false` | Bật `USER_PASSWORD_AUTH` (chỉ khi chạy load test bằng script) |
| `deletion_protection` | `false` | Bật khi lên production |
| `uploads_bucket_arn` | `null` | Bucket ảnh; `null` = task role không có quyền S3 nào |
| `uploads_prefix` | `uploads/` | Thư mục duy nhất api được đọc/ghi |
| `uploads_kms_key_arn` | `null` | Khoá KMS nếu bucket mã hoá SSE-KMS |

## 2. Kiểm tra cú pháp (CloudShell, Sydney)

```bash
cd infra/modules/auth-access
terraform init -backend=false
terraform fmt -check && terraform validate
```

`plan`/`apply` chạy ở thư mục môi trường chung (có backend S3 `eventflow-tfstate-sydney-q7m4`) — **người phụ trách hạ tầng chạy**, không apply riêng.

## 3. Đặt giá trị bí mật (sau khi apply)

```bash
aws secretsmanager put-secret-value --region ap-southeast-2 \
  --secret-id eventflow-staging/api \
  --secret-string '{"DATABASE_URL":"postgresql://...","JWT_SECRET":"<chuỗi ngẫu nhiên>","SMTP_PASS":"<app password>"}'

aws secretsmanager put-secret-value --region ap-southeast-2 \
  --secret-id eventflow-staging/migration \
  --secret-string '{"DATABASE_URL":"postgresql://...","SEED_PASSWORD":"...","SEED_ADMIN_PASSWORD":"..."}'
```

Không dán giá trị thật vào file `.tf`, `.env` được commit, hay ảnh chụp minh chứng.

## 4. Tạo tài khoản Cognito cho dữ liệu mẫu

Ứng dụng tự liên kết tài khoản Cognito với `users` có **cùng email** ở lần đăng nhập đầu, nên chỉ cần tạo
các email giống seed (student001–100, organizer01/02, admin):

```bash
export USER_POOL_ID=$(terraform output -json cognito | jq -r .user_pool_id)
export SEED_PASSWORD='...'  SEED_ADMIN_PASSWORD='...'
bash infra/modules/auth-access/scripts/seed-cognito-users.sh
```

Script chạy lại nhiều lần được (bỏ qua email đã có).

## 5. Cách ứng dụng dùng Cognito

- Backend `AUTH_MODE=cognito`: kiểm tra chữ ký JWT bằng JWKS, `exp`, `iss`, `client_id`, `token_use=access`;
  tìm người dùng theo cột `users.cognito_sub`; vai trò (CUSTOMER/ORGANIZER/ADMIN) vẫn lấy từ bảng `users`.
- Lần đầu đăng nhập, web gửi ID token tới `POST /api/auth/cognito/session`:
  có email trùng → gắn `cognito_sub`; chưa có → tạo mới vai trò **CUSTOMER** (tự đăng ký không bao giờ ra BTC/Admin).
- Các API đăng ký/đăng nhập/đổi mật khẩu kiểu cũ trả 404 `LOCAL_AUTH_DISABLED` khi đang ở chế độ cognito.
- Máy dev vẫn chạy `AUTH_MODE=local` như cũ.

## 6. `TRUST_PROXY`

| Kiến trúc | Giá trị |
|---|---|
| Chạy local | `false` |
| ECS Express Gateway / ALB → API | `1` |
| CloudFront → ALB → API | `2` |

Đặt đúng số tầng proxy để rate limit đăng nhập đếm theo IP thật của người dùng, không phải IP load balancer.

## 7. Minh chứng cần chụp (che account ID, ARN, email thật)

1. User pool → App client: callback/logout URL.
2. Security group `-db`: inbound chỉ có 2 nguồn là SG api và SG migrate.
3. Secrets Manager: 2 secret (không mở phần giá trị).
4. IAM: policy của execution role (chỉ `secretsmanager:GetSecretValue` đúng ARN) và task role (chỉ prefix S3).
5. Đăng nhập `organizer01@...` qua Hosted UI → vào `/organizer`; một tài khoản mới tự đăng ký → vai trò Người mua.
