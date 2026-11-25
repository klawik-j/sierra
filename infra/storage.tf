data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

# Uploaded photos and attachments.
resource "aws_s3_bucket" "files" {
  bucket = "${var.project_name}-files-${local.account_id}"
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Build artifacts fetched by the instance.
resource "aws_s3_bucket" "releases" {
  bucket = "${var.project_name}-releases-${local.account_id}"
}

resource "aws_s3_bucket_lifecycle_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    id     = "expire-history"
    status = "Enabled"
    filter {
      prefix = "releases/history/"
    }
    expiration {
      days = 60
    }
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = {
    files    = aws_s3_bucket.files.id
    releases = aws_s3_bucket.releases.id
  }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = {
    files    = aws_s3_bucket.files.id
    releases = aws_s3_bucket.releases.id
  }
  bucket = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
