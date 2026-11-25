data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

# Created by the static-sites bootstrap; one provider per account.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  repo       = split("/", var.github_repository)
  prefix     = var.project_name

  state_bucket_arn = "arn:${local.partition}:s3:::${var.state_bucket}"
  role_arn_prefix  = "arn:${local.partition}:iam::${local.account_id}:role/${local.prefix}-"
}

# ---------------------------------------------------------------------------
# Trust policies
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  for_each = {
    deploy = "ref:refs/heads/${var.default_branch}"
    plan   = "pull_request"
  }

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:${each.value}",
        "repo:${local.repo[0]}@*/${local.repo[1]}@*:${each.value}",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.prefix}-gha-deploy"
  description          = "Applies the ${local.prefix} Terraform stack and deploys releases from GitHub Actions."
  assume_role_policy   = data.aws_iam_policy_document.assume["deploy"].json
  max_session_duration = 3600
}

resource "aws_iam_role" "plan" {
  name                 = "${local.prefix}-gha-plan"
  description          = "Runs read-only Terraform plans for ${local.prefix} pull requests."
  assume_role_policy   = data.aws_iam_policy_document.assume["plan"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

# ---------------------------------------------------------------------------
# Terraform state (shared bucket, own key)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "state" {
  statement {
    sid       = "ListStateBucket"
    actions   = ["s3:ListBucket"]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid     = "ReadWriteStateObject"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${local.state_bucket_arn}/${var.state_key}",
      "${local.state_bucket_arn}/${var.state_key}.tflock",
    ]
  }
}

resource "aws_iam_policy" "state" {
  name        = "${local.prefix}-terraform-state"
  description = "Read and write the ${local.prefix} Terraform state and lock file."
  policy      = data.aws_iam_policy_document.state.json
}

resource "aws_iam_role_policy_attachment" "state" {
  for_each   = { deploy = aws_iam_role.deploy.name, plan = aws_iam_role.plan.name }
  role       = each.value
  policy_arn = aws_iam_policy.state.arn
}

# ---------------------------------------------------------------------------
# Deploy permissions: only what the main stack and scripts/deploy.sh need
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "Read"
    actions   = ["ec2:Describe*", "ec2:Get*", "cloudfront:Get*", "cloudfront:List*", "dlm:Get*", "dlm:List*", "ssm:DescribeInstanceInformation", "ssm:ListCommands", "ssm:ListCommandInvocations", "ssm:GetCommandInvocation"]
    resources = ["*"]
  }

  statement {
    sid       = "AmiParameter"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:${local.partition}:ssm:${var.aws_region}::parameter/aws/service/ami-amazon-linux-latest/*"]
  }

  statement {
    sid = "Compute"
    actions = [
      "ec2:RunInstances", "ec2:TerminateInstances", "ec2:StartInstances", "ec2:StopInstances",
      "ec2:ModifyInstanceAttribute", "ec2:ModifyInstanceMetadataOptions", "ec2:ModifyInstanceCreditSpecification",
      "ec2:CreateTags", "ec2:DeleteTags",
      "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
      "ec2:CreateVolume", "ec2:DeleteVolume", "ec2:ModifyVolume", "ec2:AttachVolume", "ec2:DetachVolume",
      "ec2:AllocateAddress", "ec2:ReleaseAddress", "ec2:AssociateAddress", "ec2:DisassociateAddress",
    ]
    resources = ["*"]
  }

  statement {
    sid = "Iam"
    actions = [
      "iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:ListInstanceProfilesForRole",
      "iam:GetInstanceProfile", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile", "iam:UntagInstanceProfile",
    ]
    resources = [
      "${local.role_arn_prefix}app",
      "${local.role_arn_prefix}dlm",
      "arn:${local.partition}:iam::${local.account_id}:instance-profile/${local.prefix}-*",
    ]
  }

  statement {
    sid       = "IamAttachKnownPolicies"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["${local.role_arn_prefix}app", "${local.role_arn_prefix}dlm"]
    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values = [
        "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore",
        "arn:${local.partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole",
      ]
    }
  }

  statement {
    sid       = "IamPassRole"
    actions   = ["iam:PassRole"]
    resources = ["${local.role_arn_prefix}app", "${local.role_arn_prefix}dlm"]
  }

  statement {
    sid = "Buckets"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket",
      "s3:GetBucket*", "s3:GetAccelerateConfiguration", "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration",
      "s3:PutBucketVersioning", "s3:PutBucketTagging", "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketOwnershipControls", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:PutEncryptionConfiguration", "s3:PutLifecycleConfiguration",
    ]
    resources = ["arn:${local.partition}:s3:::${local.prefix}-*"]
  }

  statement {
    sid       = "Releases"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:${local.partition}:s3:::${local.prefix}-releases-*/*"]
  }

  statement {
    sid = "CloudFront"
    actions = [
      "cloudfront:CreateDistribution", "cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution",
      "cloudfront:TagResource", "cloudfront:UntagResource", "cloudfront:CreateInvalidation",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "Snapshots"
    actions   = ["dlm:CreateLifecyclePolicy", "dlm:UpdateLifecyclePolicy", "dlm:DeleteLifecyclePolicy", "dlm:TagResource", "dlm:UntagResource"]
    resources = ["*"]
  }

  statement {
    sid       = "RunDeployCommand"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "RunDeployCommandOnAppInstance"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ec2:${var.aws_region}:${local.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = [local.prefix]
    }
  }
}

resource "aws_iam_policy" "deploy" {
  name        = "${local.prefix}-gha-deploy"
  description = "Manages the ${local.prefix} stack (EC2, EBS, S3, CloudFront, DLM) and runs release deploys over SSM."
  policy      = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy.arn
}
