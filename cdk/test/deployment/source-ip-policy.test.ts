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

import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MockIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { allowedSourceCidrs, restrictApiToSourceIps } from '../../src/deployment/source-ip-policy';

const home = '192.0.2.10/32';
const mobile = '2001:db8::10/128';

describe('Personal source-IP restriction', () => {
  test('supports individual IPv4/IPv6 addresses and deduplicates without changing the configuration', () => {
    const value = { home: [home], mobile: [mobile, home] };
    const app = new App({ context: { allowedSourceIps: value } });
    expect(allowedSourceCidrs(app.node)).toEqual([home, mobile]);
    expect(value.mobile).toEqual([mobile, home]);
  });

  test.each([
    undefined, null, [], {}, { home: [], mobile: [] },
    { home: [home] }, { home, mobile: [] },
    { home: [home], mobile: [], unexpected: [] },
    { home: [123], mobile: [] },
    { home: ['192.0.2.10'], mobile: [] },
    { home: ['192.0.2.0/24'], mobile: [] },
    { home: ['0.0.0.0/0'], mobile: [] },
    { home: ['::/0'], mobile: [] },
    { home: ['2001:db8::/64'], mobile: [] },
    { home: ['300.0.0.1/32'], mobile: [] },
    { home: ['2001:db8::bad::/128'], mobile: [] },
    { home: ['fe80::1%eth0/128'], mobile: [] },
  ])('rejects missing, broad or invalid allowlists: %j', value => {
    const app = new App({ context: value === undefined ? {} : { allowedSourceIps: value } });
    expect(() => allowedSourceCidrs(app.node)).toThrow();
  });

  test('changing only the mobile IP replaces the deployment and retains the home IP', () => {
    const synth = (currentMobile: string) => {
      const app = new App({ context: { allowedSourceIps: { home: [home], mobile: [currentMobile] } } });
      const stack = new Stack(app, 'IpPolicyTest');
      const api = new RestApi(stack, 'Api');
      restrictApiToSourceIps(api);
      api.root.addMethod('GET', new MockIntegration());
      const template = Template.fromStack(stack);
      const rest = Object.values(template.findResources('AWS::ApiGateway::RestApi'))[0];
      return {
        deployments: Object.keys(template.findResources('AWS::ApiGateway::Deployment')),
        cidrs: rest.Properties.Policy.Statement.find((s: { Effect: string }) => s.Effect === 'Deny').Condition.NotIpAddress['aws:SourceIp'],
      };
    };
    const first = synth('198.51.100.10/32');
    const second = synth('198.51.100.11/32');
    expect(first.deployments).not.toEqual(second.deployments);
    expect(second.cidrs).toContain(home);
    expect(second.cidrs).toContain('198.51.100.11/32');
    expect(second.cidrs).not.toContain('198.51.100.10/32');
  });
});
