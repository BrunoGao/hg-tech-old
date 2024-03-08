---
title: Kubernetes源码分析3-ApiServer之三大server及权限与数据存储
description: ApiServer之三大server及权限与数据存储。
publishdate: 2022-10-15
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

1. 理解启动kube-apiserver的权限相关的三个核心概念 `Authentication`/`Authorization`/`Admission` 分别是认证，授权，准入
2. 理解kube-apiserver是中的管理核心资源的`KubeAPIServer`是怎么启动的
3. 理解Pod发送到`kube-apiserver`后是怎么保存的

## Run

**kube-apiserver的启动 代码在cmd/kube-apiserver**

```go
// 类似kubectl的源代码，kube-apiserver的命令行工具也使用了cobra，我们很快就能找到启动的入口
RunE: func(cmd *cobra.Command, args []string) error {
			// 这里包含2个参数，前者是参数completedOptions，后者是一个stopCh <-chan struct{}
			return Run(completedOptions, genericapiserver.SetupSignalHandler())
		}

/*
	在这里，我们可以和kubectl结合起来思考：
	kubectl是一个命令行工具，执行完命令就退出；kube-apiserver是一个常驻的服务器进程，监听端口
	这里引入了一个stopCh <-chan struct{}，可以在启动后，用一个 <-stopCh 作为阻塞，使程序不退出
	用channel阻塞进程退出，对比传统的方法 - 用一个永不退出的for循环，是一个很优雅的实现
*/
func Run(completeOptions completedServerRunOptions, stopCh <-chan struct{}) error {
        // 这里进行创建服务链
        server, err := CreateServerChain(completeOptions)
	if err != nil {
		return err
	}

	prepared, err := server.PrepareRun()
	if err != nil {
		return err
	}

	return prepared.Run(stopCh)
}

```

## Three Servers

```go
// 在CreateServerChain这个函数下，创建了3个server 
func CreateServerChain(){
  // API扩展服务，主要针对CRD
	createAPIExtensionsServer(){} 
  // API核心服务，包括常见的Pod/Deployment/Service，我们今天的重点聚焦在这里
  // 我会跳过很多非核心的配置参数，一开始就去研究细节，很影响整体代码的阅读效率
	CreateKubeAPIServer(){} 
  // API聚合服务，主要针对metrics
	createAggregatorServer(){} 
  //细节是第二个ApiServer需要第一个server的配置，第三个server会要第二个server的配置，最后返回的是聚合server
  // 这些server的config都是由一个GenericConfig和一个ExtraConfig组成 有自己的特点和链上的
      return aggregatorServer, nil
}

```

## KubeAPIServer

```go
// 创建配置的流程
func CreateKubeAPIServerConfig(){
  // 创建通用配置genericConfig
  genericConfig, versionedInformers, insecureServingInfo, serviceResolver, pluginInitializers, admissionPostStartHook, storageFactory, err := buildGenericConfig(s.ServerRunOptions, proxyTransport)
}

```

### GenericConfig

```ini
// 通用配置的创建
func buildGenericConfig(s *options.ServerRunOptions,proxyTransport *http.Transport){
  // Insecure对应的非安全的通信，也就是HTTP
  if lastErr = s.InsecureServing...
  // Secure对应的就是HTTPS
  if lastErr = s.SecureServing...
  // OpenAPIConfig是对外提供的API文档
  genericConfig.OpenAPIConfig = genericapiserver.DefaultOpenAPIConfig()
  // 这一块是storageFactory的实例化，可以看到采用的是etcd作为存储方案
  storageFactoryConfig := kubeapiserver.NewStorageFactoryConfig()
	storageFactoryConfig.APIResourceConfig = genericConfig.MergedResourceConfig
	completedStorageFactoryConfig, err := storageFactoryConfig.Complete(s.Etcd)
	storageFactory, lastErr = completedStorageFactoryConfig.New()
  // Authentication 认证相关
  if lastErr = s.Authentication.ApplyTo()...
  // Authorization 授权相关
  genericConfig.Authorization.Authorizer, genericConfig.RuleResolver, err = BuildAuthorizer()
  // Admission 准入机制
  err = s.Admission.ApplyTo()
}

```

### Authentication

```scss
func (o *BuiltInAuthenticationOptions) ApplyTo(){
  // 前面都是对认证config进行参数设置，这里才是真正的实例化
  authInfo.Authenticator, openAPIConfig.SecurityDefinitions, err = authenticatorConfig.New()
}

// New这块的代码，我们要抓住核心变量authenticators和tokenAuthenticators，也就是各种认证方法
func (config Config) New() (authenticator.Request, *spec.SecurityDefinitions, error) {
  // 核心变量authenticators和tokenAuthenticators
	var authenticators []authenticator.Request
        var tokenAuthenticators []authenticator.Token

	if config.RequestHeaderConfig != nil {
		// 1. 添加requestHeader
		authenticators = append(authenticators, authenticator.WrapAudienceAgnosticRequest(config.APIAudiences, requestHeaderAuthenticator))
	}

	if config.ClientCAContentProvider != nil {
		// 2. 添加ClientCA
    authenticators = append(authenticators, certAuth)
	}

	if len(config.TokenAuthFile) > 0 {
		// 3. token 添加tokenfile
		tokenAuthenticators = append(tokenAuthenticators, authenticator.WrapAudienceAgnosticToken(config.APIAudiences, tokenAuth))
	}
  
  // 4. token 添加 service account，分两种来源
	if len(config.ServiceAccountKeyFiles) > 0 {
		tokenAuthenticators = append(tokenAuthenticators, serviceAccountAuth)
	}
	if utilfeature.DefaultFeatureGate.Enabled(features.TokenRequest) && config.ServiceAccountIssuer != "" {
		tokenAuthenticators = append(tokenAuthenticators, serviceAccountAuth)
	}
	if config.BootstrapToken {
		if config.BootstrapTokenAuthenticator != nil {
      // 5. token 添加 bootstrap
			tokenAuthenticators = append(tokenAuthenticators, authenticator.WrapAudienceAgnosticToken(config.APIAudiences, config.BootstrapTokenAuthenticator))
		}
	}

	if len(config.OIDCIssuerURL) > 0 && len(config.OIDCClientID) > 0 {
		// 6. token 添加 oidc
    Authenticators = append(tokenAuthenticators, authenticator.WrapAudienceAgnosticToken(config.APIAudiences, oidcAuth))
	}
	if len(config.WebhookTokenAuthnConfigFile) > 0 {
		// 7. token 添加 webhook
		tokenAuthenticators = append(tokenAuthenticators, webhookTokenAuth)
	}

  // 8. 组合tokenAuthenticators到tokenAuthenticators中
	if len(tokenAuthenticators) > 0 {
		tokenAuth := tokenunion.New(tokenAuthenticators...)
		if config.TokenSuccessCacheTTL > 0 || config.TokenFailureCacheTTL > 0 {
			tokenAuth = tokencache.New(tokenAuth, true, config.TokenSuccessCacheTTL, config.TokenFailureCacheTTL)
		}
		authenticators = append(authenticators, bearertoken.New(tokenAuth), websocket.NewProtocolAuthenticator(tokenAuth))
	}

  // 9. 没有任何认证方式且启用了Anonymous
	if len(authenticators) == 0 {
		if config.Anonymous {
			return anonymous.NewAuthenticator(), &securityDefinitions, nil
		}
		return nil, &securityDefinitions, nil
	}

  // 10. 组合authenticators
	authenticator := union.New(authenticators...)

	return authenticator, &securityDefinitions, nil
}

```

复杂的Authentication模块的初始化顺序我们看完了，有初步的了解即可，没必要去强制记忆其中的加载顺序。

### Authorization

```go
func BuildAuthorizer(){
  // 与上面一致，实例化是在这个New中
  return authorizationConfig.New()
}

// 不得不说，Authorizer这块的阅读体验更好
func (config Config) New() (authorizer.Authorizer, authorizer.RuleResolver, error) {
  // 必须传入一个Authorizer机制
	if len(config.AuthorizationModes) == 0 {
		return nil, nil, fmt.Errorf("at least one authorization mode must be passed")
	}

	var (
		authorizers   []authorizer.Authorizer
		ruleResolvers []authorizer.RuleResolver
	)

	for _, authorizationMode := range config.AuthorizationModes {
		// 具体的mode定义，可以跳转到对应的链接去看，不细讲
		switch authorizationMode {
		case modes.ModeNode:
			authorizers = append(authorizers, nodeAuthorizer)
			ruleResolvers = append(ruleResolvers, nodeAuthorizer)

		case modes.ModeAlwaysAllow:
			authorizers = append(authorizers, alwaysAllowAuthorizer)
			ruleResolvers = append(ruleResolvers, alwaysAllowAuthorizer)
      
		case modes.ModeAlwaysDeny:
			authorizers = append(authorizers, alwaysDenyAuthorizer)
			ruleResolvers = append(ruleResolvers, alwaysDenyAuthorizer)
      
		case modes.ModeABAC:
			authorizers = append(authorizers, abacAuthorizer)
			ruleResolvers = append(ruleResolvers, abacAuthorizer)
      
		case modes.ModeWebhook:
			authorizers = append(authorizers, webhookAuthorizer)
			ruleResolvers = append(ruleResolvers, webhookAuthorizer)
      
		case modes.ModeRBAC:
			authorizers = append(authorizers, rbacAuthorizer)
			ruleResolvers = append(ruleResolvers, rbacAuthorizer)
		default:
			return nil, nil, fmt.Errorf("unknown authorization mode %s specified", authorizationMode)
		}
	}

	return union.New(authorizers...), union.NewRuleResolvers(ruleResolvers...), nil
}

const (
	// ModeAlwaysAllow is the mode to set all requests as authorized
	ModeAlwaysAllow string = "AlwaysAllow"
	// ModeAlwaysDeny is the mode to set no requests as authorized
	ModeAlwaysDeny string = "AlwaysDeny"
	// ModeABAC is the mode to use Attribute Based Access Control to authorize
	ModeABAC string = "ABAC"
	// ModeWebhook is the mode to make an external webhook call to authorize
	ModeWebhook string = "Webhook"
	// ModeRBAC is the mode to use Role Based Access Control to authorize
	ModeRBAC string = "RBAC"
	// ModeNode is an authorization mode that authorizes API requests made by kubelets.
	ModeNode string = "Node"
)

```

### Admission

```go
// 查看定义
err = s.Admission.ApplyTo()
func (a *AdmissionOptions) ApplyTo(){
  return a.GenericAdmission.ApplyTo()
}

func (ps *Plugins) NewFromPlugins(){
  for _, pluginName := range pluginNames {
		// InitPlugin 为初始化的工作
		plugin, err := ps.InitPlugin(pluginName, pluginConfig, pluginInitializer)
		if err != nil {
			return nil, err
		}
	}
}

func (ps *Plugins) InitPlugin(name string, config io.Reader, pluginInitializer PluginInitializer) (Interface, error){
  // 获取plugin
  plugin, found, err := ps.getPlugin(name, config)
}

// 查看一下Interface的定义，就是对准入机制的控制 抽象化的插件化的接口 服务于Admission Control
// Interface is an abstract, pluggable interface for Admission Control decisions.
type Interface interface {
	Handles(operation Operation) bool
}

// 再去看看获取plugin的地方
func (ps *Plugins) getPlugin(name string, config io.Reader) (Interface, bool, error) {
	ps.lock.Lock()
	defer ps.lock.Unlock()
  // 我们再去研究ps.registry这个参数是在哪里被初始化的
	f, found := ps.registry[name]
}

// 接下来，我们从kube-apiserver启动过程，逐步找到Admission被初始化的地方
// 启动命令
command := app.NewAPIServerCommand()
// server配置
s := options.NewServerRunOptions()
// admission选项
Admission:               kubeoptions.NewAdmissionOptions()
// 注册准入机制
RegisterAllAdmissionPlugins(options.Plugins)
// 准入机制的所有内容
func RegisterAllAdmissionPlugins(plugins *admission.Plugins){
  // 这里有很多plugin的注册
}

// 往上翻，我们能找到所有plugin，也就是准入机制的定义 有三十几种 已经进行了排序的
var AllOrderedPlugins = []string{
admit.PluginName,                        // AlwaysAdmit
	autoprovision.PluginName,                // NamespaceAutoProvision
	lifecycle.PluginName,                    // NamespaceLifecycle
	exists.PluginName,                       // NamespaceExists
	scdeny.PluginName,                       // SecurityContextDeny
	antiaffinity.PluginName,                 // LimitPodHardAntiAffinityTopology
	limitranger.PluginName,                  // LimitRanger
	serviceaccount.PluginName,               // ServiceAccount
	noderestriction.PluginName,              // NodeRestriction
	nodetaint.PluginName,                    // TaintNodesByCondition
	alwayspullimages.PluginName,             // AlwaysPullImages
	imagepolicy.PluginName,                  // ImagePolicyWebhook
	podsecurity.PluginName,                  // PodSecurity
	podnodeselector.PluginName,              // PodNodeSelector
	podpriority.PluginName,                  // Priority
	defaulttolerationseconds.PluginName,     // DefaultTolerationSeconds
	podtolerationrestriction.PluginName,     // PodTolerationRestriction
	eventratelimit.PluginName,               // EventRateLimit
	extendedresourcetoleration.PluginName,   // ExtendedResourceToleration
	label.PluginName,                        // PersistentVolumeLabel
	setdefault.PluginName,                   // DefaultStorageClass
	storageobjectinuseprotection.PluginName, // StorageObjectInUseProtection
	gc.PluginName,                           // OwnerReferencesPermissionEnforcement
	resize.PluginName,                       // PersistentVolumeClaimResize
	runtimeclass.PluginName,                 // RuntimeClass
	certapproval.PluginName,                 // CertificateApproval
	certsigning.PluginName,                  // CertificateSigning
	certsubjectrestriction.PluginName,       // CertificateSubjectRestriction
	defaultingressclass.PluginName,          // DefaultIngressClass
	denyserviceexternalips.PluginName,       // DenyServiceExternalIPs

	// new admission plugins should generally be inserted above here
	// webhook, resourcequota, and deny plugins must go at the end

	mutatingwebhook.PluginName,   // MutatingAdmissionWebhook
	validatingwebhook.PluginName, // ValidatingAdmissionWebhook
	resourcequota.PluginName,     // ResourceQuota
	deny.PluginName,              // AlwaysDeny
}

```

## GenericAPIServer的初始化

理解kube-apiserver是中的管理核心资源的`KubeAPIServer`是怎么启动的

## New

```go
// 先对配置进行complete补全再进行new
func CreateKubeAPIServer(kubeAPIServerConfig *controlplane.Config, delegateAPIServer genericapiserver.DelegationTarget) (*controlplane.Instance, error) {
	kubeAPIServer, err := kubeAPIServerConfig.Complete().New(delegateAPIServer)
	if err != nil {
		return nil, err
	}

	return kubeAPIServer, nil
}

```

## GenericServer

```go
// 在APIExtensionsServer、KubeAPIServer和AggregatorServer三种Server启动时，我们都能发现这么一个函数
// APIExtensionsServer
genericServer, err := c.GenericConfig.New("apiextensions-apiserver", delegationTarget)
// KubeAPIServer
s, err := c.GenericConfig.New("kube-apiserver", delegationTarget)
// AggregatorServer
genericServer, err := c.GenericConfig.New("kube-aggregator", delegationTarget)

// 都通过GenericConfig创建了genericServer，我们先大致浏览下
func (c completedConfig) New(name string, delegationTarget DelegationTarget) (*GenericAPIServer, error) {
	// 新建Handler
	apiServerHandler := NewAPIServerHandler(name, c.Serializer, handlerChainBuilder, delegationTarget.UnprotectedHandler())
  
	// 实例化一个Server
	s := &GenericAPIServer{
    ...
  }

	// 处理钩子hook操作
	for k, v := range delegationTarget.PostStartHooks() {
		s.postStartHooks[k] = v
	}

	for k, v := range delegationTarget.PreShutdownHooks() {
		s.preShutdownHooks[k] = v
	}

	// 健康监测
	for _, delegateCheck := range delegationTarget.HealthzChecks() {
		skip := false
		for _, existingCheck := range c.HealthzChecks {
			if existingCheck.Name() == delegateCheck.Name() {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		s.AddHealthChecks(delegateCheck)
	}
	
  // 安装API相关参数，这个是重点
	installAPI(s, c.Config)

	return s, nil
}

```

## NewAPIServerHandler

```go
func NewAPIServerHandler(name string, s runtime.NegotiatedSerializer, handlerChainBuilder HandlerChainBuilderFn, notFoundHandler http.Handler) *APIServerHandler {
	// 采用了 github.com/emicklei/go-restful 这个库作为 RESTful 接口的设计，目前了解即可
	gorestfulContainer := restful.NewContainer()
	
}

```

## installAPI

一些通用的

```scss
func installAPI(s *GenericAPIServer, c *Config) {
  // 添加 /index.html 路由规则
	if c.EnableIndex {
		routes.Index{}.Install(s.listedPathProvider, s.Handler.NonGoRestfulMux)
	}
  // 添加go语言 /pprof 的路由规则，常用于性能分析
	if c.EnableProfiling {
		routes.Profiling{}.Install(s.Handler.NonGoRestfulMux)
		if c.EnableContentionProfiling {
			goruntime.SetBlockProfileRate(1)
		}
		routes.DebugFlags{}.Install(s.Handler.NonGoRestfulMux, "v", routes.StringFlagPutHandler(logs.GlogSetter))
	}
  // 添加监控相关的 /metrics 的指标路由规则
	if c.EnableMetrics {
		if c.EnableProfiling {
			routes.MetricsWithReset{}.Install(s.Handler.NonGoRestfulMux)
		} else {
			routes.DefaultMetrics{}.Install(s.Handler.NonGoRestfulMux)
		}
	}
	// 添加版本 /version 的路由规则
	routes.Version{Version: c.Version}.Install(s.Handler.GoRestfulContainer)
	// 开启服务发现
	if c.EnableDiscovery {
		s.Handler.GoRestfulContainer.Add(s.DiscoveryGroupManager.WebService())
	}
	if feature.DefaultFeatureGate.Enabled(features.APIPriorityAndFairness) {
		c.FlowControl.Install(s.Handler.NonGoRestfulMux)
	}
}

```

## Apiserver

```go
func (c completedConfig) New(delegationTarget genericapiserver.DelegationTarget) (*Master, error) {
	// genericServer的初始化
	s, err := c.GenericConfig.New("kube-apiserver", delegationTarget)
	// 核心KubeAPIServer的实例化
	m := &Master{
		GenericAPIServer:          s,
		ClusterAuthenticationInfo: c.ExtraConfig.ClusterAuthenticationInfo,
	}

	// 注册Legacy API的注册
	if c.ExtraConfig.APIResourceConfigSource.VersionEnabled(apiv1.SchemeGroupVersion) {
		legacyRESTStorageProvider := corerest.LegacyRESTStorageProvider{}
		if err := m.InstallLegacyAPI(&c, c.GenericConfig.RESTOptionsGetter, legacyRESTStorageProvider); err != nil {
			return nil, err
		}
	}
	// REST接口的存储定义，可以看到很多k8s上的常见定义，比如node节点/storage存储/event事件等等
	restStorageProviders := []RESTStorageProvider{
		authenticationrest.RESTStorageProvider{Authenticator: c.GenericConfig.Authentication.Authenticator, APIAudiences: c.GenericConfig.Authentication.APIAudiences},
		authorizationrest.RESTStorageProvider{Authorizer: c.GenericConfig.Authorization.Authorizer, RuleResolver: c.GenericConfig.RuleResolver},
		autoscalingrest.RESTStorageProvider{},
		batchrest.RESTStorageProvider{},
		certificatesrest.RESTStorageProvider{},
		coordinationrest.RESTStorageProvider{},
		discoveryrest.StorageProvider{},
		extensionsrest.RESTStorageProvider{},
		networkingrest.RESTStorageProvider{},
		noderest.RESTStorageProvider{},
		policyrest.RESTStorageProvider{},
		rbacrest.RESTStorageProvider{Authorizer: c.GenericConfig.Authorization.Authorizer},
		schedulingrest.RESTStorageProvider{},
		settingsrest.RESTStorageProvider{},
		storagerest.RESTStorageProvider{},
		flowcontrolrest.RESTStorageProvider{},
		// keep apps after extensions so legacy clients resolve the extensions versions of shared resource names.
		// See https://github.com/kubernetes/kubernetes/issues/42392
		appsrest.StorageProvider{},
		admissionregistrationrest.RESTStorageProvider{},
		eventsrest.RESTStorageProvider{TTL: c.ExtraConfig.EventTTL},
	}
  // 注册API
	if err := m.InstallAPIs(c.ExtraConfig.APIResourceConfigSource, c.GenericConfig.RESTOptionsGetter, restStorageProviders...); err != nil {
		return nil, err
	}
	// 添加Hook
	m.GenericAPIServer.AddPostStartHookOrDie("start-cluster-authentication-info-controller", func(hookContext genericapiserver.PostStartHookContext) error {
	})
	return m, nil
}

```

注册API的关键在`InstallLegacyAPI`和`InstallAPIs`，如果你对kubernetes的资源有一定的了解，会知道核心资源都放在Legacy中如pod（如果不了解的话，点击函数看一下，就能有所有了解）

## InstallLegacyAPI

```go
// 定义了legacy和非legacy资源的路由前缀
const (
// DefaultLegacyAPIPrefix is where the legacy APIs will be located.
DefaultLegacyAPIPrefix="/api"
// APTGroupPrefix is where non-legacy API group will be located.
APIGroupPrefix ="/apis"
)

func (m *Master) InstallLegacyAPI(c *completedConfig, restOptionsGetter generic.RESTOptionsGetter, legacyRESTStorageProvider corerest.LegacyRESTStorageProvider) error {
  // RESTStorage的初始化
	legacyRESTStorage, apiGroupInfo, err := legacyRESTStorageProvider.NewLegacyRESTStorage(restOptionsGetter)
  
  // 前缀为 /api，注册上对应的Version和Resource
  // Pod作为核心资源，没有Group的概念
	if err := m.GenericAPIServer.InstallLegacyAPIGroup(genericapiserver.DefaultLegacyAPIPrefix, &apiGroupInfo); err != nil {
		return fmt.Errorf("error in registering group versions: %v", err)
	}
	return nil
}

// 我们再细看这个RESTStorage的初始化
func (c LegacyRESTStorageProvider) NewLegacyRESTStorage(restOptionsGetter generic.RESTOptionsGetter) (LegacyRESTStorage, genericapiserver.APIGroupInfo, error) {
	// pod 模板
	podTemplateStorage, err := podtemplatestore.NewREST(restOptionsGetter)
	// event事件
	eventStorage, err := eventstore.NewREST(restOptionsGetter, uint64(c.EventTTL.Seconds()))
	// limitRange资源限制
	limitRangeStorage, err := limitrangestore.NewREST(restOptionsGetter)
	// resourceQuota资源配额
	resourceQuotaStorage, resourceQuotaStatusStorage, err := resourcequotastore.NewREST(restOptionsGetter)
	// secret加密
	secretStorage, err := secretstore.NewREST(restOptionsGetter)
	// PV 存储
	persistentVolumeStorage, persistentVolumeStatusStorage, err := pvstore.NewREST(restOptionsGetter)
	// PVC 存储
	persistentVolumeClaimStorage, persistentVolumeClaimStatusStorage, err := pvcstore.NewREST(restOptionsGetter)
	// ConfigMap 配置
	configMapStorage, err := configmapstore.NewREST(restOptionsGetter)
	// 等等核心资源，暂不一一列举
  
  // pod模板，我们的示例nginx-pod属于这个类型的资源
  podStorage, err := podstore.NewStorage()
 
  // 保存storage的对应关系
  restStorageMap := map[string]rest.Storage{
		"pods":             podStorage.Pod,
		"pods/attach":      podStorage.Attach,
		"pods/status":      podStorage.Status,
		"pods/log":         podStorage.Log,
		"pods/exec":        podStorage.Exec,
		"pods/portforward": podStorage.PortForward,
		"pods/proxy":       podStorage.Proxy,
		"pods/binding":     podStorage.Binding,
		"bindings":         podStorage.LegacyBinding,
    ...
  }
}

```

## Create Pod

```go
// 查看Pod初始化 上一步的podStorage
func NewStorage(optsGetter generic.RESTOptionsGetter, k client.ConnectionInfoGetter, proxyTransport http.RoundTripper, podDisruptionBudgetClient policyclient.PodDisruptionBudgetsGetter) (PodStorage, error) {

	store := &genericregistry.Store{
		NewFunc:                  func() runtime.Object { return &api.Pod{} },
		NewListFunc:              func() runtime.Object { return &api.PodList{} },
		PredicateFunc:            registrypod.MatchPod,
		DefaultQualifiedResource: api.Resource("pods"),
		// 增改删的策略
		CreateStrategy:      registrypod.Strategy,
		UpdateStrategy:      registrypod.Strategy,
		DeleteStrategy:      registrypod.Strategy,
		ReturnDeletedObject: true,

		TableConvertor: printerstorage.TableConvertor{TableGenerator: printers.NewTableGenerator().With(printersinternal.AddHandlers)},
	}
}
// 查看 Strategy 的初始化 是一个全局变量  进行实例化 调用了Scheme，核心资源的schme，legacyscheme
var Strategy = podStrategy{legacyscheme.Scheme, names.SimpleNameGenerator}

// 又查询到Scheme的初始化。Schema可以理解为Kubernetes的注册表，即所有的资源类型必须先注册进Schema才可使用 注册里有资源的增删改的策略
var Scheme = runtime.NewScheme()

```

## Pod数据的保存

理解Pod发送到`kube-apiserver`后是怎么保存的

## RESTCreateStrategy

```scss
// podStrategy 是封装了 Pod 的各类动作，这里我们先关注create这个操作
type podStrategy struct {
	runtime.ObjectTyper
	names.NameGenerator
}

// podStrategy 的接口
type RESTCreateStrategy interface {
	runtime.ObjectTyper
	names.NameGenerator
  // 是否属于当前的 namespace
	NamespaceScoped() bool
  // 准备创建前的检查
	PrepareForCreate(ctx context.Context, obj runtime.Object)
  // 验证资源对象
	Validate(ctx context.Context, obj runtime.Object) field.ErrorList
  // 规范化
	Canonicalize(obj runtime.Object)
}

// 完成了检查，我们就要保存数据了

```

## Storage

```go
// PodStorage 是 Pod 存储的实现，里面包含了多个存储的定义
type PodStorage struct {
  // REST implements a RESTStorage for pods
	Pod                 *REST
  // BindingREST implements the REST endpoint for binding pods to nodes when etcd is in use.
	Binding             *BindingREST
  // LegacyBindingREST implements the REST endpoint for binding pods to nodes when etcd is in use.
	LegacyBinding       *LegacyBindingREST
	Eviction            *EvictionREST
  // StatusREST implements the REST endpoint for changing the status of a pod.
	Status              *StatusREST
  // EphemeralContainersREST implements the REST endpoint for adding EphemeralContainers
	EphemeralContainers *EphemeralContainersREST
	Log                 *podrest.LogREST
	Proxy               *podrest.ProxyREST
	Exec                *podrest.ExecREST
	Attach              *podrest.AttachREST
	PortForward         *podrest.PortForwardREST
}

/*
从上一节的map关系中，保存在REST中
restStorageMap := map[string]rest.Storage{
		"pods":             podStorage.Pod,
}
*/
type REST struct {
	*genericregistry.Store
        // 代理传输层 大概率是和网络相关的先不看
	proxyTransport http.RoundTripper
}

// Store是一个通用的数据结构
type Store struct {
	// Storage定义
        ...
	Storage DryRunnableStorage
}

// DryRunnableStorage中的Storage是一个Interface
type DryRunnableStorage struct {
	Storage storage.Interface
        // 和编解码相关的codec          
	Codec   runtime.Codec
}

func (s *DryRunnableStorage) Create(ctx context.Context, key string, obj, out runtime.Object, ttl uint64, dryRun bool) error {
	if dryRun {
		if err := s.Storage.Get(ctx, key, storage.GetOptions{}, out); err == nil {
			return storage.NewKeyExistsError(key, 0)
		}
		return s.copyInto(obj, out)
	}
  // 这里，就是Create的真正调用
	return s.Storage.Create(ctx, key, obj, out, ttl)
}

```

## Storage Implement

```vbnet
// Storage Interface 的定义，包括基本的增删改查，以及watch等等进阶操作
type Interface interface {
	Versioner() Versioner
	Create(ctx context.Context, key string, obj, out runtime.Object, ttl uint64) error
	Delete(ctx context.Context, key string, out runtime.Object, preconditions *Preconditions, validateDeletion ValidateObjectFunc) error
	Watch(ctx context.Context, key string, opts ListOptions) (watch.Interface, error)
	WatchList(ctx context.Context, key string, opts ListOptions) (watch.Interface, error)
	Get(ctx context.Context, key string, opts GetOptions, objPtr runtime.Object) error
	GetToList(ctx context.Context, key string, opts ListOptions, listObj runtime.Object) error
	List(ctx context.Context, key string, opts ListOptions, listObj runtime.Object) error
	GuaranteedUpdate(
		ctx context.Context, key string, ptrToType runtime.Object, ignoreNotFound bool,
		precondtions *Preconditions, tryUpdate UpdateFunc, suggestion ...runtime.Object) error
	Count(key string) (int64, error)
}
// 去找Storage的初始化
func NewRawStorage(config *storagebackend.Config) (storage.Interface, factory.DestroyFunc, error) {
	return factory.Create(*config)
}

func Create(c storagebackend.Config) (storage.Interface, DestroyFunc, error) {
	switch c.Type {
  // 已经不支持etcd2
	case "etcd2":
		return nil, nil, fmt.Errorf("%v is no longer a supported storage backend", c.Type)
  // 默认为etcd3版本
	case storagebackend.StorageTypeUnset, storagebackend.StorageTypeETCD3:
		return newETCD3Storage(c)
	default:
		return nil, nil, fmt.Errorf("unknown storage type: %s", c.Type)
	}
}

```

**站在前人的肩膀上，向前辈致敬，Respect！**

## Summary

1. `kube-apiserver` 包含三个apiserver`APIExtensionsServer`、`KubeAPIServer`和`AggregatorServer`三个APIServer底层均依赖通用的`GenericServer`，使用`go-restful`对外提供RESTful风格的API服务，三个server，都有两类配置一类是专有的一个通用的genericServer，通用的配置中有三种`Authentication/Authorization/Admission`，控制权限的方式，
2. `kube-apiserver` 对请求进行 `Authentication`、`Authorization`和`Admission`三层验证,`Admission`是插件化的，可以通过`webhook`来拓展
3. 完成验证后，请求会根据路由规则，触发到对应资源的handler，主要包括数据的`预处理`和`保存`，pod的底层是`podStorage`的对象，使用到注册表`schme`
4. `kube-apiserver` 的底层存储为etcd v3，它被抽象为一种`RESTStorage`，使网络请求和底层存储操作一一对应
