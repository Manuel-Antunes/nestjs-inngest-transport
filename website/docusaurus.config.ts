import npm2yarn from '@docusaurus/remark-plugin-npm2yarn';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const ORGANIZATION = 'Manuel-Antunes';
const PROJECT = 'nestjs-inngest-transport';
const REPO = `https://github.com/${ORGANIZATION}/${PROJECT}`;
const NPM = `https://www.npmjs.com/package/${PROJECT}`;

const config: Config = {
  title: 'nestjs-inngest-transport',
  tagline: 'Inngest as a NestJS microservice transport',
  favicon: 'img/favicon.svg',

  // GitHub Pages: https://<org>.github.io/<project>/
  url: `https://${ORGANIZATION.toLowerCase()}.github.io`,
  baseUrl: `/${PROJECT}/`,
  organizationName: ORGANIZATION,
  projectName: PROJECT,
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',

  future: {
    v4: true,
  },

  markdown: {
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // The documentation lives at the repository root, so it stays readable on GitHub and
          // reviewable in the same pull request as the code it describes.
          path: '../docs',
          routeBasePath: '/docs',
          sidebarPath: './sidebars.ts',
          showLastUpdateTime: true,
          editUrl: ({ docPath }) => `${REPO}/edit/main/docs/${docPath}`,
          breadcrumbs: true,
          remarkPlugins: [[npm2yarn, { converters: ['pnpm', 'yarn'], sync: true }]],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      // GitHub Pages serves static files only, so the search index is built at compile time.
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexBlog: false,
        docsDir: '../docs',
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 10,
        explicitSearchResultPath: true,
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
    navbar: {
      title: 'nestjs-inngest-transport',
      logo: {
        alt: 'nestjs-inngest-transport',
        src: 'img/logo.svg',
      },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Documentation' },
        { to: '/docs/getting-started/quick-start', label: 'Quick start', position: 'left' },
        { to: '/docs/reference/api', label: 'API', position: 'left' },
        { href: `${REPO}/blob/main/CHANGELOG.md`, label: 'Changelog', position: 'right' },
        { href: NPM, label: 'npm', position: 'right' },
        { href: REPO, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Introduction', to: '/docs' },
            { label: 'Quick start', to: '/docs/getting-started/quick-start' },
            { label: 'Errors and retries', to: '/docs/guides/errors-and-retries' },
            { label: 'Troubleshooting', to: '/docs/reference/troubleshooting' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: REPO },
            { label: 'Issues', href: `${REPO}/issues` },
            { label: 'Contributing', href: `${REPO}/blob/main/CONTRIBUTING.md` },
            { label: 'npm', href: NPM },
          ],
        },
        {
          title: 'Upstream',
          items: [
            { label: 'Inngest', href: 'https://www.inngest.com/docs' },
            { label: 'NestJS microservices', href: 'https://docs.nestjs.com/microservices/basics' },
            {
              label: 'Custom transporters',
              href: 'https://docs.nestjs.com/microservices/custom-transport',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Manuel Antunes. MIT licensed. Not affiliated with Inngest or NestJS.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'diff'],
      magicComments: [
        {
          className: 'theme-code-block-highlighted-line',
          line: 'highlight-next-line',
          block: { start: 'highlight-start', end: 'highlight-end' },
        },
        {
          className: 'code-block-error-line',
          line: 'error-next-line',
        },
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
