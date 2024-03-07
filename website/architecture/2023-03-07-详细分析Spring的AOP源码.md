---
title: 详细分析Spring的AOP源码
description: 本篇文章是SpringAOP的源码学习分享，分为上下两篇。本篇是对SpringAOP中切面织入业务bean时为业务bean生成动态代理对象的这一块的源码学习。
publishdate: 2023-03-07
authors: 半夏之沫
tags: ["spring boot"]
summary: >-
 本文深入探讨了Spring AOP的动态代理对象生成机制，包括通知链的获取和AOP动态代理对象的创建过程。首先，通过遍历容器中的切面bean，将其通知封装成Advisor并缓存起来，形成通知链。然后，利用ProxyFactory工厂基于通知链为目标bean生成JDK或CGLIB动态代理对象。整个过程在bean的生命周期中的BeanPostProcessors的postProcessAfterInitialization()方法中完成，实现了切面的织入。
---


## 前言

>本篇文章是**SpringAOP**的源码学习分享，分为上下两篇。本篇是对**SpringAOP**中切面织入业务**bean**时为业务**bean**生成动态代理对象的这一块的源码学习。

## 正文

### 一. 示例工程搭建

通过引入**Springboot**来完成引入**Spring**的相关依赖，依赖项如下所示。

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-aop</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
    </dependency>
</dependencies>

```

使用的**Springboot**版本为**2.4.1**，对应的**Spring**版本为**5.3.2**。

首先自定义一个注解，用于在切点中定位到目标方法，如下所示。

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface MyMethod {}

```

然后定义业务接口和实现类，如下所示。

```java
public interface IMyService {

    void executeTask(String message);

    void tempExecute(String message);

}

@Service
public class MyService implements IMyService {

    @Override
    @MyMethod
    public void executeTask(String message) {
        System.out.println(message);
    }

    @Override
    public void tempExecute(String message) {
        executeTask(message);
    }

}

```

然后定义一个切面，已知**切面 = 切点 + 通知**，在本示例工程中，切点是所有由@**MyMethod**注解修饰的方法，并且选择前置通知和后置通知，如下所示。

```java
@Aspect
@Component
public class MyAspect {

    @Pointcut("@annotation(com.learn.aop.aspect.MyMethod)")
    public void myMethodPointcut() {}

    @Before(value = "myMethodPointcut()")
    public void commonBeforeMethod(JoinPoint joinPoint) {
        System.out.println("Common before method.");
    }

    @After(value = "myMethodPointcut()")
    public void commonAfterMethod(JoinPoint joinPoint) {
        System.out.println("Common after method.");
    }

}

```

自定义一个配置类，和上面所有类放在同一包路径下，如下所示。

```java
@ComponentScan
@EnableAspectJAutoProxy
public class MyConfig {}

```

最后编写一个测试程序，如下所示。

```java
public class MyTest {

    public static void main(String[] args) {
        ApplicationContext applicationContext
                = new AnnotationConfigApplicationContext(MyConfig.class);

        IMyService iMyService = applicationContext.getBean(IMyService.class);

        iMyService.tempExecute("Real method execute.");
        iMyService.executeTask("Real method execute.");
    }

}

```

运行测试程序，打印如下。

![SpringAOP测试结果图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/65745e7f28a941a096c6c0b2f6053496~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

可以看到运行**executeTask()** 方法时，切面逻辑生效了。

### 二. 时序图

**SpringAOP**中动态代理对象的生成，可以分为两个大的步骤。

- **步骤一**：将作用于当前**bean**的通知获取出来，得到**通知链**；
- **步骤二**：基于通知链为当前**bean**生成**AOP**动态代理对象，并根据配置和目标**bean**决定是使用**CGLIB**动态代理还是**JDK**动态代理。

通知链可以表示如下。

```java
List<Advisor> chain

```

**Advisor**接口是**SpringAOP**中对通知的一个顶层抽象，其有两个子接口，类图如下所示。

![Advisor类图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/f1ca1e8d517e44c68c23d9d14aeb63cf~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

**PointcutAdvisor**是对切点相关的通知的抽象，可以将**PointcutAdvisor**理解为对通知方法和切点的封装，由于本文的示例工程中的切面中的通知全部是切点相关的通知，所以无特殊说明时，**Advisor**均指**PointcutAdvisor**，并且也可以不太严谨的将**Advisor**称为通知。

在理清了概念之后，下面给出时序图，时序图有两张，一张是通知链的获取时序图，一张是AOP动态代理对象的生成时序图，如下所示。

- 通知链的获取时序图。

![Spring-AOP获取通知方法对象时序图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/7176019ecb5a49d3b6503ea603eb06db~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

- **AOP**动态代理对象的生成时序图。

![Spring-AOP创建代理对象时序图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/db149679f2ed48299d95d9d976ea9fee~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

后续源码的分析可以结合上述时序图进行理解。

### 三. SpringAOP动态代理对象生成时间点

在示例工程中，如果通过断点调试的方法，观察**iMyService**字段，可以发现其是一个动态代理对象，如下所示。

![iMyService字段图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/05e56ce4dfda4dc3b03938ccfa74d3a3~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

在**bean**生命周期中，**bean**的实例化，属性注入和初始化都在**AbstractAutowireCapableBeanFactory**的**doCreateBean()** 方法中，在该方法中会先调用**createBeanInstance()** 方法将**bean**实例化出来，然后调用**populateBean()** 方法为**bean**实例完成属性注入，最后调用**initializeBean()** 方法来初始化**bean**。下面看一下**initializeBean()** 方法的实现。

```java
protected Object initializeBean(String beanName, Object bean, @Nullable RootBeanDefinition mbd) {
    
    // ...
    
    if (mbd == null || !mbd.isSynthetic()) {
        // 调用BeanPostProcessors的postProcessBeforeInitialization()方法
        wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
    }

    // ...
    
    if (mbd == null || !mbd.isSynthetic()) {
        // 调用BeanPostProcessors的postProcessAfterInitialization()方法
        wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
    }

    return wrappedBean;
}

```

在初始化**bean**的时候，就会调用到**BeanPostProcessors**（**bean**后置处理器）的**postProcessBeforeInitialization()** 和**postProcessAfterInitialization()** 方法，在**BeanPostProcessors**的实现类**AnnotationAwareAspectJAutoProxyCreator**的**postProcessAfterInitialization()** 方法中，就会为**bean**织入切面（为**bean**生成动态代理对象）。

下面给出**AnnotationAwareAspectJAutoProxyCreator**的类图。

![AnnotationAwareAspectJAutoProxyCreator类图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/f4e7ae30dbea40cdab6cc20d3f160e7b~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

### 四. 通知链的获取

上一节中已知，在**BeanPostProcessors**的实现类**AnnotationAwareAspectJAutoProxyCreator**的**postProcessAfterInitialization()** 方法中，就会为**bean**织入切面（为**bean**生成动态代理对象），那么就以**AnnotationAwareAspectJAutoProxyCreator**的**postProcessAfterInitialization()** 方法为入口，开始分析源码。

其实**AnnotationAwareAspectJAutoProxyCreator**没有对**postProcessAfterInitialization()** 方法做实现，那么实际调用到的是**AnnotationAwareAspectJAutoProxyCreator**父类**AbstractAutoProxyCreator**的**postProcessAfterInitialization()** 方法，如下所示。

```java
public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
    if (bean != null) {
        Object cacheKey = getCacheKey(bean.getClass(), beanName);
        if (this.earlyProxyReferences.remove(cacheKey) != bean) {
            // 如果bean是切面作用目标，就为bean生成动态代理对象
            return wrapIfNecessary(bean, beanName, cacheKey);
        }
    }
    return bean;
}

```

继续看**wrapIfNecessary()** 方法的实现，如下所示。

```java
protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
    if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
        return bean;
    }
    if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
        return bean;
    }
    if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
        this.advisedBeans.put(cacheKey, Boolean.FALSE);
        return bean;
    }

    // 把作用在当前bean的通知获取出来
    Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
    if (specificInterceptors != DO_NOT_PROXY) {
        this.advisedBeans.put(cacheKey, Boolean.TRUE);
        // 为当前bean生成动态代理对象
        Object proxy = createProxy(
                bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
        this.proxyTypes.put(cacheKey, proxy.getClass());
        // 返回当前bean的动态代理对象
        return proxy;
    }

    this.advisedBeans.put(cacheKey, Boolean.FALSE);
    return bean;
}

```

**wrapIfNecessary()** 方法会先将作用于当前**bean**的通知链获取出来，然后再调用**createProxy()** 方法为当前**bean**创建动态代理对象，那么本小节重点分析**getAdvicesAndAdvisorsForBean()** 方法的实现。**getAdvicesAndAdvisorsForBean()** 实现如下。

```java
protected Object[] getAdvicesAndAdvisorsForBean(
        Class<?> beanClass, String beanName, @Nullable TargetSource targetSource) {
    // 将作用于当前bean的通知获取出来，并且通知会被封装成Advisor的实现类
    List<Advisor> advisors = findEligibleAdvisors(beanClass, beanName);
    if (advisors.isEmpty()) {
        return DO_NOT_PROXY;
    }
    return advisors.toArray();
}

```

继续看**findEligibleAdvisors()** 方法，如下所示。

```java
protected List<Advisor> findEligibleAdvisors(Class<?> beanClass, String beanName) {
    // 找到容器中所有由@Aspect注解修饰的切面，并将切面中的每个通知方法都封装成一个Advisor的实现类
    List<Advisor> candidateAdvisors = findCandidateAdvisors();
    // 在candidateAdvisors中将作用于当前bean的Advisor获取出来
    List<Advisor> eligibleAdvisors = findAdvisorsThatCanApply(candidateAdvisors, beanClass, beanName);
    extendAdvisors(eligibleAdvisors);
    if (!eligibleAdvisors.isEmpty()) {
        // 对Advisor进行排序
        eligibleAdvisors = sortAdvisors(eligibleAdvisors);
    }
    return eligibleAdvisors;
}

```

**findEligibleAdvisors()** 方法中会先调用到**AnnotationAwareAspectJAutoProxyCreator**的**findCandidateAdvisors()** 方法，在**findCandidateAdvisors()** 方法中会再调用**BeanFactoryAspectJAdvisorsBuilder**的**buildAspectJAdvisors()** 方法来遍历当前容器中的每个由@**Aspect**注解修饰的切面，然后将每个切面的通知封装成**Advisor**并返回，同时每遍历一个切面，都会将这个切面的所有**Advisor**缓存，以便下次获取时直接从缓存获取。

**findEligibleAdvisors()** 方法中在获取到当前容器中的所有**Advisor**后，会再调用**findAdvisorsThatCanApply()** 方法来找出能够作用于当前**bean**的**Advisor**，判断依据就是根据**Advisor**中的**Pointcut**来判断。

**findEligibleAdvisors()** 方法最后还会对作用于当前**bean**的所有**Advisor**进行排序，这个后面再分析。所以**findEligibleAdvisors()** 方法执行完，就获取到了能够作用于当前**bean**的所有通知对应的**Advisor**，也就获取到了通知链。

最后再分析一下**AnnotationAwareAspectJAutoProxyCreator**的**findCandidateAdvisors()** 方法中是如何获取容器中所有通知以及是如何将每个通知封装成**Advisor**的。**BeanFactoryAspectJAdvisorsBuilder**的**buildAspectJAdvisors()** 方法如下所示。

```java
public List<Advisor> buildAspectJAdvisors() {
    List<String> aspectNames = this.aspectBeanNames;
    // aspectNames不为null表示获取过切面bean的通知并把这些通知进行了缓存，那么直接从缓存获取通知
    if (aspectNames == null) {
        synchronized (this) {
            aspectNames = this.aspectBeanNames;
            if (aspectNames == null) {
                List<Advisor> advisors = new ArrayList<>();
                aspectNames = new ArrayList<>();
                // 把容器中的bean的名字获取出来
                String[] beanNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
                        this.beanFactory, Object.class, true, false);
                // 遍历每个bean
                for (String beanName : beanNames) {
                    if (!isEligibleBean(beanName)) {
                        continue;
                    }
                    Class<?> beanType = this.beanFactory.getType(beanName, false);
                    if (beanType == null) {
                        continue;
                    }
                    // 判断bean是否是切面bean
                    if (this.advisorFactory.isAspect(beanType)) {
                        // 把切面bean的名字添加到集合中，以便后续缓存起来
                        aspectNames.add(beanName);
                        AspectMetadata amd = new AspectMetadata(beanType, beanName);
                        if (amd.getAjType().getPerClause().getKind() == PerClauseKind.SINGLETON) {
                            MetadataAwareAspectInstanceFactory factory =
                                    new BeanFactoryAspectInstanceFactory(this.beanFactory, beanName);
                            // 调用到ReflectiveAspectJAdvisorFactory的getAdvisors()方法来获取切面bean里的通知
                            List<Advisor> classAdvisors = this.advisorFactory.getAdvisors(factory);
                            if (this.beanFactory.isSingleton(beanName)) {
                                // 如果切面bean是单例，则缓存切面bean的通知
                                this.advisorsCache.put(beanName, classAdvisors);
                            }
                            else {
                                // 如果切面bean不是单例，则缓存切面bean的工厂
                                // 通过切面bean的工厂可以每次都生成切面bean的通知
                                this.aspectFactoryCache.put(beanName, factory);
                            }
                            advisors.addAll(classAdvisors);
                        }
                        else {
                            if (this.beanFactory.isSingleton(beanName)) {
                                throw new IllegalArgumentException("Bean with name '" + beanName +
                                        "' is a singleton, but aspect instantiation model is not singleton");
                            }
                            MetadataAwareAspectInstanceFactory factory =
                                    new PrototypeAspectInstanceFactory(this.beanFactory, beanName);
                            this.aspectFactoryCache.put(beanName, factory);
                            advisors.addAll(this.advisorFactory.getAdvisors(factory));
                        }
                    }
                }
                this.aspectBeanNames = aspectNames;
                // 返回容器中的所有通知
                return advisors;
            }
        }
    }

    // 执行到这里表示已经生成过通知并进行了缓存
    if (aspectNames.isEmpty()) {
        return Collections.emptyList();
    }
    List<Advisor> advisors = new ArrayList<>();
    for (String aspectName : aspectNames) {
        // 将每个切面bean的通知从缓存中获取出来并加到结果集合中
        List<Advisor> cachedAdvisors = this.advisorsCache.get(aspectName);
        if (cachedAdvisors != null) {
            advisors.addAll(cachedAdvisors);
        }
        else {
            // 非单例切面bean就使用其对应的工厂新生成通知，然后也加入到结果集合中
            MetadataAwareAspectInstanceFactory factory = this.aspectFactoryCache.get(aspectName);
            advisors.addAll(this.advisorFactory.getAdvisors(factory));
        }
    }
    // 返回容器中的所有通知
    return advisors;
}

```

上面**buildAspectJAdvisors()** 方法中主要是**Spring**对切面**bean**的通知的一个缓存策略，主要思想就是第一次获取时会真实的将所有切面**bean**的通知获取出来并生成**Advisor**，然后缓存起来，后续再获取通知时就从缓存中获取。

下面继续深入分析一下切面**bean**的通知是如何被封装成**Advisor**的，实际的逻辑发生在**ReflectiveAspectJAdvisorFactory**的**getAdvisors()** 方法中，如下所示。

```java
public List<Advisor> getAdvisors(MetadataAwareAspectInstanceFactory aspectInstanceFactory) {
    // 得到切面bean的Class对象
    Class<?> aspectClass = aspectInstanceFactory.getAspectMetadata().getAspectClass();
    // 得到切面bean的名字
    String aspectName = aspectInstanceFactory.getAspectMetadata().getAspectName();
    validate(aspectClass);

    MetadataAwareAspectInstanceFactory lazySingletonAspectInstanceFactory =
            new LazySingletonAspectInstanceFactoryDecorator(aspectInstanceFactory);

    List<Advisor> advisors = new ArrayList<>();
    // 调用getAdvisorMethods()方法来把非切点方法获取出来，并遍历
    for (Method method : getAdvisorMethods(aspectClass)) {
        // 先将通知上的切点构造成AspectJExpressionPointcut，然后再创建通知对应的Advisor
        // 创建出来的Advisor实际为InstantiationModelAwarePointcutAdvisorImpl
        Advisor advisor = getAdvisor(method, lazySingletonAspectInstanceFactory, 0, aspectName);
        // 当前method如果是通知方法，则将通知方法对应的Advisor添加到结果集合中
        // 如果不是通知方法，得到的Advisor会为null，就不会添加到结果集合中
        if (advisor != null) {
            advisors.add(advisor);
        }
    }

    if (!advisors.isEmpty() && lazySingletonAspectInstanceFactory.getAspectMetadata().isLazilyInstantiated()) {
        Advisor instantiationAdvisor = new SyntheticInstantiationAdvisor(lazySingletonAspectInstanceFactory);
        advisors.add(0, instantiationAdvisor);
    }

    for (Field field : aspectClass.getDeclaredFields()) {
        Advisor advisor = getDeclareParentsAdvisor(field);
        if (advisor != null) {
            advisors.add(advisor);
        }
    }

    return advisors;
}

```

至此获取通知链的源码分析完毕。下面对获取作用于某个**bean**的通知链步骤进行小节。

- 如果是第一次获取通知链，那么会遍历容器中每个由@**Aspect**注解修饰的切面**bean**然后将其通知封装成**Advisor**并缓存起来，如果不是第一次获取，就直接从缓存中将所有**Advisor**获取出来；
- 然后筛选得到作用于当前**bean**的**Advisor**，并加入集合中；
- 返回筛选得到的集合，作为后续创建**AOP**动态代理对象的通知链。

### 五. AOP动态代理对象的创建

已知在**AbstractAutoProxyCreator**的**wrapIfNecessary()** 方法中会先调用**getAdvicesAndAdvisorsForBean()** 方法获取作用于当前**bean**的通知链，那么下一步就应该基于通知链为当前**bean**生成**AOP**动态代理对象，生成动态代理对象的逻辑在**AbstractAutoProxyCreator**的**createProxy()** 方法中，如下所示。

```java
protected Object createProxy(Class<?> beanClass, @Nullable String beanName,
        @Nullable Object[] specificInterceptors, TargetSource targetSource) {

    if (this.beanFactory instanceof ConfigurableListableBeanFactory) {
        AutoProxyUtils.exposeTargetClass((ConfigurableListableBeanFactory) this.beanFactory, beanName, beanClass);
    }

    // 创建ProxyFactory来创建动态代理对象
    ProxyFactory proxyFactory = new ProxyFactory();
    proxyFactory.copyFrom(this);

    if (!proxyFactory.isProxyTargetClass()) {
        if (shouldProxyTargetClass(beanClass, beanName)) {
            proxyFactory.setProxyTargetClass(true);
        }
        else {
            evaluateProxyInterfaces(beanClass, proxyFactory);
        }
    }

    Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
    // 为ProxyFactory设置通知链
    proxyFactory.addAdvisors(advisors);
    // 为ProxyFactory设置目标对象
    proxyFactory.setTargetSource(targetSource);
    customizeProxyFactory(proxyFactory);

    proxyFactory.setFrozen(this.freezeProxy);
    if (advisorsPreFiltered()) {
        proxyFactory.setPreFiltered(true);
    }

    // 调用ProxyFactory的getProxy()方法创建动态代理对象
    return proxyFactory.getProxy(getProxyClassLoader());
}

```

在**createProxy()** 方法中会先创建一个**ProxyFactory**工厂，然后为**ProxyFactory**工厂设置通知链和目标对象，后续的动态代理对象的创建就是由**ProxyFactory**工厂来完成。**ProxyFactory**工厂类图如下所示。

![ProxyFactory类图](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/28dd3583c86c4c15bb9312371409bd3e~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0.awebp)

所以**ProxyFactory**其实是一个**AdvisedSupport**。**ProxyFactory**的**getProxy()** 方法如下所示。

```java
public Object getProxy(@Nullable ClassLoader classLoader) {
    return createAopProxy().getProxy(classLoader);
}

```

在**ProxyFactory**的**getProxy()** 方法中会先调用到其父类**ProxyCreatorSupport**中的**createAopProxy()** 方法，**createAopProxy()** 方法会有两种返回值，一个是**JdkDynamicAopProxy**，负责**JDK**动态代理对象的生成，另一个是**CglibAopProxy**，负责**CGLIB**动态代理对象的生成，下面看一下**ProxyCreatorSupport**的**createAopProxy()** 方法的实现。

```java
protected final synchronized AopProxy createAopProxy() {
    if (!this.active) {
        activate();
    }
    // getAopProxyFactory()会返回一个AopProxyFactory
    // AopProxyFactory的createAopProxy()会返回一个AopProxy
    // 根据不同的目标类和不同的配置，会最终决定AopProxy是JdkDynamicAopProxy还是CglibAopProxy
    // 创建AopProxy时还会将ProxyFactory自己传入，所以创建出来的AopProxy也就持有了通知链和目标对象
    return getAopProxyFactory().createAopProxy(this);
}

```

**ProxyCreatorSupport**的**createAopProxy()** 方法中创建**AopProxy**时会将**ProxyFactory**传入，所以创建出来的**AopProxy**也就通过**ProxyFactory**持有了通知链和目标对象。

现在回到**ProxyFactory**的**getProxy()** 方法，在拿到**JdkDynamicAopProxy**或者**CglibAopProxy**之后，就会调用其**getProxy()** 方法来生成动态代理对象，下面以**JdkDynamicAopProxy**的**getProxy()** 方法为例进行说明，**JdkDynamicAopProxy**的**getProxy()** 方法如下所示。

```java
public Object getProxy(@Nullable ClassLoader classLoader) {
    if (logger.isTraceEnabled()) {
        logger.trace("Creating JDK dynamic proxy: " + this.advised.getTargetSource());
    }
    // 调用Proxy的newProxyInstance()方法来生成动态代理对象
    // proxiedInterfaces中有bean实现的接口
    // JdkDynamicAopProxy自身是实现了InvocationHandler接口，所以这将JdkDynamicAopProxy传到了newProxyInstance()方法中
    return Proxy.newProxyInstance(classLoader, this.proxiedInterfaces, this);
}

```

**JdkDynamicAopProxy**的**getProxy()** 方法就是调用**Proxy**的**newProxyInstance()** 方法来创建**JDK**动态代理对象。

至此**SpringAOP**中创建**AOP**动态代理对象的源码分析完毕。下面给出为**bean**基于通知链创建动态代理对象的步骤小节。

- 创建**ProxyFactory**，为**ProxyFactory**设置通知链和目标对象，后续通过P**roxyFactory**创建动态代理对象；
- 通过**ProxyFactory**先创建**AopProxy**，根据使用的动态代理方式的不同，创建出来的**AopProxy**可以为**JdkDynamicAopProxy**或者**ObjenesisCglibAopProxy**，并且**ProxyFactory**在创建**AopProxy**时传入了自身，所以创建出来的**AopProxy**也就持有了通知链和目标对象；
- 通过创建出来的**AopProxy**生成动态代理对象。

## 总结

**Spring**中有用户自定义的切面以及**Spring**框架提供的切面，这些切面会在**bean**的生命周期调用到**BeanPostProcessors**的**postProcessAfterInitialization()** 方法时织入**bean**，织入的形式就是为**bean**生成**AOP**动态代理对象。

为**bean**生成动态代理对象前会先获取到容器中所有能够作用于这个**bean**的通知，这些通知会被封装成**Advisor**的实现类并加入到集合中，可以称这个**Advisor**的集合为通知链，获取到通知链后，会创建一个**ProxyFactory**工厂来帮助创建动态代理对象，创建前会先通过**ProxyFactory**创建**AopProxy**，根据使用的动态代理方式的不同，创建出来的**AopProxy**可以为**JdkDynamicAopProxy**或者**ObjenesisCglibAopProxy**，并且**ProxyFactory**在创建**AopProxy**时传入了自身，所以创建出来的**AopProxy**也就持有了通知链和目标对象，最后就是通过**AopProxy**将实际的动态代理对象生成出来。

:::tip 版权说明
          作者：[半夏之沫](https://juejin.cn/user/2300650277061485)
          
          链接：[https://juejin.cn/post/7207757855033049144](https://juejin.cn/post/7207757855033049144)
:::