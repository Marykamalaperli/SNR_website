# AWS staging foundation plan

## Decision

The first AWS infrastructure release is limited to private object storage and the
CloudFront frontend edge. It uses native CloudFormation in account `376793939540`
and region `ap-south-1`. It deliberately excludes compute, PostgreSQL, DNS, custom
certificates and application data because the server operating model, hostnames,
retention rules and privacy controls remain open decisions.

This boundary preserves the source architecture while preventing accidental reuse
of the existing `snrnest-prod` Lightsail instance, legacy S3 buckets, the
`snrnest.com` hosted zone and the failed `snrnest.com` certificate request.

## Included resources

- One private, versioned frontend bucket readable only through CloudFront OAC.
- Separate private, versioned buckets for attendance evidence, payslips and backups.
- S3-managed encryption and full Block Public Access on every bucket.
- A CloudFront distribution with TLS, HTTP-to-HTTPS redirect, HTTP/2 and HTTP/3,
  compression, baseline security headers and an extensionless SPA route rewrite.
- A cache policy that permits year-long immutable asset caching while honoring
  short or zero origin cache headers for `index.html` and service-worker files.
- Retain policies on all buckets. Lifecycle rules abort incomplete uploads only;
  no evidence, payslip or backup expiry is introduced before retention approval.

## Excluded resources

- The running `snrnest-prod` Lightsail instance is not imported or modified.
- No new Lightsail instance, EC2 instance, RDS database or container service.
- No Route 53 record, ACM certificate, custom CloudFront alias or API hostname.
- No WAF, paid log analytics, email service or third-party integration.
- No application upload, production data, database migration or DNS cutover.

## Cost boundary

Creating a CloudFormation change set and validating the template do not provision
the resources. Executing the stack would begin usage-based S3 and CloudFront
charges. At pilot traffic these are expected to remain a small part of the approved
INR 2,000-4,000 monthly planning range, but the amount is not a quote. The server is
the primary expected cost and remains outside this phase.

Before executing the stack, configure an AWS Budget with alerts at 50, 80 and 100
percent of the approved monthly target. A billing notification email is required and
must not be guessed or committed to the repository.

## Security and deployment roles

GitHub assumes `snrnest-staging-github-deploy` through OIDC. Its inline policy can
validate templates and manage change sets only for
`snrnest-staging-foundation`. It can pass only
`snrnest-staging-cloudformation-service` to CloudFormation.

The CloudFormation service role can manage the four exact staging bucket names and
the CloudFront resource types in this template. It cannot manage compute, databases,
DNS, certificates or IAM. CloudFront resource creation requires account-wide API
resource scope because new distribution and policy identifiers do not exist before
creation; the role remains limited by its service action list and by the one stack
that GitHub can manage.

## Verification gates

1. Repository tests parse every JSON file and enforce public-access, retention and
   resource-type guardrails.
2. AWS validates the template through the temporary GitHub OIDC role.
3. A no-execute CloudFormation change set is reviewed for replacements, policy
   changes and unexpected resources.
4. The owner approves the estimated cost and exact resource list.
5. Only then may the change set be executed.

## Decisions required before server deployment

- Confirm whether the pilot uses a new Lightsail instance or intentionally replaces
  the existing `snrnest-prod` host.
- Choose the API and staging frontend hostnames.
- Resolve the failed ACM request or request a new certificate after DNS validation.
- Approve administrator access, patching, backup restore, monitoring ownership and
  incident contacts.
- Approve evidence, payslip, audit and backup retention periods.
- Approve the production identity/session and CSRF design.

## Approved production-pilot extension

The owner selected a cost-controlled Elastic Beanstalk path that can later move
from `SingleInstance` to a load-balanced Auto Scaling environment. PostgreSQL is a
private, encrypted, deletion-protected Single-AZ RDS instance for the pilot. This
is a secure production-pilot baseline, not a high-availability claim.

`infra/aws/production-pilot.template.json` implements the reviewable definition:

- a dedicated VPC with one public application subnet and two private database
  subnets in separate Availability Zones;
- an Elastic Beanstalk Docker environment with an EC2 instance profile and no
  long-lived application AWS keys;
- private RDS PostgreSQL with generated Secrets Manager credentials, seven-day
  automated backups and snapshot retention on deletion or replacement;
- application-only PostgreSQL security-group ingress;
- RDS CPU and free-storage alarms; and
- a monthly budget with alerts at 50, 80 and 100 percent.

The alert email is a `NoEcho` deployment parameter and is not stored in the
repository. The default budget is USD 45 as a conservative approximation of the
INR 4,000 planning ceiling; exchange rate, tax and actual usage can exceed the
estimate.

DNS, ACM certificates, application deployment, live migrations and stack execution
remain separate approval gates. The HA upgrade adds a load balancer, at least two
application instances and Multi-AZ RDS and requires a new cost approval.
