/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const users = require('./showcase.json');
const versions = require('./versions.json');
const getI18nContent = require('./src/utils/getI18nContent');
const lastVersion = versions[0];
const copyright = `Copyright © ${new Date().getFullYear()} hg-tech
<a href=\"http://beian.miit.gov.cn\" target=\"_blank\" rel=\"noopener\">粤ICP备19161989号-4</a>"
`;

const commonDocsOptions = {
  breadcrumbs: false,
  showLastUpdateAuthor: true,
  showLastUpdateTime: true,
  editUrl: 'https://github.com/BrunoGao/hg-tech/blob/main/website',
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
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans','en'],
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
          blogDescription: 'Blog',
          blogSidebarCount: 'ALL',
          blogSidebarTitle: '全部博客',
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
          trackingID: 'G-K44B50BVKQ',
        },
      }),
    ],
  ],
  plugins: [
    'docusaurus-plugin-sass',
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'architecture',
        path: 'architecture',
        routeBasePath: '/architecture',
      }),
    ],
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'about',
        path: 'about',
        routeBasePath: '/about',
      }),
    ],
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'security',
        path: 'security',
        routeBasePath: '/security',
      }),
    ],
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'AI',
        path: 'AI',
        routeBasePath: '/AI',
      }),
    ],
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'solution',
        path: 'solution',
        routeBasePath: '/solution',
      }),
    ],
    [
      '@docusaurus/plugin-content-blog',
      /** @type {import('@docusaurus/plugin-content-blog').Options} */
      ({
        id: 'news',
        path: 'news',
        routeBasePath: '/news',
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
        id: 'hg-tech',
        content:
          ' <a target="_blank" rel="和光科技" href="https://www.heguang-tech.cn/"> 和光科技</a>',
        backgroundColor: '#20232a',
        textColor: '#fff',
        isCloseable: false,
      },
      giscus: {
        repo: 'BrunoGao/hg-tech',
        repoId: 'R_kgDOLaQtIw',
        category: 'Announcements',
        categoryId: 'IC_kwDOLbrHOs4CduQ6',
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
          'yaml',
          'cpp',
        ],
      },
      navbar: {
        title: '和光科技',
        logo: {
          src: 'img/header_logo.svg',
          alt: '和光科技',
        },
        style: 'dark',
        items: [
          {
            to: '/news',
            label: '前沿动态',
            position: 'right',
          },
          {
            to: '/AI',
            label: '大模型',
            position: 'right',
          },
          {
            to: '/solution',
            label: '技术方案',
            position: 'right',
          },
          {
            to: '/architecture',
            label: '架构设计',
            position: 'right',
          },
          {
            to: '/security',
            label: '安全',
            position: 'right',
          },
          {
            to: '/blog',
            label: '博客',
            position: 'right',
          },
          {
            to: '/about',
            label: '关于和光',
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
          {
            type: 'localeDropdown',
            position: 'right',
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
              {
                label: 'Stable diffusion',
                to: 'AI/实现Stable diffusion自由',
              },
              {
                label: '大语言模型技术原理',
                to: 'AI/大语言模型技术原理',
              },
            ],
          },
          {
            title: '架构设计',
            items: [
              {
                label: '人人都是架构师-清晰架构',
                to: 'architecture/人人都是架构师-清晰架构',
              },
              {
                label: '详细分析Spring的AOP源码',
                to: 'architecture/详细分析Spring的AOP源码',
              },
              {
                label: 'Spring Boot启动源码分析',
                to: 'architecture/Spring Boot启动源码分析',
              },
            ],
          },
          {
            title: '联系我们',
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
            title: '获取更多',
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
        apiKey: '6f537e61849a9186c1c7884cfe673317',
        indexName: 'hg-tech-newUI',
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
  clientModules: [require.resolve('./src/clientModules/routeModules.ts')],
};
