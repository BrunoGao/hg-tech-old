---
title: 货拉拉 OLAP 体系演进
description: 10 亿数据秒级关联，货拉拉基于 Apache Doris 的 OLAP 体系演进
publishdate: 2022-08-04
author:  货拉拉技术
tags: ["OLAP"]
categories: ["前沿动态"]
type: "post"
image: "https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/huolala.jpeg"
---



> **导读**：本文是货拉拉大数据引擎负责人杨秋吉在 DataFunSummit 2022 多维分析架构峰会上的演讲分享，分享的主题是《货拉拉基于 Apache Doris 的 OLAP 体系演进及建设方法》，详细讲解了货拉拉从 OLAP1.0 到 3.0 的演进过程，其中不乏有值得借鉴的方法论以及深刻的技术思考，希望能对大家有所帮助。

分享人｜货拉拉大数据引擎负责人 杨秋吉

# 业务背景

货拉拉成立于 2013 年，成长于粤港澳大湾区，是一家从事同城、跨城货运、企业版物流服务、搬家、汽车销售及车后市场服务的互联网物流公司。截至 2022 年 4 月，货拉拉的业务范围已经覆盖了国内 352 座城市，月活司机达到 58 万，月活用户达到 760 万，包含 8 条以上的业务线。

货拉拉大数据体系为支撑公司业务，现在已经成立三个 IDC 集群、拥有上千台规模的机器数量，存储量达到了 20PB、日均任务数达到了 20k 以上，并且还处在快速增长的过程中。

# 大数据体系

货拉拉大数据体系从下往上分为 5 层，最下面的是 **基础层和接入层** ，这两层主要会提供基础数据的存储、计算以及集群的管理功能。在基础层和接入层之上是**平台层和数仓**。在平台层之中包含了数据研发平台和数据治理平台，基于平台层的能力和数据仓库的数据体系，在这之上面包含了含有业务属性的**服务层和应用层**。整个体系自下而上相互支持，实现支持业务和赋能业务的能力。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/5c80a5b7453a49b889e160d82cf3a9a2~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图1.1 货拉拉大数据体系

## 数据处理流

货拉拉典型的数据处理流，可以分成数据集成、数据采集、数据存储计算和数据服务四部分，同时也包含了实时、离线以及在线三大业务场景。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e01874084bf14659842f72086a2b5315~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图1.2 货拉拉大数据数据流

在数据采集阶段存在实时采集和离线采集两条路线。

- 实时采集比较典型的场景为用户端上埋点直接同步到大数据平台做存储，供后续的在线和离线计算使用。
- 离线的数据主要是来自于业务方的数据库，会以天或小时为周期，定期采集到大数据存储中，以供后续使用。

中间是数据的存储和计算阶段。在离线场景中会通过对数据 ETL 之后转换为构造数仓的分层体系。实时比较典型的场景为数据在经过 Flink 的处理后会直接落在线存储系统，类似于 HBase 和 OLAP 等等，为后续的业务系统提供数据服务。

# OLAP 演进概览

货拉拉从 2021 年开始进行 OLAP 的技术研究，**截至目前已经经历 3 个阶段：**

- 2021 年上半年为货拉拉的 **OLAP1.0 阶段**，这个阶段主要是支持公司的罗盘业务，引入的是能够提供较好的单表聚合和查询能力的 Apache Druid 引擎。
- 2021 年下半年为货拉拉的 **OLAP2.0 阶段**，这个阶段主要是支持智能定位工具，引入了够提供单表明细查询，并且还有较高压缩率的 ClickHouse。
- 今年为货拉拉的**OLAP3.0 阶段**，伴随着公司业务需求的不断增多，需要用到多数据源的关联分析。基于此，由于 Apache Doris 具备大表关联分析的能力，最后引入了 Apache Doris 引擎。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/7797e0bb64604625a4ddede45d7f5430~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图2.1 货拉拉OLAP体系演进过程

## OLAP1.0 孕育期

### 业务需求分析

先看下没有引入 OLAP 之前的业务数据流： ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/33788c80789c4ce6a96f2395bd259987~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.1 OLAP1.0业务场景

根据该图可以看到业务的数据通过实时和离线处理之后会落在 MySQL，MySQL 中储存了维度聚合之后的结果数据，这也意味着会在 Flink 之中做大量的聚合分析，根据业务需要的相应维度所做的一系列组合都是在Flink之中做实时聚合，最后将结果储存到 MySQL。

### 存在的问题

- 存在存储瓶颈，类似于 Kylin 之中的维度爆炸的问题。
- 开发成本高、效率低。当业务侧需要新增维度的时候需要对 Flink 中的所有作业都做一定的修改，然后再重新上线。
- 无法支持部分聚合需求。

对于存在的这些问题，经过分析之后，**总结出了 3 个背后存在的需求点：**

- 能够横向扩容，解决存储瓶颈。
- 能够自由组合维度做分析，提升开发效率。
- 能够支持任意时间窗口的分析。

### 解决方案

根据业务需求，并通过调研，决定使用 OLAP 引擎来支持业务需求。那如何选择一款 OLAP 引擎，并把它稳定的应用到生产之中呢？

**我们总结了如下的 4 个步骤作为解决思路：**

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/8fac5a927c7e473a9bff97cccb6d0ff0~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.2  OLAP 1.0 解决思路

#### 技术调研

技术调研阶段，对比了 Druid、ClickHouse、Kylin、Presto 和 Doris 等等引擎。结合上述的 3 个业务需求，最终选择了 Druid 引擎 。

原因是 Druid 除了能够满足业务需求之外，还有一个比较重要的影响因素是 Druid 引擎是纯 Java 开发，与部门的技术栈比较吻合，可控性更高。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e7436d4582c745e0b0d73be7955ad030~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.3  OLAP1.0技术调研

#### POC 阶段

**POC 过程中，从以下 3 个步骤着手：**

- **功能验证。** 在功能验证中，我们收集了业务侧的 SQL，之后提取 SQL Pattern，再根据 Druid 引擎的 Rollup 语义做 SQL 的改写，涉及到大量 UDF 的改写、Rollup 语义兼容以及 Count Distinct 语义兼容等等。
- **性能验证。** 直接采用业务真实的数据和业务真实的 SQL 来执行。验证过程中将 Cache 关闭，分别统计 P75、P90、P99 的查询耗时。在这过程中，有部分查询的性能没有达到要求，之后做性能分析发现Druid 引擎本身没有比较完善的性能分析工具，不能够很好的打印出执行计划以及各个算子的耗时，所以采用了第三方的 Arthas 火焰图进行分析。定位到相应的耗时算子后，通过优化建表导数和索引构建的逻辑（主要通过调整 Segment 大小和一些参数的调整，同时加入物化视图），优化性能。
- **准确性验证。** 将业务真实数据同时写 Hive 和 Druid，之后跑 Hive SQL和 Druid SQL，来进行数据质量的校对。在这个过程中发现例如 Druid StringLast 等一些函数会在特定的场景下出现计算值不稳定的问题，最后通过代码优化使之达到稳定。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/cf57a298fd2249e0868dc7d5f6877906~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.4 OLAP1.0 POC 验证

#### 稳定性保障

当 POC 验证完成之后，接下来是稳定性保障体系的建设。我们将**稳定性保障分为事前、事中、事后 3 个阶段：**

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/01cf913aa8ef401ab17f44ee888fc313~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.5 OLAP1.0 稳定性保障

#### 上线阶段

当稳定性保障体系建立完成之后就进入了上线阶段。**上线同样分成了 3 个阶段**：

- **OLAP测试阶段。** 在这个阶段中，业务的数据会接入到 Druid 之中，但是业务的真实查询还是通过原来的 MySQL 库。这个阶段主要会验证 Druid 引擎的数据质量和 Druid 集群的稳定性。
- **上线观察阶段。** 在这个阶段，业务的查询会切到 Druid。同时旧的 MySQL 链路还没有下线，业务侧能够随时切回 MySQL 链路。
- **OLAP运行稳定阶段。** 下线 MySQL 链路，做资源的回收。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/320a8760b3ec4b4b8387dfda2cef88b1~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.6 OLAP1.0 上生产

### 问题总结

**下面总结了 1.0 阶段时遇到的问题：**

- 数据导入部分中，实时数据乱序为典型问题。
- 在数据准确性验证阶段发现 StringLast 的函数值不稳定。
- Druid 没有一个高效的精准去重的函数。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/89f98135e66048e4beac89f884b83013~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图3.7 OLAP1.0 问题总结

## OLAP2.0 完善期

### 业务需求分析

**在 OLAP2.0 阶段主要有以下 4 个业务需求：** ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/1150161d42f94ed293cbf5312a475d4c~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图4.1 OLAP2.0 业务需求分析

下图是简单的业务工具的截图，从图中可以看到，**OLAP2.0 需要能够支持汇总与明细，同时基于这些能力能够做一个快速的问题定位。** ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/05e2bb4e8e35410ebaf3dc0d4c8ca689~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图4.2 OLAP2.0 业务需求分析骤去实现。

### 解决方案

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/0ff90e95b0564e888200f139ca8fd56f~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图4.3 OLAP2.0 技术调研

OLAP2.0 引入了 ClickHouse。ClickHouse 能够比较好地支持复杂的数据类型，同时因为业务侧是埋点数据，对于实时导入语义要求并不高。

**没有采用 Druid 主要是有 2 个原因：**

- Druid 对于复杂的数据结构支持度并不是很好。
- Druid 虽然能够支持明细查询，但是 Druid 的明细查询和聚合查询得分成不同的表，这样就会额外的引入一系列的存储成本。

剩下的部分就是 POC 、上生产的步骤，这两个步骤和 OLAP1.0 阶段比较类似，在这里就不过多展开介绍。

## OLAP3.0 成熟期

### 业务需求分析

2022 年随着公司业务的发展，更多的产品线对于多数据源关联场景下的在线分析需求也变得越来越迫切。比如 AB 实验场景与实时数仓场景，这两个场景对于多表关联需求，尤其是大表的多表关联需求也变得越来越迫切。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e39dbd4ac6204a09b25d577ee3bdc321~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.1 OLAP3.0 需求分析

举一个 AB 实验的例子。从下图可以看到，例子中是需要把 AB 实验的一个数据和后面相应的司机与用户的埋点数据关联到一起并做分析。**在这种情况下，就发现之前的两种工具都会存在一系列的弊端。**

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/57e4aa67b00b460596b0827ce606ce1f~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.2 OLAP3.0 需求分析

### 解决方案

#### 技术调研

在技术调研阶段我们观察了 Druid 和 ClickHouse。Druid 引擎可以支持一些维表的简单 Join，ClickHouse 则能够支持 Broadcast 这种基于内存的 Join，但对于大数据量千万级甚至亿级的表 Join 而言，ClickHouse 的性能表现不是很好。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/5516512563c244bf96cb7c4205d480cd~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.3 OLAP3.0 技术调研

接下来对 Doris 进行了调研，发现 Doris 是不仅能够支持小表的 Join，对大表的话也同样能够支持基于 Shuffle 的 Join，对于复杂数据类型（Array、JSon）的支持，经过跟 Apache Doris 社区沟通，预计将在 2022 年 7 月份的新版本中发布。通过在多个维度和需求满足度上进行对比，**最终选择了 Apache Doris，也是因为 Apache Doris 的 SQL 支持度非常完善。**

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/ebb550a9e4734925bbb2d729eb329986~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.4 OLAP3.0 技术调研

#### POC 阶段

本次POC阶段除了引用业务真实的数据和场景做验证以外，还引入了 TPC-DS 的数据集做了验证。在多表关联的场景下对单天数据进行查询，对 5 亿左右的数据量进行 Join，TP75 大概是 9 秒左右。在数据质量阶段我们也是把 TPC- DS 的数据集以及业务真实数据集，分别在 Hive 和 Doris 里面做了双跑验证，发现两者都是能够完全对得上的。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e76dc6dc61f54ecb9f33efd29cbd79cb~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.5 OLAP3.0 POC

#### 稳定性保障

与之前一样依然是从事前的容量评估和压测、事中的监控和定位来进行。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/c5ea5f7c098244db9e39c405c89008f3~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.6 OLAP3.0 稳定性测试

下面是Doris的监控图，主要是关于 Compaction 相关的一些监控，感兴趣的同学可以看看。（文末 QA 环节有部分讲解）

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/7cbb378c4bc54a0a861606227b88eae4~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.7 OLAP3.0 稳定性监控

### 问题总结

#### 问题1: Doris查询性能的优化。

业务侧的需求是 7 天的查询 RT 需要在 5 秒内完成，在优化前，我们发现 7 天的查询 RT 是在 30 秒左右。对于这个问题，优化策略是把小表 Join 大表改成了大表 Join 小表，主要原理是因为 Doris 默认会使用右表的数据去构建一个 Hashtable。还有类似下图中的情况：union all 是在子查询中，然后再和外层的另外一张大表做 Join 的查询方式。这种查询方式没有用到 Runtime Filter 的特性，因此我们将 union all 提到子查询外，这样就能够用到 Runtime Filter，这应该是由于这里的条件下没有推下去所导致的。同时运行时采用的 Bloom Filter 是可以将 HashKey 条件下推到大表 Scan 阶段做过滤。在经过对这两者优化之后便能够满足业务的查询性能需求了。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/d43e0544e05a4cb5a153a3db2ae86e1e~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.8 OLAP3.0 问题1

#### 问题2: UnhealthyTablet 不下降，并且在查询阶段会出现 -230 的报错。

这个问题的场景是在没有停 FIink 写任务的时候，对 BE 机器交替重启，重启完会出现很多 UnhealthyTablet。经过分析发现，原因一是 Coordinator BE 的二阶段提交 Commit 后，大部分的副本是已经 Commit 后且在 Publish 前，在这短短的时间范围内 BE 机器被重启，这也就导致会出现 Tablet 状态不一致的情况。原因二是由于参数(max_segment_num_per_rowset)调整的过大，导致了 Compaction 压力过大。

**最后的解决办法：** 与 Aapache Doris 社区的同学经过互助排查，引入了社区 1.1.0的 Patch，同时对相应的数据做了恢复。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/7f21ba126590403eae123dcd149f2b00~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.9 OLAP3.0 问题2

### 参数优化

- **打开 Profile**。Doris 对于查询的性能分析具有非常好的 Profile 文件，这一点是非常赞的！我们可以看到各个算子在每一个阶段的查询耗时以及数据处理量，这方面相比于 Druid 来说是非常便捷的！
- **调大单个查询的内存限制**，同时把 BE 上的执行个数由 1 个调整成为 8 个，并且增加了 Compaction 在单个磁盘下的数据量。对于 Stream Load，把 Json 格式的最大的内存由 100 兆调整成为 150 兆，增大了 Rowset 内 Segment 的数量，并且开启了 SQL 级和 Partition 级的缓存。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/45bd20c7da4f4c7bb093b1a86448c933~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.10 OLAP3.0 参数优化

### 数据流

**下图是使用 Doris 之后的数据流图：** ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/1de7e15512744e01afae69b899f37116~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图5.11 OLAP3.0 数据流

数据流中，在 Flink 中做的事情已经很少了，经过数据简单的 ETL 后就可以把数据直接灌入到 Doris。经过 Doris 一系列的聚合计算、union 计算以及多表关联计算之后，业务侧就可以直接查询 Doris 来获取相关数据。

# 总结与思考

**总结：** 我们 OLAP 的引进主要还是从业务需求的角度出发来匹配合适的引擎，为业务精细化运维提供技术支持。在这之后，我们也思考了一套较为完善的上线流程及稳定性保证方案，为业务的平稳运行提供能力保障。

**思考：** 我们认为很难有单个引擎能够富含各种场景。因此在技术选型时，需要针对于需求特点和引擎特点进行合理选择。

# 后续规划

我们希望可以向 OLAP 平台化发展，通过实现自助化建模的同时在这方面做一些多引擎的路由，使其能够支持各类聚合、明细以及关联等场景。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/1fc81e8e4cce43a59629aa1db5d52f15~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图6.1 后续规划 OLAP 平台化

除 OLAP 平台化之外，后续我们的引擎演进计划从高效、稳定和内核演进三部分来进行。 ![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/d9b5cecc31eb476689f9b0f57c1d79ce~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

图6.2 后续规划 引擎演进

**稳定性方面：** 对 Doris 继续深入内核理解，进行一定的二次开发。另外 Doris 社区的相关原理以及代码级别的教程数量十分丰富，这也间接性降低了我们深入 Doris 原理的难度。

**内核演进方面：我们发现 Doris 基本能够覆盖 Druid 所有场景，因此后续计划以 Doris 引擎为主，Clickhous 引擎为辅，逐渐将 Druid 的相关业务向 Doris 迁移。**

# Q&A 环节

**Q：刚才讲到了后续要从 Druid 引擎迁移到 Doris，要实现迁移的成本有多大呢？**

A：迁移成本方面和我们之前的成本是一样的。我们上线的时候也会采用以下方式：先把业务的数据同时往 Druid 和 Doris 之中写，写完之后的业务迁移会涉及一些 SQL 改造。因为 Doris 更加接近 MySQL 的协议，比起 Druid SQL 会更加便捷，所以这部分的迁移成本不是很大。

**Q：刚才介绍的第二个场景之中的监控图都看了哪些指标呢？**

A: 关于监控图，我们会比较关注 Doris 的数据导入。而在数据导入部分，我们最关注的就是 Compaction 的效率，是否有 Compaction 的堆积。我们现在还是采用的默认参数，也就是 Compaction 的分数就代表它的版本号，所以我们监控的更多的是它的版本。对于这方面的监控，社区也已经有了比较完善的相应技术方案，我们也是参考了社区的技术方案来进行了监控的指标搭建。

**Q：从指标上看，Doris 的实时服务在线查询性能怎么样？在数据导入情况下性能损耗可以从这些指标上看出来吗？**

A：实时导入方面主要是从 Compaction 的效率来看。结合到我们这边的业务场景，最多的一张埋点表，单表一天也有 6 亿到 10 亿的数据量的导入。另外关于峰值，它的 QPS 也是能达到千到万的，所以导入这一块压力不是很大。

**Q：SQL 缓存和分区缓存实际效果怎么样？**

A：SQL 缓存方面效果还好，对于很多离线场景，尤其是首页这种查询的数据量而言。比如以昨天或者是过去一个小时之前的这种情况来说，SQL 缓存命中率会非常高。分区级缓存方面，我们分区的时间还是设的是小时级，这意味着如果这个查询里面涉及到的一些分区在一个小时内没有数据更新的话，那么就会走 SQL 缓存；如果有更新的话就会走分区级缓存。总体来看效果还好，但是我们这边命中比较多的还是 SQL 级的缓存。

**Q：Doris 的查询导入合并和缓存的 BE 节点的内存一般怎么分配？**

A：缓存方面我们分配的不大，还是采用的偏默认的 1G 以内。导入方面我们设计的是 parallel_fragment_exec_instance_num 这个参数，大概在 8G 左右。

**Q：可以解释一下 OLAP3.0 的解决思路吗？**

A：对于 OLAP3.0 方面来说，业务的主要诉求就是大表 Join。除此之外，还有一些类似于导入的进度一致等等。在大表 Join 方面，我们也对比了很多的引擎。Druid 这方面就是偏维表；Clickhouse这方面还是偏基于内存方面的 Broadcast。正因如此，主要是基于大表 Join 的出发点，我们选择引入了在 Join 这方面能力更强的 Doris。

**Q：Druid、ClickHouse 和 Doris 应该都是近实时的，就是 Near Real-time，他们的写入不是立刻可见的，是这样吗？**

A：是这样的。像 Doris 和 ClickHouse 之前的写入都是 Flink 直接去写，我们也没有完全做到来一条数据就写一条，都是一个微批次。一个批次最大可以达到 150 兆的数据堆积，写入一次的时间间隔也是到 10 秒左右，没有做到完全的实时写入。

**Q：方便透露一下货拉拉目前 Doris 的集群的使用情况，比如机器的数量和数据量吗？**

A：我们的集群数量还不算很多，10 多台。

**Q：对于 Doris 的运维方面，它的便捷性和 Druid、ClickHouse、Kylin、Presto 这些相比，有很好的扩展性吗？**

A：我们觉得是有的。第一个是在我们 Druid 方面碰到了一个比较大的痛点，就是它的角色特别多，有 6 种角色，所以需要部署的机器会非常多。另外一点是 Druid 的外部依赖也非常多，Druid 依赖于 HDFS、离线导入还需要 Yarn 集群。

第二个是 ClickhHouse 方面，我们当时使用的版本对于 Zookeeper 也是有比较大的依赖。另外，ClickHouse 也是偏伪分布式的，有点类似于数据库的一种分表。Doris 自身就只有 FE、BE，外部依赖会非常少，所以我们从部署的角度同时考虑到 Doris 的横向扩展方面，Doris 的扩缩容也能够做到自平衡，所以相比而言 Doris 会更好一些。

**Q：在实时特征场景下，分钟级的数据更新对服务性能要求比较高，可以用 Doris 吗？能达到 TP99 200 毫秒以下吗？** 

A：TP99 能够否达到200毫秒以下主要和你查询 SQL 相关。例如我们这边的很多涉及到大表 Join 的查询，涉及的分区数据量大概在 10 亿量别，业务侧对于查询性能要求是 5 秒以内，通过 Doris 是可以满足我们需求的。如果是实时特征这种业务，是否能达到 200 毫秒可能需要经过一轮实际测试才能得到结果。
