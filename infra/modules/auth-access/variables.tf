# ===================== ST-036 · Đầu vào của module auth-access =====================
# Thanh (ST-045) truyền các giá trị này từ bộ Terraform chung.

variable "name_prefix" {
  description = "Tiền tố đặt tên tài nguyên, vd. eventflow-preview."
  type        = string
  default     = "eventflow"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name_prefix))
    error_message = "name_prefix chỉ gồm chữ thường, số, dấu gạch ngang (3–31 ký tự)."
  }
}

variable "tags" {
  description = "Tag gắn cho mọi tài nguyên."
  type        = map(string)
  default     = { Project = "EventFlow" }
}

# ----- Mạng -----

variable "vpc_id" {
  description = "VPC chứa máy chủ NestJS, tác vụ migrate và PostgreSQL (do ST-045 tạo / chọn)."
  type        = string
}

variable "api_port" {
  description = "Cổng NestJS lắng nghe trong container."
  type        = number
  default     = 4000
}

variable "load_balancer_security_group_id" {
  description = "Security Group của Load Balancer phía trước NestJS. null = chưa có, chưa mở cổng API."
  type        = string
  default     = null
}

variable "manage_load_balancer_egress" {
  description = "true = module thêm luật cho Load Balancer đi ra tới cổng API (cần khi SG của Load Balancer không mở sẵn egress)."
  type        = bool
  default     = true
}

# ----- Cognito -----

variable "app_base_urls" {
  description = <<-EOT
    Địa chỉ gốc của web, không có dấu / ở cuối. Mỗi địa chỉ sinh ra:
    <url>/auth/callback (quay về sau đăng nhập) và <url>/login (quay về sau đăng xuất).
    vd. ["https://ev-xxxx.ecs.ap-southeast-2.on.aws", "http://localhost:3000"]
  EOT
  type        = list(string)

  validation {
    condition = length(var.app_base_urls) > 0 && alltrue([
      for u in var.app_base_urls :
      can(regex("^https://[^/]+$", u)) || can(regex("^http://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?$", u))
    ])
    error_message = "Cognito chỉ chấp nhận https:// (hoặc http://localhost để thử). Không có dấu / ở cuối."
  }
}

variable "cognito_domain_prefix" {
  description = "Tiền tố trang đăng nhập Cognito: https://<prefix>.auth.<region>.amazoncognito.com. Phải duy nhất trong region."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.cognito_domain_prefix)) && !can(regex("aws|amazon|cognito", var.cognito_domain_prefix))
    error_message = "Chỉ chữ thường, số, gạch ngang; không được chứa 'aws', 'amazon', 'cognito'."
  }
}

variable "enable_password_auth_flow" {
  description = "Bật ALLOW_USER_PASSWORD_AUTH để script kiểm thử tải lấy token bằng email/mật khẩu. Tắt khi không test tải."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Chặn xóa User Pool (nên bật cho môi trường thật; tắt cho bản thử để terraform destroy được)."
  type        = bool
  default     = false
}

# ----- Kho tệp S3 riêng tư (ST-048 của Quốc Thiện) -----

variable "uploads_bucket_arn" {
  description = "ARN kho S3 riêng tư. null = chưa có kho, chưa cấp quyền S3."
  type        = string
  default     = null
}

variable "uploads_prefix" {
  description = "Thư mục duy nhất ứng dụng được đọc/ghi trong kho S3."
  type        = string
  default     = "uploads/"

  validation {
    condition     = can(regex("^[a-zA-Z0-9!_.*'()-]+(/[a-zA-Z0-9!_.*'()-]+)*/$", var.uploads_prefix))
    error_message = "uploads_prefix phải kết thúc bằng '/' và không bắt đầu bằng '/'."
  }
}

variable "uploads_kms_key_arn" {
  description = "ARN khóa KMS nếu kho S3 mã hóa bằng KMS riêng. null = dùng mã hóa mặc định SSE-S3."
  type        = string
  default     = null
}
