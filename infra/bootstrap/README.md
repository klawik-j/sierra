# Bootstrap

Applied once by hand with admin credentials. Creates the GitHub Actions IAM roles; reuses the account's existing GitHub OIDC provider and the `static-sites` Terraform state bucket.

| Resource | Purpose |
|---|---|
| `sierra-gha-plan` | assumed by pull requests (`repo:klawik-j/sierra:pull_request`); `ReadOnlyAccess` + state object |
| `sierra-gha-deploy` | assumed by pushes to `master`; manages only the `sierra` stack, sends the SSM deploy command |
| `sierra-terraform-state` | read/write `sierra/terraform.tfstate` and its lock file |

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
terraform -chdir=infra/bootstrap init \
  -backend-config="bucket=static-sites-terraform-state-${ACCOUNT_ID}" \
  -backend-config="key=sierra/bootstrap.tfstate" \
  -backend-config="region=eu-central-1" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
terraform -chdir=infra/bootstrap apply -var "state_bucket=static-sites-terraform-state-${ACCOUNT_ID}"

# repository variables used by the workflows
terraform -chdir=infra/bootstrap output -json github_repository_variables \
  | jq -r 'to_entries[] | "\(.key) \(.value)"' \
  | while read -r k v; do gh variable set "$k" --body "$v"; done
```
