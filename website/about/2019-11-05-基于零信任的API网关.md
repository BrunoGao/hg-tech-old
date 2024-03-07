---
author: 和光科技
title: "基于零信任的API网关"
description: "基于零信任的API网关。"
publishdate: 2019-11-05
tags: [零信任]
summary: >-
  网站加载可以通过服务端渲染 SSR 来优化。性能监控可以使用 pageSpeed、lighthouse、web-vitals 等工具。性能指标包括
  FCP、LCP、FID、CLS 等。缓存可以减少 HTTP 请求，提高加载速度。网络优化包括减少 HTTP 请求、使用 HTTP2、HTTP 缓存
  304、DNS 预解析、开启 gzip 等。JS 优化包括使用 web worker、requestAnimationFrame
  实现动画、事件委托等。CSS 优化包括减少 css 重绘回流、css 放头部，js 放底部、降低 css 选择器复杂度等。静态资源优化包括使用 CDN、JS
  懒加载、图片懒加载、webp 格式、渐进式图片优化体验、响应式图片等。SEO 优化包括 html 标签语义化、减少不必要的元素、图片要有含义清晰的 alt
  描述、图片给定宽高、TDK、结构化数据、爬虫不爬取该链接、指定落地页、h1 和 h2 合理使用等。
---


## 传统API Gateway

API Gateway是一种服务，它是外部世界进入微服务或者云原生应用的入口点。它负责请求路由、API组合和身份认证等功能。

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA55Sw6YeO6YeM55qE56i76I2J5Lq6,size_20,color_FFFFFF,t_70,g_se,x_16.png)

## 和光科技API Gateway优势


和光科技的gateway集成了nacos和sentinel,结合灰度发布可以做到API全生命周期管理，以及运行过程中的限流降级。同时基于大数据引擎和零信任保证API的安全。



![image-20220919174713401](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20220919174713401.png)

![image-20220919175000254](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20220919175000254.png)

### API Gateway数据控制流程图



![image-20220919174752361](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20220919174752361.png)





### 基于零信任的API Gateway流程图

![image-20220919183732763](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20220919183732763.png)

