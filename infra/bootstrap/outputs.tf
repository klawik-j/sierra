output "github_repository_variables" {
  description = "Repository variables expected by the workflows."
  value = {
    AWS_DEPLOY_ROLE_ARN = aws_iam_role.deploy.arn
    AWS_PLAN_ROLE_ARN   = aws_iam_role.plan.arn
    AWS_REGION          = var.aws_region
    TF_STATE_BUCKET     = var.state_bucket
  }
}
