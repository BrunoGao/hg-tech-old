---
title: Kubernetes源码分析2-设计模式Visitor的实现与发送pod创建请求的细节
description: 设计模式Visitor的实现与发送pod创建请求的细节。
publishdate: 2022-10-13
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

1. 理解kubectl的核心实现之一：`Visitor Design Pattern` 访问者模式
2. 理解发送pod创建请求的细节

## visitor design pattern

在设计模式中，访问者模式的定义为：

> 允许一个或者多个操作应用到对象上，解耦操作和对象本身

那么，对一个程序来说，具体的表现就是：

1. 表面：某个对象执行了一个方法
2. 内部：对象内部调用了多个方法，最后统一返回结果

举个例子，

1. 表面：调用一个查询订单的接口
2. 内部：先从`缓存`中查询，没查到再去`热点数据库`查询，还没查到则去`归档数据库`里查询

## Visitor

我们来看看kubeadm中的`访问者模式`的定义:

```go
// Visitor 即为访问者这个对象
type Visitor interface {
	Visit(VisitorFunc) error
}
// VisitorFunc对应这个对象的方法，也就是定义中的“操作”
type VisitorFunc func(*Info, error) error

```

基本的数据结构很简单，但从当前的数据结构来看，有两个问题：

1. `单个操作` 可以直接调用`Visit`方法，那`多个操作`如何实现呢？
2. 在应用`多个操作`时，如果出现了error，该退出还是继续应用`下一个操作`呢？

## Chained

以下内容在`staging/src/k8s.io/cli-runtime/pkg/resource`

> - 1. VisitorList和EagerVisitorList是将多个对象聚合为一个对象
> - 1. DecoratedVisitor和ContinueOnErrorVisitor是将多个方法聚合为一个方法
> - 1. FlattenListVisitor和FilteredVisitor是将对象抽象为多个底层对象，逐个调用方法

### VisitorList

封装多个Visitor为一个，出现错误就立刻中止并返回

```go
// VisitorList定义为[]Visitor，又实现了Visit方法，也就是将多个[]Visitor封装为一个Visitor
type VisitorList []Visitor

// 发生error就立刻返回，不继续遍历
func (l VisitorList) Visit(fn VisitorFunc) error {
	for i := range l {
		if err := l[i].Visit(fn); err != nil {
			return err
		}
	}
	return nil
}

```

### EagerVisitorList

封装多个Visitor为一个，出现错误暂存下来，全部遍历完再聚合所有的错误并返回

```go
// EagerVisitorList 也是将多个[]Visitor封装为一个Visitor
type EagerVisitorList []Visitor

// 返回的错误暂存到[]error中，统一聚合
func (l EagerVisitorList) Visit(fn VisitorFunc) error {
	errs := []error(nil)
	for i := range l {
		if err := l[i].Visit(func(info *Info, err error) error {
			if err != nil {
				errs = append(errs, err)
				return nil
			}
			if err := fn(info, nil); err != nil {
				errs = append(errs, err)
			}
			return nil
		}); err != nil {
			errs = append(errs, err)
		}
	}
	return utilerrors.NewAggregate(errs)
}

```

### DecoratedVisitor

这里借鉴了装饰器的设计模式，将一个Visitor调用多个VisitorFunc方法，封装为调用一个VisitorFunc

```go
// 装饰器Visitor
type DecoratedVisitor struct {
	visitor    Visitor
	decorators []VisitorFunc
}

// visitor遍历调用decorators中所有函数，有失败立即返回
func (v DecoratedVisitor) Visit(fn VisitorFunc) error {
	return v.visitor.Visit(func(info *Info, err error) error {
		if err != nil {
			return err
		}
		for i := range v.decorators {
			if err := v.decorators[i](info, nil); err != nil {
				return err
			}
		}
		return fn(info, nil)
	})
}

```

### ContinueOnErrorVisitor

```go
// 报错依旧继续
type ContinueOnErrorVisitor struct {
	Visitor
}

// 报错不立即返回，聚合所有错误后返回
func (v ContinueOnErrorVisitor) Visit(fn VisitorFunc) error {
	errs := []error{}
	err := v.Visitor.Visit(func(info *Info, err error) error {
		if err != nil {
			errs = append(errs, err)
			return nil
		}
		if err := fn(info, nil); err != nil {
			errs = append(errs, err)
		}
		return nil
	})
	if err != nil {
		errs = append(errs, err)
	}
	if len(errs) == 1 {
		return errs[0]
	}
	return utilerrors.NewAggregate(errs)
}

```

### FlattenListVisitor

将runtime.ObjectTyper解析成多个runtime.Object，再转换为多个Info，逐个调用VisitorFunc

```go
type FlattenListVisitor struct {
	visitor Visitor
	typer   runtime.ObjectTyper
	mapper  *mapper
}

```

### FilteredVisitor

对Info资源的检验

```go
// 过滤的Info
type FilteredVisitor struct {
	visitor Visitor
	filters []FilterFunc
}

func (v FilteredVisitor) Visit(fn VisitorFunc) error {
	return v.visitor.Visit(func(info *Info, err error) error {
		if err != nil {
			return err
		}
		for _, filter := range v.filters {
      // 检验Info是否满足条件，出错则退出
			ok, err := filter(info, nil)
			if err != nil {
				return err
			}
			if !ok {
				return nil
			}
		}
		return fn(info, nil)
	})
}

```

## Implements

### StreamVisitor

最基础的Visitor

```go
type StreamVisitor struct {
  // 读取信息的来源，实现了Read这个接口，这个"流式"的概念，包括了常见的HTTP、文件、标准输入等各类输入
	io.Reader
	*mapper

	Source string
	Schema ContentValidator
}

```

### FileVisitor

文件的访问，包括标准输入，底层调用StreamVisitor来访问

```go
type FileVisitor struct {
  // 表示文件路径或者STDIN
	Path string
	*StreamVisitor
}

```

### URLVisitor

HTTP用GET方法获取数据，底层也是复用StreamVisitor

```go
type URLVisitor struct {
	URL *url.URL
	*StreamVisitor
  // 提供错误重试次数
	HttpAttemptCount int
}

```

### KustomizeVisitor

自定义的Visitor，针对自定义的文件系统，Customize 定制，是将C转成了K

```go
type KustomizeVisitor struct {
	Path string
	*StreamVisitor
}

```

## 发送创建Pod请求的实现细节

```
kubectl是怎么向kube-apiserver发送请求的呢？
```

## send request

```go
// 在RunCreate函数中，关键的发送函数
obj, err := resource.
				NewHelper(info.Client, info.Mapping).
				DryRun(o.DryRunStrategy == cmdutil.DryRunServer).
				WithFieldManager(o.fieldManager).
				Create(info.Namespace, true, info.Object)

// 进入create函数，查看到
m.createResource(m.RESTClient, m.Resource, namespace, obj, options)

// 对应的实现为
func (m *Helper) createResource(c RESTClient, resource, namespace string, obj runtime.Object, options *metav1.CreateOptions) (runtime.Object, error) {
	return c.Post().
		NamespaceIfScoped(namespace, m.NamespaceScoped).
		Resource(resource).
		VersionedParams(options, metav1.ParameterCodec).
		Body(obj).
		Do(context.TODO()).
		Get()
}

/*
到这里，我们发现了2个关键性的定义:
1. RESTClient 与kube-apiserver交互的RESTful风格的客户端 这个RESTClient是来自于Builder时的传入，生成的Result，底层是一个NewClientWithOptions生成的
2. runtime.Object 资源对象的抽象，包括Pod/Deployment/Service等各类资源
3. 我们是传入的文件，是FileVisitor来执行的，底层Builder.mapper调用Decode来生成obj(Unstructured())
*/

```

## RESTful Client

我们先来看看，与kube-apiserver交互的Client是怎么创建的

```css
// 从传入参数来看，数据来源于Info这个结构
r.Visit(func(info *resource.Info, err error) error{})

// 而info来源于前面的Builder，前面部分都是将Builder参数化，核心的生成为Do函数
r := f.NewBuilder().
		Unstructured().
		Schema(schema).
		ContinueOnError().
		NamespaceParam(cmdNamespace).DefaultNamespace().
		FilenameParam(enforceNamespace, &o.FilenameOptions).
		LabelSelectorParam(o.Selector).
		Flatten().
		Do()

// 大致看一下这些函数，我们可以在Unstructured()中看到getClient函数，其实这就是我们要找的函数
func (b *Builder) getClient(gv schema.GroupVersion) (RESTClient, error) 

// 从返回值来看，client包括默认的REST client和配置选项
NewClientWithOptions(client, b.requestTransforms...)

// 这个Client会在kubernetes项目中大量出现，它是与kube-apiserver交互的核心组件，以后再深入。

```

## Object

```
Object`这个对象是怎么获取到的呢？因为我们的数据源是来自文件的，那么我们最直观的想法就是`FileVisitor
func (v *FileVisitor) Visit(fn VisitorFunc) error {
	// 省略读取这块的代码，底层调用的是StreamVisitor的逻辑
	return v.StreamVisitor.Visit(fn)
}

func (v *StreamVisitor) Visit(fn VisitorFunc) error {
	d := yaml.NewYAMLOrJSONDecoder(v.Reader, 4096)
	for {
		// 这里就是返回info的地方
		info, err := v.infoForData(ext.Raw, v.Source)
  }
}

// 再往下一层看，来到mapper层，也就是kubernetes的资源对象映射关系
func (m *mapper) infoForData(data []byte, source string) (*Info, error){
  // 这里就是我们返回Object的地方，其中GVK是Group/Version/Kind的缩写，后续我们会涉及
  obj, gvk, err := m.decoder.Decode(data, nil, nil)
}

```

这时，我们想回头去看，这个mapper是在什么时候被定义的？

```go
// 在Builder初始化中，我们就找到了
func (b *Builder) Unstructured() *Builder {
	b.mapper = &mapper{
		localFn:      b.isLocal,
		restMapperFn: b.restMapperFn,
		clientFn:     b.getClient,
    // 我们查找资源用到的是这个decoder
		decoder:      &metadataValidatingDecoder{unstructured.UnstructuredJSONScheme},
	}
	return b
}

// 逐层往下找，对应的Decode方法的实现，就是对应的数据解析成data：
func (s unstructuredJSONScheme) decode(data []byte) (runtime.Object, error) {
	// 细节暂时忽略
}

```

## Post

了解了`REST Client`和`Object`的大致产生逻辑后，我们再回过头来看发送的方法

```scss
// RESTful接口风格中，POST请求对应的就是CREATE方法
c.Post().
		NamespaceIfScoped(namespace, m.NamespaceScoped).
		Resource(resource).
		VersionedParams(options, metav1.ParameterCodec).
		Body(obj).
		Do(context.TODO()). 
		Get() 

// Do方法，发送请求
err := r.request(ctx, func(req *http.Request, resp *http.Response) {
		result = r.transformResponse(resp, req)
	})

// Get方法，获取请求的返回结果，用来打印状态
switch t := out.(type) {
	case *metav1.Status:
		if t.Status != metav1.StatusSuccess {
			return nil, errors.FromObject(t)
		}
	}

```

**站在前人的肩膀上，向前辈致敬，Respect！**

## Summary

通过Visitor的设计模式，从传入的参数中解析出内容，然后在Factory进行NewBuilder的时候进行配置实现RESTClient，mapper，obj的生成，Do()拿到Result，组装好POST请求发送到ApiServer。

到这里我们对kubectl的功能有了初步的了解，以下是关键内容所在：

1. 命令行采用了`cobra`库，主要支持7个大类的命令；
2. 掌握Visitor设计模式，这个是kubectl实现各类资源对象的解析和校验的核心；
3. 初步了解`RESTClient`和`Object`这两个对象，它们是贯穿kubernetes的核心概念；
4. 调用逻辑
   1. cobra匹配子命令
   2. 用Visitor模式构建Builder
   3. 用RESTClient将Object发送到kube-apiserver

