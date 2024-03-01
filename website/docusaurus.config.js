/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const users = require('./showcase.json');
const versions = require('./versions.json');

const lastVersion = versions[0];
const copyright = `Copyright © ${new Date().getFullYear()} hg-tech
<a href=\"http://beian.miit.gov.cn\" target=\"_blank\" rel=\"noopener\">粤ICP备19161989号-4</a>"
`;

const commonDocsOptions = {
  breadcrumbs: false,
  showLastUpdateAuthor: true,
  showLastUpdateTime: true,
  editUrl:
    'https://gitee.com/bruno_gao_admin/react-native-website/tree/main/website',
  remarkPlugins: [require('@react-native-website/remark-snackplayer')],
};

const isDeployPreview = process.env.PREVIEW_DEPLOY === 'true';

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: '和光科技',
  tagline: 'website for 和光科技',
  organizationName: '和光科技',
  projectName: 'hg-tech',
  url: 'https://www.heguang-tech.cn/',
  baseUrl: '/',
  clientModules: [
    require.resolve('./modules/snackPlayerInitializer.js'),
    require.resolve('./modules/jumpToFragment.js'),
  ],
  trailingSlash: false, // because trailing slashes can break some existing relative links
  scripts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/focus-visible@5.2.0/dist/focus-visible.min.js',
      defer: true,
    },
    {
      src: 'https://widget.surveymonkey.com/collect/website/js/tRaiETqnLgj758hTBazgd8ryO5qrZo8Exadq9qmt1wtm4_2FdZGEAKHDFEt_2BBlwwM4.js',
      defer: true,
    },
    {src: 'https://snack.expo.dev/embed.js', defer: true},
  ],
  favicon: 'img/favicon.ico',
  titleDelimiter: '·',
  customFields: {
    users,
    facebookAppId: '1677033832619985',
  },
  i18n: {
    defaultLocale: 'en', // 或者 'zh'，如果你想让中文成为默认语言
    locales: ['en'],
  },
  onBrokenLinks: 'throw',
  webpack: {
    jsLoader: isServer => ({
      loader: require.resolve('esbuild-loader'),
      options: {
        loader: 'tsx',
        format: isServer ? 'cjs' : undefined,
        target: isServer ? 'node12' : 'es2017',
      },
    }),
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: '../docs',
          sidebarPath: require.resolve('./sidebars.json'),
          editCurrentVersion: true,
          onlyIncludeVersions: isDeployPreview
            ? ['current', ...versions.slice(0, 2)]
            : undefined,
          versions: {
            [lastVersion]: {
              badge: false, // Do not show version badge for last RN version
            },
          },
          ...commonDocsOptions,
        },
        blog: {
          path: 'blog',
          blogSidebarCount: 'ALL',
          blogSidebarTitle: 'All Blog Posts',
          feedOptions: {
            type: 'all',
            copyright,
          },
        },
        theme: {
          customCss: [
            require.resolve('./src/css/customTheme.scss'),
            require.resolve('./src/css/index.scss'),
            require.resolve('./src/css/showcase.scss'),
            require.resolve('./src/css/versions.scss'),
          ],
        },
        // TODO: GA is deprecated, remove once we're sure data is streaming in GA4 via gtag.
        googleAnalytics: {
          trackingID: 'UA-41298772-2',
        },
        gtag: {
          trackingID: 'G-58L13S6BDP',
        },
      }),
    ],
  ],
  plugins: [
    'docusaurus-plugin-sass',
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'architecture',
        path: 'architecture',
        routeBasePath: '/architecture',
        sidebarPath: require.resolve('./sidebarsArchitecture.json'),
        ...commonDocsOptions,
      }),
    ],
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'smartcity',
        path: 'smartcity',
        routeBasePath: '/smartcity',
        sidebarPath: require.resolve('./sidebarsSmartcity.json'),
        ...commonDocsOptions,
      }),
    ],
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'security',
        path: 'security',
        routeBasePath: '/security',
        sidebarPath: require.resolve('./sidebarsSecurity.json'),
        ...commonDocsOptions,
      }),
    ],
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'AI',
        path: 'AI',
        routeBasePath: '/AI',
        sidebarPath: require.resolve('./sidebarsAI.json'),
        ...commonDocsOptions,
      }),
    ],
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'solution',
        path: 'solution',
        routeBasePath: '/solution',
        sidebarPath: require.resolve('./sidebarsSolution.json'),
      }),
    ],
    [
      'content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'news',
        path: 'news',
        routeBasePath: '/news',
        sidebarPath: require.resolve('./sidebarsNews.json'),
        ...commonDocsOptions,
      }),
    ],
    [
      '@docusaurus/plugin-pwa',
      {
        debug: true,
        offlineModeActivationStrategies: ['appInstalled', 'queryString'],
        pwaHead: [
          {
            tagName: 'link',
            rel: 'icon',
            href: '/img/pwa/manifest-icon-512.png',
          },
          {
            tagName: 'link',
            rel: 'manifest',
            href: '/manifest.json',
          },
          {
            tagName: 'meta',
            name: 'theme-color',
            content: '#20232a',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-capable',
            content: 'yes',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-status-bar-style',
            content: '#20232a',
          },
          {
            tagName: 'link',
            rel: 'apple-touch-icon',
            href: '/img/pwa/manifest-icon-512.png',
          },
          {
            tagName: 'link',
            rel: 'mask-icon',
            href: '/img/pwa/manifest-icon-512.png',
            color: '#06bcee',
          },
          {
            tagName: 'meta',
            name: 'msapplication-TileImage',
            href: '/img/pwa/manifest-icon-512.png',
          },
          {
            tagName: 'meta',
            name: 'msapplication-TileColor',
            content: '#20232a',
          },
        ],
      },
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      announcementBar: {
        id: 'support_ukraine',
        content:
          '🇺🇦 <a target="_blank" rel="和光科技" href="https://www.heguang-tech.cn/"> 和光科技</a>',
        backgroundColor: '#20232a',
        textColor: '#fff',
        isCloseable: false,
      },
      prism: {
        defaultLanguage: 'jsx',
        theme: require('./core/PrismTheme'),
        additionalLanguages: [
          'java',
          'kotlin',
          'objectivec',
          'swift',
          'groovy',
          'ruby',
          'flow',
          'python',
          'ini',
          'scala',
        ],
      },
      navbar: {
        title: '和光科技',
        logo: {
          src: 'img/header_logo.svg',
          alt: 'React Native',
        },
        style: 'dark',
        items: [
          {
            type: 'doc',
            docId: 'Spring Boot启动源码分析',
            label: '前沿动态',
            position: 'right',
            docsPluginId: 'news',
          },
          {
            type: 'doc',
            docId: 'LangChain：打造自己的LLM应用',
            label: '大模型',
            position: 'right',
            docsPluginId: 'AI',
          },
          {
            type: 'doc',
            docId: 'Spring Boot启动源码分析',
            label: '技术方案',
            position: 'right',
            docsPluginId: 'solution',
          },
          {
            type: 'doc',
            docId: 'architecture-glossary',
            label: '架构设计',
            position: 'right',
            docsPluginId: 'architecture',
          },
          {
            type: 'doc',
            docId: 'overview',
            label: '智慧城市',
            position: 'right',
            docsPluginId: 'smartcity',
          },
          {
            type: 'doc',
            docId: 'overview',
            label: '安全',
            position: 'right',
            docsPluginId: 'security',
          },
          {
            to: '/blog',
            label: '博客',
            position: 'right',
          },
          {
            type: 'docsVersionDropdown',
            position: 'left',
            dropdownActiveClassDisabled: true,
            dropdownItemsAfter: [
              {
                to: '/versions',
                label: 'All versions',
              },
            ],
          },
          {
            href: 'https://www.heguang-tech.cn',
            'aria-label': 'GitHub repository',
            position: 'right',
            className: 'navbar-github-link',
          },
        ],
      },
      image: 'img/logo-og.png',
      footer: {
        style: 'dark',
        links: [
          {
            title: '大模型',
            items: [
              {
                label: 'LangChain',
                to: 'AI/LangChain：打造自己的LLM应用',
              },
            ],
          },
          {
            title: '安全',
            items: [
              {
                label: '漏洞检测',
                to: 'security/overview',
              },
            ],
          },
          {
            title: 'Find us',
            items: [
              {
                label: 'Blog',
                to: 'blog',
              },
              {
                label: 'Twitter',
                href: 'https://twitter.com/gaojunivas',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/BrunoGao?tab=repositories',
              },
            ],
          },
          {
            title: 'Explore More',
            items: [
              {
                label: 'hg-tech',
                href: 'https://www.heguang-tech.cn/',
              },
            ],
          },
        ],
        logo: {
          alt: 'hg-tech',
          src: 'img/heguang.png',
          href: 'https://www.heguang-tech.cn/',
        },
        copyright,
      },
      algolia: {
        appId: 'VQ6W6FSK2C',
        apiKey: 'a2953f1561fd3716177ddbeb9e84405e',
        indexName: 'he-tech',
        contextualSearch: true,
      },
      metadata: [
        {
          property: 'og:image',
          content: 'img/hg-logo.png',
        },
        {name: 'twitter:card', content: 'summary_large_image'},
        {
          name: 'twitter:image',
          content: 'img/hg-logo.png',
        },
        {name: 'twitter:site', content: '@hg-tech'},
      ],
    }),
};
