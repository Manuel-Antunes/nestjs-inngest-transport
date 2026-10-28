import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import type { ReactNode } from 'react';

type Feature = {
  title: string;
  to: string;
  description: ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: 'A transport like any other',
    to: '/docs/guides/receiving-events',
    description: (
      <>
        <code>@EventPattern</code>, <code>@Payload()</code>, <code>@Ctx()</code> and the whole Nest
        pipeline. Moving a service to Inngest changes its bootstrap and nothing else.
      </>
    ),
  },
  {
    title: 'Durable steps',
    to: '/docs/guides/steps',
    description: (
      <>
        <code>step.run</code>, <code>step.sleep</code> and <code>step.waitForEvent</code> from a
        Nest handler: each step runs once, its result memoized across retries.
      </>
    ),
  },
  {
    title: 'Configured where it is declared',
    to: '/docs/guides/function-configuration',
    description: (
      <>
        Concurrency, throttling, debouncing, timeouts and retries on the decorator, type-checked
        against Inngest&apos;s own types.
      </>
    ),
  },
  {
    title: 'Errors Inngest understands',
    to: '/docs/guides/errors-and-retries',
    description: (
      <>
        <code>InngestExceptionFilter</code> keeps <code>NonRetriableError</code> and{' '}
        <code>RetryAfterError</code> intact through Nest&apos;s exception layer.
      </>
    ),
  },
  {
    title: 'Express or Fastify',
    to: '/docs/guides/express-and-fastify',
    description: (
      <>
        Mounted on the application&apos;s own HTTP server with Inngest&apos;s official handlers —
        the adapter is detected, the body is read when Nest has not yet.
      </>
    ),
  },
  {
    title: 'Tested against the real thing',
    to: '/docs/guides/testing',
    description: (
      <>
        A fake client for unit tests, in-process runs with <code>@inngest/test</code>, and the
        dev server in Docker — the package&apos;s own suite runs all three.
      </>
    ),
  },
];

export default function HomepageFeatures(): ReactNode {
  return (
    <section className="featureGrid">
      <div className="container">
        <div className="row">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="col col--4 margin-bottom--lg">
              <Link className="featureCard" to={feature.to} style={{ display: 'block' }}>
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
