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

import { App, CfnResource, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CfnLogGroup, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

/** Explicit log groups also cover CDK-generated provider functions before their first invocation. */
export function configureDeploymentLogs(app: App): void {
  for (const node of app.node.findAll()) {
    if (!CfnResource.isCfnResource(node) || node.cfnResourceType !== 'AWS::Lambda::Function') continue;
    const group = new LogGroup(node, 'ExecutionLogs', {
      logGroupName: `/aws/lambda/${Stack.of(node).stackName}/${node.node.addr}`,
      retention: RetentionDays.SIX_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // The log group name has no function reference, so the function can depend on its group without a cycle.
    node.addPropertyOverride('LoggingConfig.LogGroup', group.logGroupName);
  }
  for (const node of app.node.findAll()) {
    if (node instanceof CfnLogGroup) node.retentionInDays = RetentionDays.SIX_MONTHS;
  }
}
