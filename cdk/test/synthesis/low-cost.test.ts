/**
 *  MIT No Attribution
 *
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy of
 *  the Software without restriction, including without limitation the rights to
 *  use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 *  the Software, and to permit persons to whom the Software is furnished to do so.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { resolveBlueprintDefinitions } from '../../src/blueprints/definitions';
import { usesPublicRuntime } from '../../src/deployment/runtime-network';
import { PLATFORM_DEFAULT_MODEL_ID } from '../../src/handlers/shared/bedrock-model-constants';
import { buildApp } from '../../src/main';

const root = path.resolve(__dirname, '../../..');
const config = JSON.parse(readFileSync(path.join(root, 'cdk/cdk.example.json'), 'utf8'));

describe('Personal low-cost deployment', () => {
  let templates: Template[];
  let assembly: ReturnType<App['synth']>;
  const lookup = jest.fn(async () => { throw new Error('PUBLIC synth must not look up AWS availability zones'); });

  beforeAll(async () => {
    const app = await buildApp({
      account: '123456789012',
      region: 'us-east-1',
      appProps: { context: { ...config.context, deploymentProfile: 'abca.deployment.example.json', allowedSourceIps: { home: ['192.0.2.10/32'], mobile: ['2001:db8::10/128'] } } },
      profileRoot: root,
      blueprints: [],
      operatorConsoleAssetDirectory: path.join(root, 'web/dist'),
      describeAzs: lookup,
      resolveCallerAccount: lookup,
    });
    templates = app.node.findAll().filter((node): node is Stack => node instanceof Stack)
      .map(stack => Template.fromStack(stack));
    assembly = app.synth();
  });

  test('creates no customer VPC, NAT, endpoints, DNS firewall or paid dashboard', () => {
    for (const template of templates) {
      for (const type of ['AWS::EC2::VPC', 'AWS::EC2::NatGateway', 'AWS::EC2::EIP',
        'AWS::EC2::VPCEndpoint', 'AWS::Route53Resolver::FirewallRuleGroup', 'AWS::CloudWatch::Dashboard']) {
        template.resourceCountIs(type, 0);
      }
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  test('uses PUBLIC AgentCore and preserves authentication without WAF', () => {
    const platform = templates.find(t => Object.keys(t.findResources('AWS::BedrockAgentCore::Runtime')).length > 0)!;
    platform.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    platform.hasResourceProperties('AWS::BedrockAgentCore::Runtime', { NetworkConfiguration: { NetworkMode: 'PUBLIC' } });
    platform.resourceCountIs('AWS::Cognito::UserPool', 1);
    platform.resourceCountIs('AWS::WAFv2::WebACL', 0);
    expect(Object.keys(platform.findResources('AWS::DynamoDB::Table')).some(id => id.startsWith('BudgetTable'))).toBe(true);
    expect(Object.keys(platform.findResources('AWS::DynamoDB::Table')).some(id => id.startsWith('TaskApprovalsTable'))).toBe(true);
  });

  test('both APIs deny every path outside the allowed home/mobile IPs', () => {
    const apis = templates.flatMap(t => Object.values(t.findResources('AWS::ApiGateway::RestApi')));
    expect(apis).toHaveLength(2);
    for (const api of apis) {
      expect(api.Properties.EndpointConfiguration.IpAddressType).toBe('dualstack');
      expect(api.Properties.Policy.Statement).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Effect: 'Deny',
          Action: 'execute-api:Invoke',
          Resource: 'execute-api:/*',
          Condition: { NotIpAddress: { 'aws:SourceIp': ['192.0.2.10/32', '2001:db8::10/128'] } },
        }),
      ]));
    }
    for (const t of templates) {
      t.resourceCountIs('AWS::WAFv2::WebACL', 0);
      t.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
    }
    const console = templates.find(t => Object.keys(t.findResources('AWS::CloudFront::Distribution')).length > 0)!;
    console.hasResourceProperties('AWS::ApiGateway::Method', { HttpMethod: 'GET', AuthorizationType: 'COGNITO_USER_POOLS' });
  });

  test('unconfigured deployment stops before any AWS lookup', async () => {
    await expect(buildApp({ appProps: { context: config.context } })).rejects.toThrow('allowedSourceIps is empty');
  });

  test('keeps the independent web console and omits integrations and provisioned Lambda capacity', () => {
    expect(assembly.stacks.map(s => s.stackName)).toContain('my-backgroundagent-dev-console');
    expect(assembly.stacks.map(s => s.stackName)).not.toContain('backgroundagent-dev');
    for (const template of templates) {
      const resources = template.toJSON().Resources;
      expect(Object.keys(resources).some(id => /SlackIntegration|JiraIntegration|LinearIntegration|GitHubScreenshotIntegration/.test(id))).toBe(false);
      for (const resource of Object.values(resources) as { Properties?: Record<string, unknown> }[]) {
        expect(resource.Properties?.ProvisionedConcurrencyConfig).toBeUndefined();
      }
    }
  });

  test('omits alarms, notification topics and customer-managed notification keys', () => {
    for (const template of templates) {
      for (const type of ['AWS::CloudWatch::Alarm', 'AWS::SNS::Topic', 'AWS::SNS::Subscription', 'AWS::KMS::Key']) {
        template.resourceCountIs(type, 0);
      }
    }
  });

  test('uses the lower-cost model and a model-spend budget for the bundled repository', () => {
    expect(PLATFORM_DEFAULT_MODEL_ID).toBe('anthropic.claude-sonnet-4-6');
    const blueprints = resolveBlueprintDefinitions(new App().node, {});
    expect(blueprints[0].agent?.maxBudgetUsd).toBe(1);
  });

  test.each([
    { runtimeNetworkMode: 'PUBLC' },
    { runtimeNetworkMode: 'PUBLIC', compute_types: 'ecs' },
    { runtimeNetworkMode: 'PUBLIC', compute_types: 'agentcore,ecs' },
    { runtimeNetworkMode: 'PUBLIC', networkTopology: 'split' },
  ])('rejects incompatible or misspelled settings: %j', context => {
    expect(() => usesPublicRuntime(new App({ context }).node)).toThrow();
  });
});
