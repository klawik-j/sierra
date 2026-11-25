data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "app" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

locals {
  app_port = 3001
}

# Only CloudFront edge servers can reach the app port.
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "App port from CloudFront only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "App from CloudFront"
    from_port       = local.app_port
    to_port         = local.app_port
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# Separate volume so the database survives instance replacement.
resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name   = "${var.project_name}-data"
    Backup = "${var.project_name}-daily"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.app.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    data_volume_id  = replace(aws_ebs_volume.data.id, "-", "")
    files_bucket    = aws_s3_bucket.files.id
    releases_bucket = aws_s3_bucket.releases.id
    region          = var.aws_region
    app_port        = local.app_port
    node_major      = var.node_major
    time_zone       = var.time_zone
  })

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  credit_specification {
    cpu_credits = "standard"
  }

  tags = {
    Name = "${var.project_name}-app"
  }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id

  stop_instance_before_detaching = true
}

# Stable public DNS name used as the CloudFront origin.
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_dlm_lifecycle_policy" "data" {
  description        = "${var.project_name} daily data volume snapshots"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags = {
      Backup = "${var.project_name}-daily"
    }

    schedule {
      name      = "daily"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["02:00"]
      }

      retain_rule {
        count = var.snapshot_retention_days
      }
    }
  }
}
