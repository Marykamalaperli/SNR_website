import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const loadJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const template = await loadJson("infra/aws/foundation.template.json");
const pilot = await loadJson("infra/aws/production-pilot.template.json");
const deployPolicy = await loadJson("infra/aws/iam/github-deploy-policy.json");
const servicePolicy = await loadJson(
  "infra/aws/iam/cloudformation-service-policy.json",
);

test("foundation contains only the approved edge and storage resource types", () => {
  const allowed = new Set([
    "AWS::CloudFront::CachePolicy",
    "AWS::CloudFront::Distribution",
    "AWS::CloudFront::Function",
    "AWS::CloudFront::OriginAccessControl",
    "AWS::CloudFront::ResponseHeadersPolicy",
    "AWS::S3::Bucket",
    "AWS::S3::BucketPolicy",
  ]);

  for (const resource of Object.values(template.Resources)) {
    assert.ok(
      allowed.has(resource.Type),
      `unexpected resource ${resource.Type}`,
    );
  }
});

test("every bucket blocks public access and retained data buckets are versioned", () => {
  const buckets = Object.values(template.Resources).filter(
    (resource) => resource.Type === "AWS::S3::Bucket",
  );
  assert.equal(buckets.length, 4);

  for (const bucket of buckets) {
    assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    assert.equal(bucket.Properties.VersioningConfiguration.Status, "Enabled");
    assert.equal(bucket.DeletionPolicy, "Retain");
    assert.equal(bucket.UpdateReplacePolicy, "Retain");
  }
});

test("only CloudFront can read frontend objects", () => {
  const statement =
    template.Resources.FrontendBucketPolicy.Properties.PolicyDocument
      .Statement[0];
  assert.deepEqual(statement.Principal, {
    Service: "cloudfront.amazonaws.com",
  });
  assert.equal(statement.Action, "s3:GetObject");
  assert.ok(statement.Condition.StringEquals["AWS:SourceArn"]);
});

test("private buckets do not receive retention deletion rules before approval", () => {
  for (const name of ["EvidenceBucket", "PayslipBucket", "BackupBucket"]) {
    const rules =
      template.Resources[name].Properties.LifecycleConfiguration.Rules;
    assert.equal(rules.length, 1);
    assert.ok(rules[0].AbortIncompleteMultipartUpload);
    assert.equal("ExpirationInDays" in rules[0], false);
    assert.equal("Transitions" in rules[0], false);
  }
});

test("GitHub role is limited to one stack and one service role", () => {
  const text = JSON.stringify(deployPolicy);
  assert.match(text, /stack\/snrnest-staging-foundation\/\*/);
  assert.match(text, /role\/snrnest-staging-cloudformation-service/);
  assert.doesNotMatch(text, /AdministratorAccess|PowerUserAccess/);
});

test("CloudFormation service policy cannot manage compute, databases, DNS, or IAM", () => {
  const actions = servicePolicy.Statement.flatMap((statement) =>
    Array.isArray(statement.Action) ? statement.Action : [statement.Action],
  );
  for (const action of actions) {
    assert.doesNotMatch(action, /^(ec2|rds|lightsail|route53|acm|iam):/);
  }
});

test("production pilot keeps PostgreSQL private and protected", () => {
  const database = pilot.Resources.Database;
  assert.equal(database.Type, "AWS::RDS::DBInstance");
  assert.equal(database.Properties.PubliclyAccessible, false);
  assert.equal(database.Properties.EngineVersion, "16.15");
  assert.equal(database.Properties.StorageEncrypted, true);
  assert.equal(database.Properties.DeletionProtection, true);
  assert.equal(database.Properties.MultiAZ, false);
  assert.equal(database.DeletionPolicy, "Snapshot");
  assert.equal(database.UpdateReplacePolicy, "Snapshot");
});

test("production pilot uses temporary EC2 role credentials", () => {
  const profile = pilot.Resources.ApplicationInstanceProfile;
  const role = pilot.Resources.ApplicationRole;
  assert.equal(profile.Type, "AWS::IAM::InstanceProfile");
  assert.equal(role.Type, "AWS::IAM::Role");
  assert.deepEqual(role.Properties.ManagedPolicyArns, [
    "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ]);
  assert.equal(
    role.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service,
    "ec2.amazonaws.com",
  );
  assert.doesNotMatch(JSON.stringify(pilot), /AccessKey|SecretAccessKey/);
});

test("production pilot starts single-instance and preserves an HA upgrade path", () => {
  const settings = pilot.Resources.Environment.Properties.OptionSettings;
  const environmentType = settings.find(
    (setting) => setting.OptionName === "EnvironmentType",
  );
  assert.equal(environmentType.Value, "SingleInstance");
  assert.equal(
    pilot.Resources.Environment.Type,
    "AWS::ElasticBeanstalk::Environment",
  );
});

test("production pilot sets three monthly budget thresholds", () => {
  const notifications =
    pilot.Resources.MonthlyBudget.Properties.NotificationsWithSubscribers;
  assert.deepEqual(
    notifications.map((item) => item.Notification.Threshold),
    [50, 80, 100],
  );
  assert.equal(pilot.Parameters.AlertEmail.NoEcho, true);
  assert.equal(pilot.Parameters.AdminEmail.NoEcho, true);
  assert.equal(
    JSON.stringify(pilot).includes("taruntejaofficial@gmail.com"),
    false,
  );
});
