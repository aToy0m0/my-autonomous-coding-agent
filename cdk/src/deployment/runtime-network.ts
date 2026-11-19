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

import { Node } from 'constructs';
import { resolveComputeBackends } from '../handlers/shared/compute-backend';

/** The personal fork defaults to managed internet egress without a customer VPC. */
export function usesPublicRuntime(node: Node): boolean {
  const mode: unknown = node.tryGetContext('runtimeNetworkMode') ?? 'PUBLIC';
  if (mode !== 'PUBLIC' && mode !== 'VPC') {
    throw new Error('runtimeNetworkMode must be PUBLIC or VPC');
  }
  const compute = resolveComputeBackends(node.tryGetContext('compute_types'), node.tryGetContext('compute_type'));
  if (mode === 'PUBLIC' && (compute.length !== 1 || compute[0] !== 'agentcore')) {
    throw new Error('PUBLIC networking requires agentcore as the only compute backend; ECS and Lambda MicroVMs require VPC');
  }
  if (mode === 'PUBLIC' && node.tryGetContext('networkTopology') === 'split') {
    throw new Error('PUBLIC networking cannot create a split VPC network stack');
  }
  return mode === 'PUBLIC';
}
