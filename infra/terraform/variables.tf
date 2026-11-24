variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}
variable "name_prefix" {
  type    = string
  default = "eventflow-preview"
}
variable "service_name" {
  type    = string
  default = "eventflow-api"
}
variable "metrics_namespace" {
  type    = string
  default = "EventFlow/Operations"
}
variable "log_delivery_role_name" {
  type        = string
  description = "Existing ECS task execution role used by the API service to deliver logs (eventflow-preview-api-execution)."
}
