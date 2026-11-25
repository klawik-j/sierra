output "url" {
  value = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "instance_id" {
  value = aws_instance.app.id
}

output "releases_bucket" {
  value = aws_s3_bucket.releases.id
}

output "files_bucket" {
  value = aws_s3_bucket.files.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.app.id
}
