variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "project_name" {
  description = "Lowercase prefix for resource names and tags."
  type        = string
  default     = "sierra"
}

variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "data_volume_size" {
  description = "GiB for the database volume (PostgreSQL data directory)."
  type        = number
  default     = 2
}

variable "availability_zone" {
  type    = string
  default = "eu-central-1a"
}

variable "snapshot_retention_days" {
  type    = number
  default = 7
}

variable "time_zone" {
  description = "Time zone of the app process. Work-time rules (\"today\", current and previous month) follow this clock."
  type        = string
  default     = "Europe/Warsaw"
}

variable "node_major" {
  description = "Node.js major version installed on the instance."
  type        = number
  default     = 24
}
