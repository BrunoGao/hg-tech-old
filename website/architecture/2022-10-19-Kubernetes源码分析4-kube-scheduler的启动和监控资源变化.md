---
title: Kubernetes源码分析4-kube-scheduler的启动和监控资源变化
description: kube-scheduler的启动和监控资源变化。
publishdate: 2022-10-19
authors: LuckyLove
tags: ["云原生"]

---

**记得看代码中的注释哈，理解都在里面**


>源码基于v1.19

[(一)kubectl中Pod的创建流程](/architecture/2022/10/11/Kubernetes源码分析1-kubectl中Pod的创建流程)

[(二)设计模式Visitor的实现与发送pod创建请求的细节](/architecture/2022/10/13/Kubernetes源码分析2-设计模式Visitor的实现与发送pod创建请求的细节)

[(三)ApiServer之三大server及权限与数据存储](/architecture/2022/10/15/Kubernetes源码分析3-ApiServer之三大server及权限与数据存储)

[(四)kube-scheduler的启动和监控资源变化](/architecture/2022/10/19/Kubernetes源码分析4-kube-scheduler的启动和监控资源变化)

## 确立目标

1. 理解kube-scheduler启动的流程
2. 了解`Informer`是如何从kube-apiserver监听资源变化的情况

理解kube-scheduler启动的流程 **代码在cmd/kube-scheduler**

## run

```go
// kube-scheduler 类似于kube-apiserver，是个常驻进程，查看其对应的Run函数
func runCommand(cmd *cobra.Command, opts *options.Options, registryOptions ...Option) error {
	// 根据入参，返回配置cc与调度sched cc是completedConfig
   cc, sched, err := Setup(ctx, opts, registryOptions...)
	// 运行
   return Run(ctx, cc, sched)
}

// 运行调度策略
func Run(ctx context.Context, cc *schedulerserverconfig.CompletedConfig, sched *scheduler.Scheduler) error {
	// 将配置注册到configz中，会保存在一个全局map里 叫configs
	if cz, err := configz.New("componentconfig"); err == nil {
		cz.Set(cc.ComponentConfig)
	} else {
		return fmt.Errorf("unable to register configz: %s", err)
	}

	// 事件广播管理器，涉及到k8s里的一个核心资源 - Event事件，暂时不细讲
	cc.EventBroadcaster.StartRecordingToSink(ctx.Done())

	// 健康监测的服务
	var checks []healthz.HealthChecker

	// 异步各个Informer。Informer是kube-scheduler的一个重点
	go cc.PodInformer.Informer().Run(ctx.Done())
	cc.InformerFactory.Start(ctx.Done())
	cc.InformerFactory.WaitForCacheSync(ctx.Done())

	// 选举Leader的工作，因为Master节点可以存在多个，选举一个作为Leader
	if cc.LeaderElection != nil {
		cc.LeaderElection.Callbacks = leaderelection.LeaderCallbacks{
      // 两个钩子函数，开启Leading时运行调度，结束时打印报错
			OnStartedLeading: sched.Run,
			OnStoppedLeading: func() {
				klog.Fatalf("leaderelection lost")
			},
		}
		leaderElector, err := leaderelection.NewLeaderElector(*cc.LeaderElection)
		if err != nil {
			return fmt.Errorf("couldn't create leader elector: %v", err)
		}
    // 参与选举的会持续通信
		leaderElector.Run(ctx)
		return fmt.Errorf("lost lease")
	}

	// 不参与选举的，也就是单节点的情况时，在这里运行
	sched.Run(ctx)
	return fmt.Errorf("finished without leader elect")
}

/*
到这里，我们已经接触了kube-scheduler的2个核心概念：
1. scheduler：正如程序名kube-scheduler，这个进程的核心作用是进行调度，会涉及到多种调度策略
2. Informer：k8s中有各种类型的资源，包括自定义的。而Informer的实现就将调度和资源结合了起来
*/

```

## Scheduler

```go
// 在创建scheduler的函数 runcommand()
func Setup() {
	// 创建scheduler，包括多个选项
	sched, err := scheduler.New(cc.Client,
		cc.InformerFactory,
		cc.PodInformer,
		recorderFactory,
		ctx.Done(),
		scheduler.WithProfiles(cc.ComponentConfig.Profiles...),
		scheduler.WithAlgorithmSource(cc.ComponentConfig.AlgorithmSource),
		scheduler.WithPercentageOfNodesToScore(cc.ComponentConfig.PercentageOfNodesToScore),
		scheduler.WithFrameworkOutOfTreeRegistry(outOfTreeRegistry),
		scheduler.WithPodMaxBackoffSeconds(cc.ComponentConfig.PodMaxBackoffSeconds),
		scheduler.WithPodInitialBackoffSeconds(cc.ComponentConfig.PodInitialBackoffSeconds),
		scheduler.WithExtenders(cc.ComponentConfig.Extenders...),
	)
	return &cc, sched, nil
}

// 我们再看一下New这个函数
func New() (*Scheduler, error) {
  // 先注册了所有的算法，保存到一个 map[string]PluginFactory 中
  registry := frameworkplugins.NewInTreeRegistry()
  //NewInTreeRegistry里面的一些调度插件
 /*   return runtime.Registry{
       selectorspread.Name:                  selectorspread.New,
       imagelocality.Name:                   imagelocality.New,
       tainttoleration.Name:                 tainttoleration.New,
       nodename.Name:                        nodename.New,
       nodeports.Name:                       nodeports.New,
       nodeaffinity.Name:                    nodeaffinity.New,
       podtopologyspread.Name:               runtime.FactoryAdapter(fts, podtopologyspread.New),
       ...
      */
  // 重点看一下Scheduler的创建过程
  var sched *Scheduler
	source := options.schedulerAlgorithmSource
	switch {
   // 根据Provider创建，重点看这里
	case source.Provider != nil:
		sc, err := configurator.createFromProvider(*source.Provider)
		if err != nil {
			return nil, fmt.Errorf("couldn't create scheduler using provider %q: %v", *source.Provider, err)
		}
		sched = sc
  // 根据用户设置创建，来自文件或者ConfigMap
	case source.Policy != nil:
		policy := &schedulerapi.Policy{}
		switch {
		case source.Policy.File != nil:
			if err := initPolicyFromFile(source.Policy.File.Path, policy); err != nil {
				return nil, err
			}
		case source.Policy.ConfigMap != nil:
			if err := initPolicyFromConfigMap(client, source.Policy.ConfigMap, policy); err != nil {
				return nil, err
			}
		}
		configurator.extenders = policy.Extenders
		sc, err := configurator.createFromConfig(*policy)
		if err != nil {
			return nil, fmt.Errorf("couldn't create scheduler from policy: %v", err)
		}
		sched = sc
	default:
		return nil, fmt.Errorf("unsupported algorithm source: %v", source)
	}
}

// 创建
func (c *Configurator) createFromProvider(providerName string) (*Scheduler, error) {
	klog.V(2).Infof("Creating scheduler from algorithm provider '%v'", providerName)
  // 实例化算法的Registry
	r := algorithmprovider.NewRegistry()
	defaultPlugins, exist := r[providerName]
	if !exist {
		return nil, fmt.Errorf("algorithm provider %q is not registered", providerName)
	}

  // 将各种算法作为plugin进行设置
	for i := range c.profiles {
		prof := &c.profiles[i]
		plugins := &schedulerapi.Plugins{}
		plugins.Append(defaultPlugins)
		plugins.Apply(prof.Plugins)
		prof.Plugins = plugins
	}
	return c.create()
}

// 从这个初始化中可以看到，主要分为2类：默认与ClusterAutoscaler两种算法
func NewRegistry() Registry {
  // 默认算法包括过滤、打分、绑定等，有兴趣的去源码中逐个阅读
	defaultConfig := getDefaultConfig()
	applyFeatureGates(defaultConfig)
	// ClusterAutoscaler 是集群自动扩展的算法，被单独拎出来
	caConfig := getClusterAutoscalerConfig()
	applyFeatureGates(caConfig)

	return Registry{
		schedulerapi.SchedulerDefaultProviderName: defaultConfig,
		ClusterAutoscalerProvider:                 caConfig,
	}
}
/*
在这里，熟悉k8s的朋友会有个疑问：以前听说kubernets的调度有个Predicate和Priority两个算法，这里怎么没有分类？
这个疑问，我们在后面具体场景时再进行分析。
在新的版本中，这部分代码逻辑是由拓展buildExtenders和nodelist，podQueue，维护了一个调度队列，其余都是与上面差别不大的
*/

```

## NodeName

```go
// 为了加深大家对Plugin的印象，我选择一个最简单的示例：根据Pod的spec字段中的NodeName，分配到指定名称的节点
package nodename

import (
	"context"

	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	framework "k8s.io/kubernetes/pkg/scheduler/framework/v1alpha1"
)

type NodeName struct{}

var _ framework.FilterPlugin = &NodeName{}

// 这个调度算法的名称和错误信息
const (
	Name = "NodeName"
	ErrReason = "node(s) didn't match the requested hostname"
)

// 调度算法的明明
func (pl *NodeName) Name() string {
	return Name
}

// 过滤功能，这个就是NodeName算法的实现
func (pl *NodeName) Filter(ctx context.Context, _ *framework.CycleState, pod *v1.Pod, nodeInfo *framework.NodeInfo) *framework.Status {
  // 找不到Node
	if nodeInfo.Node() == nil {
		return framework.NewStatus(framework.Error, "node not found")
	}
  // 匹配不到，返回错误
	if !Fits(pod, nodeInfo) {
		return framework.NewStatus(framework.UnschedulableAndUnresolvable, ErrReason)
	}
	return nil
}

/*
  匹配的算法，两种条件满足一个就认为成功
  1. spec没有填NodeName 
  2.spec的NodeName和节点匹配
*/
func Fits(pod *v1.Pod, nodeInfo *framework.NodeInfo) bool {
	return len(pod.Spec.NodeName) == 0 || pod.Spec.NodeName == nodeInfo.Node().Name
}

// 初始化
func New(_ runtime.Object, _ framework.FrameworkHandle) (framework.Plugin, error) {
	return &NodeName{}, nil
}

```

了解`Informer`是如何从kube-apiserver监听资源变化的情况

## Informer

什么是`Informer`？先重点讲一下这个Informer，因为它是理解k8s运行机制的核心概念。

简单概况下，`Informer`的核心功能是 **获取并监听(ListAndWatch)对应资源的增删改，触发相应的事件操作(ResourceEventHandler)**

**在Setup()中有个Config，里面有个scheduler.NewInformerFactory()在这里进入，代码在k8s.io/client-go/informers/factory.go中**

## Shared Informer

```go
/*
client 是连接到 kube-apiserver 的客户端。
我们要理解k8s的设计：
1. etcd是核心的数据存储，对资源的修改会进行持久化
2. 只有kube-apiserver可以访问etcd
所以，kube-scheduler要了解资源的变化情况，只能通过kube-apiserver
*/

// 定义了 Shared Informer，其中这个client是用来连接kube-apiserver的
c.InformerFactory = informers.NewSharedInformerFactory(client, 0)

// 这里解答了为什么叫shared：一个资源会对应多个Informer，会导致效率低下，所以让一个资源对应一个sharedInformer，而一个sharedInformer内部自己维护多个Informer
type sharedInformerFactory struct {
	client           kubernetes.Interface
	namespace        string
	tweakListOptions internalinterfaces.TweakListOptionsFunc
	lock             sync.Mutex
	defaultResync    time.Duration
	customResync     map[reflect.Type]time.Duration
  // 这个map就是维护多个Informer的关键实现
	informers map[reflect.Type]cache.SharedIndexInformer
	startedInformers map[reflect.Type]bool
}

// 运行函数
func (f *sharedInformerFactory) Start(stopCh <-chan struct{}) {
	f.lock.Lock()
	defer f.lock.Unlock()
	for informerType, informer := range f.informers {
		if !f.startedInformers[informerType] {
      // goroutine异步处理
			go informer.Run(stopCh)
      // 标记为已经运行，这样即使下次Start也不会重复运行
			f.startedInformers[informerType] = true
		}
	}
}

// 查找对应的informer
func (f *sharedInformerFactory) InformerFor(obj runtime.Object, newFunc internalinterfaces.NewInformerFunc) cache.SharedIndexInformer {
	f.lock.Lock()
	defer f.lock.Unlock()
	// 找到就直接返回
	informerType := reflect.TypeOf(obj)
	informer, exists := f.informers[informerType]
	if exists {
		return informer
	}

	resyncPeriod, exists := f.customResync[informerType]
	if !exists {
		resyncPeriod = f.defaultResync
	}
	// 没找到就会新建Informer
	informer = newFunc(f.client, resyncPeriod)
	f.informers[informerType] = informer
	return informer
}

// SharedInformerFactory 是 sharedInformerFactory 的接口定义，点进func NewSharedInformerFactoryWithOptions的返回值
type SharedInformerFactory interface {
  // 我们这一阶段关注的Pod的Informer，属于核心资源
	Core() core.Interface
}

// core.Interface的定义
type Interface interface {
	// V1 provides access to shared informers for resources in V1.
	V1() v1.Interface
}

// v1.Interface 的定义
type Interface interface {
  // Pod的定义 
        ...
	Pods() PodInformer
        ...
}

// PodInformer 是对应的接口
type PodInformer interface {
	Informer() cache.SharedIndexInformer
	Lister() v1.PodLister
}
// podInformer 是具体的实现
type podInformer struct {
	factory          internalinterfaces.SharedInformerFactory
	tweakListOptions internalinterfaces.TweakListOptionsFunc
	namespace        string
}

// 最后，我们可以看到podInformer调用了InformerFor函数进行了添加
func (f *podInformer) Informer() cache.SharedIndexInformer {
	return f.factory.InformerFor(&corev1.Pod{}, f.defaultInformer)
}

```

## PodInformer

```scss
// 实例化PodInformer，把对应的List/Watch操作方法传入到实例化函数，生成统一的SharedIndexInformer接口
func NewFilteredPodInformer() cache.SharedIndexInformer {
	return cache.NewSharedIndexInformer(
    // List和Watch实现从PodInterface里面查询
		&cache.ListWatch{
			ListFunc: func(options metav1.ListOptions) (runtime.Object, error) {
				if tweakListOptions != nil {
					tweakListOptions(&options)
				}
				return client.CoreV1().Pods(namespace).List(context.TODO(), options)
			},
			WatchFunc: func(options metav1.ListOptions) (watch.Interface, error) {
				if tweakListOptions != nil {
					tweakListOptions(&options)
				}
				return client.CoreV1().Pods(namespace).Watch(context.TODO(), options)
			},
		},
		&corev1.Pod{},
		resyncPeriod,
		indexers,
	)
}

// 点进List，在这个文件中
// 我们先看看Pod基本的List和Watch是怎么定义的
// Pod基本的增删改查等操作
type PodInterface interface {
	List(ctx context.Context, opts metav1.ListOptions) (*v1.PodList, error)
	Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error)
	...
}
// pods 是PodInterface的实现
type pods struct {
	client rest.Interface
	ns     string
}

// List 和 Watch 是依赖客户端，也就是从kube-apiserver中查询的
func (c *pods) List(ctx context.Context, opts metav1.ListOptions) (result *v1.PodList, err error) {
	err = c.client.Get().
		Namespace(c.ns).
		Resource("pods").
		VersionedParams(&opts, scheme.ParameterCodec).
		Timeout(timeout).
		Do(ctx).
		Into(result)
	return
}
func (c *pods) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	return c.client.Get().
		Namespace(c.ns).
		Resource("pods").
		VersionedParams(&opts, scheme.ParameterCodec).
		Timeout(timeout).
		Watch(ctx)
}
// 在func NewPodInformer中找到他的返回值 点进去cache.SharedIndexInformer这是Informer的统一接口 在这个文件的里面找到下面的代码
// 在上面，我们看到了异步运行Informer的代码 go informer.Run(stopCh)，我们看看是怎么run的
func (s *sharedIndexInformer) Run(stopCh <-chan struct{}) {
  // 这里有个 DeltaFIFO 的对象，
  fifo := NewDeltaFIFOWithOptions(DeltaFIFOOptions{
		KnownObjects:          s.indexer,
		EmitDeltaTypeReplaced: true,
	})
	// 传入这个fifo到cfg
	cfg := &Config{
		Queue:            fifo,
		...
	}
	// 新建controller
	func() {
		s.startedLock.Lock()
		defer s.startedLock.Unlock()

		s.controller = New(cfg)
		s.controller.(*controller).clock = s.clock
		s.started = true
	}()
	// 运行controller
	s.controller.Run(stopCh)
}

// 点进New看Controller的运行
func (c *controller) Run(stopCh <-chan struct{}) {
	// 
	r := NewReflector(
		c.config.ListerWatcher,
		c.config.ObjectType,
		c.config.Queue,
		c.config.FullResyncPeriod,
	)
	r.ShouldResync = c.config.ShouldResync
	r.clock = c.clock
	if c.config.WatchErrorHandler != nil {
		r.watchErrorHandler = c.config.WatchErrorHandler
	}

	c.reflectorMutex.Lock()
	c.reflector = r
	c.reflectorMutex.Unlock()

	var wg wait.Group
  // 生产，往Queue里放数据
	wg.StartWithChannel(stopCh, r.Run)
  // 消费，从Queue消费数据
	wait.Until(c.processLoop, time.Second, stopCh)
	wg.Wait()
}

```

## Reflect

点进r.Run()  Reflect监听事件放到FIFO中然后处理循环 取出事件消费

```go
// 我们再回头看看这个Reflect结构
r := NewReflector(
  	// ListerWatcher 我们已经有了解，就是通过client监听kube-apiserver暴露出来的Resource
		c.config.ListerWatcher,
		c.config.ObjectType,
  	// Queue 是我们前文看到的一个 DeltaFIFOQueue，认为这是一个先进先出的队列
		c.config.Queue,
		c.config.FullResyncPeriod,
)

func (r *Reflector) Run(stopCh <-chan struct{}) {
	klog.V(2).Infof("Starting reflector %s (%s) from %s", r.expectedTypeName, r.resyncPeriod, r.name)
	wait.BackoffUntil(func() {
    // 调用了ListAndWatch
		if err := r.ListAndWatch(stopCh); err != nil {
			r.watchErrorHandler(r, err)
		}
	}, r.backoffManager, true, stopCh)
	klog.V(2).Infof("Stopping reflector %s (%s) from %s", r.expectedTypeName, r.resyncPeriod, r.name)
}

func (r *Reflector) ListAndWatch(stopCh <-chan struct{}) error {
		// watchHandler顾名思义，就是Watch到对应的事件，调用对应的Handler
		if err := r.watchHandler(start, w, &resourceVersion, resyncerrc, stopCh); err != nil {
			if err != errorStopRequested {
				switch {
				case isExpiredError(err):
					klog.V(4).Infof("%s: watch of %v closed with: %v", r.name, r.expectedTypeName, err)
				default:
					klog.Warningf("%s: watch of %v ended with: %v", r.name, r.expectedTypeName, err)
				}
			}
			return nil
		}
	}
}

func (r *Reflector) watchHandler() error {
loop:
	for {
    // 一个经典的GO语言select监听多channel的模式
		select {
    // 整体的step channel
		case <-stopCh:
			return errorStopRequested
    // 错误相关的error channel
		case err := <-errc:
			return err
    // 接收事件event的channel
		case event, ok := <-w.ResultChan():
      // channel被关闭，退出loop
			if !ok {
				break loop
			}
      
			// 一系列的资源验证代码跳过
      
			switch event.Type {
      // 增删改三种Event，分别对应到去store，即DeltaFIFO中，操作object
			case watch.Added:
				err := r.store.Add(event.Object)
			case watch.Modified:
				err := r.store.Update(event.Object)
			case watch.Deleted:
				err := r.store.Delete(event.Object)
			case watch.Bookmark:
			default:
				utilruntime.HandleError(fmt.Errorf("%s: unable to understand watch event %#v", r.name, event))
			}
		}
	}
	return nil
}

```

**站在前人的肩膀上，向前辈致敬，Respect！**

## Summary

1. kube-scheduler也是插件化的调度策略，通过配置在启动的时候注册上`plugins`，通过`Informer`来监听资源的状态和变化，进行调度
2. `Informer` 依赖于 `Reflector` 模块，它的组件为 xxxInformer，如 `podInformer`
3. 具体资源的 `Informer` 包含了一个连接到`kube-apiserver`的`client`，通过`List`和`Watch`接口查询资源变更情况
4. 检测到资源发生变化后，通过`Controller` 将数据放入队列`DeltaFIFOQueue`里，生产阶段完成，交给对应的handler处理函数进行下一步的操作
