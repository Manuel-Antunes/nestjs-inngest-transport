import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

const HANDLER = `@Controller()
@UseFilters(InngestExceptionFilter)
export class OrdersHandler {
  @InngestEventPattern('orders.placed', { concurrency: { limit: 5 } })
  async place(@Payload() order: Order, @Ctx() context: InngestContext) {
    const step = context.getStep();
    await step.run('reserve-stock', () => this.stock.reserve(order));
    await step.sleep('cool-off', '1h');
    await step.run('confirm', () => this.mailer.confirm(order));
  }
}`;

const BOOTSTRAP = `const app = await NestFactory.create(AppModule);
app.connectMicroservice({
  strategy: new InngestStrategy({ inngest, httpAdapter: app.getHttpAdapter() }),
});
await app.startAllMicroservices();
await app.listen(3000);

// anywhere else
await lastValueFrom(events.emit('orders.placed', order));`;

function Hero(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <header className="heroBanner">
      <div className="container">
        <Heading as="h1" className="heroTitle">
          {siteConfig.title}
        </Heading>
        <p className="heroTagline">
          Inngest as a NestJS microservice transport. Your <code>@EventPattern</code> handlers
          become durable functions — retried, throttled, made of steps that run once — and a{' '}
          <code>ClientProxy</code> sends the events.
        </p>
        <div className="heroButtons">
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/quick-start"
          >
            Quick start — 5 min
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/docs">
            Read the docs
          </Link>
        </div>
        <div>
          <span className="heroInstall">npm install nestjs-inngest-transport inngest</span>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title="Inngest transport for NestJS" description={siteConfig.tagline}>
      <Hero />
      <main>
        <HomepageFeatures />
        <section className="container margin-bottom--xl">
          <div className="row">
            <div className="col col--10 col--offset-1">
              <Heading as="h2">The Nest you already write</Heading>
              <p>
                Controllers, <code>@Payload()</code>, <code>@Ctx()</code>, guards, pipes,
                interceptors and filters work the way Nest documents them for every transport. What
                changes is what runs the handler: an Inngest function, invoked over HTTP, with
                durable steps underneath.
              </p>
              <CodeBlock language="ts" title="orders.handler.ts">
                {HANDLER}
              </CodeBlock>
              <CodeBlock language="ts" title="main.ts">
                {BOOTSTRAP}
              </CodeBlock>
              <p>
                <Link to="/docs/getting-started/quick-start">Start here</Link>, or read{' '}
                <Link to="/docs/guides/errors-and-retries">
                  why Nest&apos;s default exception filter needs replacing
                </Link>{' '}
                before going to production.
              </p>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
