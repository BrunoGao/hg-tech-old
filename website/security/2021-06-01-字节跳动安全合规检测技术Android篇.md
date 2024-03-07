---
authors: 字节跳动终端技术
title: "字节跳动安全合规检测技术Android篇"
date: 2021-06-01
tags: ["云安全"]
description: "字节跳动安全合规检测技术之Android篇。"
summary: >-
  网站加载可以通过服务端渲染 SSR 来优化。性能监控可以使用 pageSpeed、lighthouse、web-vitals 等工具。性能指标包括
  FCP、LCP、FID、CLS 等。缓存可以减少 HTTP 请求，提高加载速度。网络优化包括减少 HTTP 请求、使用 HTTP2、HTTP 缓存
  304、DNS 预解析、开启 gzip 等。JS 优化包括使用 web worker、requestAnimationFrame
  实现动画、事件委托等。CSS 优化包括减少 css 重绘回流、css 放头部，js 放底部、降低 css 选择器复杂度等。静态资源优化包括使用 CDN、JS
  懒加载、图片懒加载、webp 格式、渐进式图片优化体验、响应式图片等。SEO 优化包括 html 标签语义化、减少不必要的元素、图片要有含义清晰的 alt
  描述、图片给定宽高、TDK、结构化数据、爬虫不爬取该链接、指定落地页、h1 和 h2 合理使用等。
---


业务安全合规检测通过 CI/CD 阶段卡口，针对新增代码进行分析检查、合码管控、问题溯源，针对构建产物进行发版管控，避免隐私、合规相关问题被带到线上引发安全合规风险。

# 背景

## 1. 业务背景

随着互联网技术的高速发展，国内外用户隐私数据相关法律法规日趋完善、行政管制也趋于常态化、用户隐私数据安全意识也在逐步提升，移动应用上线后出现隐私数据安全合规问题的风险也越发不可控。

以下简要列举近年来国内外隐私合规相关法律法规与通知通报：

> 2021-03-21｜工信部｜[《关于侵害用户权益行为的APP通报（2021年第3批，总第12批）》](https://link.juejin.cn?target=https%3A%2F%2Fwww.miit.gov.cn%2Fjgsj%2Fxgj%2Fgzdt%2Fart%2F2021%2Fart_8eada0a58662420e816487ceded5d3fa.html)
>
> 2020-07-24｜工信部 ｜[《关于开展纵深推进APP侵害用户权益专项整治行动的通知》](https://link.juejin.cn?target=https%3A%2F%2Fwww.miit.gov.cn%2Fjgsj%2Fxgj%2Fgzdt%2Fart%2F2020%2Fart_c5f69af7882247198657b2ac6777ad62.html)
>
> 2019-12-30｜工信部｜[《App违法违规收集使用个人信息行为认定方法》](https://link.juejin.cn?target=https%3A%2F%2Fwww.miit.gov.cn%2Fjgsj%2Fwaj%2Fwjfb%2Fart%2F2020%2Fart_8663d2afe61b40c3beb7c65bf6ec2a64.html)
>
> 2019-02-27｜美国｜《数据隐私法案》
>
> 2018-05-25｜欧盟GDPR｜《通用数据保护条例》

## 2. 技术背景

如下图，业务安全检测被纳入质量检测体系后，主要在 CI（Continuous Integration，持续集成）、CD（Continuous Delivery，持续交付）阶段建立检测卡口，一旦发现存在业务安全合规风险，即阻止代码合入或阻止应用发布、以此规避业务安全合规风险。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/7ade4c34409d405596731404da872c47~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

# 现状与难点

## 现状

我们首先针对比较核心的需求（如：敏感API、敏感权限、敏感字符串）基于 gradle transform 和 ASM 实现了对 Android 编译中间产物的检测，即 CI 中间产物检测。

### CI 中间产物检测

大致的扫描过程如下图所示：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/df829e23427640ee9adbd29182ea0574~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

> 当 feature1 分支完成开发测试、准备合入 develop 分支时，
>
> **首先**，会同时触发拉出 feature1 分支的节点和待合入develop分支的节点分别进行构建打包；
>
> **然后**，两个节点在各自的构建过程中分别对编译中间产物进行分析检查、将命中规则的方法作为 issue 进行记录，构建结束即可分别得到图示中的 “初始全量问题” 和 “当前全量问题”；
>
> **接着**，再对 “初始全量问题” 和 “当前全量问题” 进行 diff（差分）、即可得到 feature1 分支从创建到合入主分支之间新增的问题；
>
> **最后**，对存在增量问题的 MR 进行管控、阻止该分支代码合入主分支，直到 RD 修复所有增量问题或者报备、审批通过后方可合入。

### CD 产物检测

Scanner 是 Android CD阶段的产物检测工具，基于 aapt、apktool、keytool、strings 等命令行工具实现了对apk/aar/aab/so 等 Android 相关二进制产物的安全检查。大致工作流程如下图所示：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/3635ee3e16ac4194a82b03772b7d2200~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

Scanner 对 Android 二进制产物中最重要的字节码的扫描，是基于 apktool 反编译得到的 smali 文件，先反编译、然后并发逐行扫描 smali 文件，检查是否存在安全合规问题。

- smali 文件示意图

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/78afef4a5f6c4ae7bf54c00757fbc3f4~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

- Dex 反编译生成 smali 时序图

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/18fbf2f0eb804e568334e81cafeae0ed~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

## 难点

### 1. CI 业务安全检测无法覆盖源码

如何对开源代码中包含的 License 信息进行合规检查？显然 CI 中间产物检测无法满足需求，只能基于源码进行。

### 2. CI 业务安全检测检出问题定位成本高

由于 Android 编译中间产物对应的源码在构建时经过脱糖等一系列优化处理，源码文件中的语法糖、行号等原始信息均已无法还原，这就给检出问题的定位、排查增加了很大的工作量。

### 3. CD 产物检测基于敏感调用点潜藏的漏放风险

CD 阶段基于 smali 文件的扫描往往只能扫描出敏感 API 的直接调用位置，而无法覆盖所有的调用链条，这就给问题的审核带来了挑战。

> 如下图，以剪切板相关 API 为例，同一条敏感 API 可能既存在常规的调用场景、又存在非法的调用场景，当非法调用出现在新增间接调用场景、而该调用点又在老版本评估 “不需整改”，此时就会存在问题漏放风险。同时，调用点在问题排查时信息量有限、往往需要花费一定的精力去搜索/分析，不利于问题的定位与解决。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/c2d29ceb2fbb4b36bb616fa45332cc6c~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

# 改进与收益

为了解决 CI 中间产物检测无法覆盖源码相关检测、检出问题定位成本高等问题，我们又实现了一套 CI 增量源码检测。大体思路是基于 git diff 获取每个 MR 对应的所有新增源码（包含一二方组件），然后再对这些增量源码进行各项安全检查与合码管控，即 CI 增量源码检测。

## CI 增量源码检测

获取一次 MR 过程中增量源码的主要步骤包含以下 3个子流程：获取源码变更信息子流程、源码 diff 子流程、精准获取组件增量源码子流程。下面结合流程图分别对 3 个关键子流程做详细说明：

### 1. 获取源码变更信息子流程

源码变更信息包含 主仓/子仓的源码仓库及commit信息、变更组件所在的源码仓库及commit信息。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/58acd42ebafe464c880ac111067557de~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

> 以 Android 工程为例，
>
> **首先**，研发人员提交 MR 时触发检查，可直接获得 主仓/子仓的源码变更信息（仓库地址、base commit、review commit）；
>
> **然后**，根据主仓的源码变更信息、分别下载主仓两个 commit 的工程源码；
>
> **接着**，通过 gradle 命令（iOS 通过 pod 命令）分别获取主仓两次 commit 的组件依赖树信息，解析组件依赖树并对其进行 diff（差分）、即可得到两次提交之间的组件变更信息（新增组件和更新组件）；
>
> **最后**，通过组件管理模块，根据组件变更信息中的 maven坐标 和 版本号，可以获取组件的原始 git 仓库以及两个版本号各自对应的 commit 信息，即变更组件所在的源码仓库和 commit 信息。
>
> 组件变更存在新增组件、更新组件和删除组件等操作，增量源码只需关注新增组件和更新组件。
>
> 组件管理模块负责组件的发布、升级，会记录组件的原始 git 仓库、版本号与 commit 的对应关系。其没有记录的组件为三方组件，三方组件无源码、不需考虑。

### 2. 源码 diff 子流程（关键）

基于已经获得的源码变更信息，源码 diff 子流程如下图所示：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/cc0bd61da60e40a79c18c48d0fc901bf~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

- 主仓/子仓及更新组件主要步骤

> **首先**，下载 MR 准备合入主分支的 commit（即图示中的 review commit）对应工程的源码；
>
> **然后**，通过 git diff 命令获取 base commit 和 review commit 之间的代码变更信息；
>
> **接着**，遍历代码变更信息（对更新组件还需过滤组件目录下的代码变更信息）、获取存在新增源码或更新源码的文件及变更的行号信息（diffs 结果中以 "+" 开头的变更行），将所有的源码变更文件及其变更行号信息记录下来压缩进 zip 包（即增量源码包）；
>
> **最后**，将增量源码包上传到服务器、供下游的各种检测服务使用。

- 新增组件

> 新增组件与更新组件的区别在于新增组件需要对组件包含的源码进行全量获取，组件源码文件中的每一行都需要进行检查，其他步骤与更新组件完全一致。

### 3. 精准获取组件增量源码子流程

一个库工程（git 工程）中可能存在大量的组件（甚至混合 Android、iOS组件），我们获取到变更组件所在源码仓库的代码变更可能包含其他组件的内容，为避免误报、需要获取组件在其源码仓库中的精准路径

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/562d064ec3be45c58f6594b7855db595~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

> 以 Android 工程为例，
>
> **首先**，通过组件管理模块获取组件所在源码仓库中的模块名称、将 gradle 自定义 task 注入组件源码仓库；
>
> **然后**，执行 gradle 自定义 task 获取源码仓库中所有组件的模块名称与对应的源码路径；
>
> **接着**，匹配变更组件的模块名称、获取变更组件的源码路径；
>
> **最后**，在源码 diff 子流程遍历代码变更信息时通过组件路径过滤出变更组件的增量源码信息，将变更组件的增量源码打入增量源码包，实现组件增量源码的精准获取。

### 4. 完整流程

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/9029d90841e04870b80fec41de4baf71~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

### 收益

#### 1. 覆盖了 Android/iOS 双端的源码检测

原先基于编译中间产物的检测仅能支持 Android 工程，对于 iOS 还需要额外实现一套检测方案。而 CI 增量源码检测不仅覆盖了 Android/iOS 双端主/子仓的源码检测需求，而且还覆盖了该次编译所涉及的所有新增/变更一二方组件的增量源码检测，满足了 License 合规检测以及开源项目的安全合规检测需求。

#### 2. 实现了检出问题的自动精准定位与问题聚合

**基于源码，我们实现了将检出的问题与其对应的代码仓库、组件目录、源码文件、问题所在行数进行自动精准关联，同时还可以按照仓库/组件等维度将问题自动进行聚合、分发给不同的 Owner 跟进处理，大大提高了问题的消费效率、降低了问题的定位解决成本。**

## CD 产物检测

### Android 产物检测

由于在 scanner 扫描过程中存在大量 IO 操作（反编译生成 smali 文件、逐个扫描 smali），尽管采用了并发等手段，其扫描时间依然较长（多次扫描同一个 86M 的包平均耗时 175.28s）。

- smali 扫描流程

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/d292d83241984c44ae1ec0135c0e21f8~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

> 在 smali 扫描过程中有两个特别耗时的环节，一个是扫描 dex/apk 生成 smali 文件、另一个是批量扫描生成的 smali 文件进行安全合规检查。
>
> 思考：如果前一个环节我们能直接在内存中完成敏感信息的安全合规检查、同时不生成 smali 文件，扫描耗时是否可能大幅降低呢？

- dex 扫描流程

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/1c87304c25444d08b4d03781290969ee~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

**在我们的实验过程中直接基于 Dex 提取 method callgraph，使用同样的规则、多次扫描同样的包（86M），平均扫描时间由原先的 175.28s 进一步降低到 32.72s，大大提升了包检测扫描的效率。**

### BDAnalysis引擎

针对前面提到的 “基于敏感调用点潜藏的漏放风险”，假设我们能够知道函数调用关系，就能从调用点关联到上层业务代码，从点到链扩展检测维度，根本上解决间接调用检测遗漏的问题。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/2ca36c106bf24bf29c0f2b844d1f353d~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

- 调用链

顾名思义，从调用点到 "main" 之间的链路。

对于 Android 应用而言，一般没有 main 入口，需要根据Android特性，去模拟一个假的 main 入口，一般叫 DummyMain： 四大组件和 Application 生命周期函数；xml 绑定的函数，比如 onclick、databinding 等。

- 调用链的优点
  - 关联上层业务代码、助力问题的快速定位与解决；
  - 基于 CallGraph 覆盖所有调用场景，助力 SDK依赖梳理、API 调用梳理。

### 收益

#### 1. 基于 BDAnalysis 实现了调用链的生成

调用链的生成对于敏感问题的排查意义重大，业务方可以根据生成的调用链按图索骥、找到问题实际的调用链路，避免了间接调用造成的漏放风险。

#### 2. 调用链技术被应用于 API 调用与 SDK 依赖梳理等场景

在我们生成调用链、助力问题的快速定位解决、实现了 API 调用场景的梳理后，我们又进一步实现了 SDK 依赖梳理。所谓 SDK 依赖梳理，就是扫描出 SDK 中所有 public 未混淆 API、然后进一步扫描出这些 API 在 apk 中的所有调用链，通过 SDK 依赖梳理，我们可以轻而易举地梳理出 apk 具体在哪些业务场景下、通过哪些接口依赖了 SDK. 进而很容易地判断出敏感 API 的调用情况，也可以助力 SDK/模块 之间的解耦。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/bb0f1325fc18440c9104a49205680523~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

# 总结与展望

## 总结

本文首先从业务安全合规检测的业务背景和技术背景入手，介绍了 CI/CD 阶段业务安全合规检测的现状与难点，然后介绍了我们在 CI/CD 阶段分别做出的改进：CI 增量源码检测、BDAnalysis 引擎，及相应的收益。

CI 增量源码检测覆盖了 Android/iOS 双端主/子仓及其所依赖一二方组件的源码检测、实现了检出问题的自动精准定位与问题聚合，大大提升了检出问题的消费效率；CD 产物检测基于 BDAnalysis 引擎实现了调用链的生成、弥补了可能存在的漏放风险、同时我们也用 dex 扫描替代 smali 扫描将 CD 产物检测的平均耗时从 175s 降低至 32s，大大提升了检测工具的精度与速度。

CI/CD 业务安全合规检测还存在一些不足之处，比如效果指标建设、CI/CD 数据打通等，针对这些不足，我们后续将逐步进行完善、持续为各大业务 Android 端应用安全合规地运行保驾护航。

## 展望

### CI 业务安全检测

- 工具定位。主推 CI 增量源码检测、发挥其精准溯源优势；CI 中间产物检测辅助校验检测结果、避免 issue 漏放。
- 指标建设。在现有技术指标的基础上、完善效果指标，建设 issue “检出率”、“消费率”、“误报率”、“满意度”等指标。
- 数据打通。打通 CI/CD 调用链，升级 issueID打通方案。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/bc7b6dff5a5840928f1f3c75599ac907~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

## CD 业务安全检测

- 工具定位。检测工具逐步废弃 Scanner 工具，建设功能强大的新检测工具 BDInspect.
- 指标建设。针对新老检测工具与 BDAnalysis 引擎建设相应的技术指标及自动告警机制。
- 引擎建设。建设 BDAnalysis 引擎，实现调用链与赋值链落地到更多业务场景。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/18c007eb434e4692bd0b08cd870dbc78~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

# 关于字节终端技术团队

字节跳动终端技术团队(Client Infrastructure)是大前端基础技术的全球化研发团队（分别在北京、上海、杭州、深圳、广州、新加坡和美国山景城设有研发团队），负责整个字节跳动的大前端基础设施建设，提升公司全产品线的性能、稳定性和工程效率；支持的产品包括但不限于抖音、今日头条、西瓜视频、飞书、瓜瓜龙等，在移动端、Web、Desktop等各终端都有深入研究。