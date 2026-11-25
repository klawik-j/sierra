variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "project_name" {
  description = "Prefix of every resource the main stack manages; the deploy role is scoped to it."
  type        = string
  default     = "sierra"
}

variable "github_repository" {
  description = "Repository allowed to assume the roles, as owner/name."
  type        = string
  default     = "klawik-j/sierra"
}

variable "default_branch" {
  description = "Branch whose pushes may assume the deploy role."
  type        = string
  default     = "master"
}

variable "state_bucket" {
  description = "Existing Terraform state bucket (created by the static-sites bootstrap), e.g. static-sites-terraform-state-<account id>. No default: this repository is public."
  type        = string
}

variable "state_key" {
  description = "State object of the main stack."
  type        = string
  default     = "sierra/terraform.tfstate"
}
