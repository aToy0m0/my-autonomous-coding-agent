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

import { isIPv4, isIPv6 } from 'node:net';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Node } from 'constructs';

/** Only individual addresses are allowed; carrier-wide networks must not be admitted. */
export function allowedSourceCidrs(node: Node): string[] {
  const value: unknown = node.tryGetContext('allowedSourceIps');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Set allowedSourceIps.home and allowedSourceIps.mobile arrays in cdk/cdk.json before synthesis');
  }
  const groups = value as Record<string, unknown>;
  if (Object.keys(groups).some(key => key !== 'home' && key !== 'mobile')) {
    throw new Error('allowedSourceIps accepts only home and mobile');
  }
  const cidrs: string[] = [];
  for (const name of ['home', 'mobile']) {
    const entries = groups[name];
    if (!Array.isArray(entries)) throw new Error(`allowedSourceIps.${name} must be an array`);
    for (const entry of entries) {
      if (typeof entry !== 'string') throw new Error(`allowedSourceIps.${name} must contain CIDR strings`);
      const parts = entry.split('/');
      if (parts.length !== 2 || parts[0].includes('%') ||
        !((isIPv4(parts[0]) && parts[1] === '32') || (isIPv6(parts[0]) && parts[1] === '128'))) {
        throw new Error(`Invalid allowedSourceIps.${name} entry: use a single IPv4 /32 or IPv6 /128 address`);
      }
      cidrs.push(entry);
    }
  }
  if (cidrs.length === 0) throw new Error('allowedSourceIps is empty: configure home or mobile before synthesis; public access is not enabled');
  return [...new Set(cidrs)].sort();
}

/** Covers all stages/methods, including OPTIONS and alternate authentication routes. */
export function restrictApiToSourceIps(api: RestApi): void {
  const cidrs = allowedSourceCidrs(api.node);
  api.addToResourcePolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    principals: [new AnyPrincipal()],
    actions: ['execute-api:Invoke'],
    resources: ['execute-api:/*'],
  }));
  api.addToResourcePolicy(new PolicyStatement({
    effect: Effect.DENY,
    principals: [new AnyPrincipal()],
    actions: ['execute-api:Invoke'],
    resources: ['execute-api:/*'],
    conditions: { NotIpAddress: { 'aws:SourceIp': cidrs } },
  }));
  if (!api.latestDeployment) throw new Error('IP-restricted API requires a deployment');
  // A resource-policy edit must reach the active stage, not only the RestApi resource.
  api.latestDeployment.addToLogicalId({ allowedSourceCidrs: cidrs });
}
