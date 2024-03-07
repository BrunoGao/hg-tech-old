---
title: Spring Boot启动源码分析
authors:  [刘Java]
tags: ["Spring Boot"]
date: 2022-06-28
---

**本次的spring-boot-starter-parent版本为2.3.0。**

Spring Boot项目的启动入口是一个main方法，因此我们从该方法入手即可。

![SampleTomcatApplication](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20230906115646489.png)

关键类就是SpringApplication，他的run方法将当前启动类的class和main方法参数传递进去并执行初始化操作，这个参数就是启动参数。

![ConfigurableApplicationContext](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20230906115824086.png)

```java
/**
 * SpringApplication的方法
 *
 * @param primarySource 启动类的class
 * @param args          启动参数
 * @return 可配置的应用程序上下文
 */
public static ConfigurableApplicationContext run( Class<?> primarySource, String... args ){
   //调用另一个重载方法
   return run( new Class<?>[]{ primarySource }, args );
}

/**
 * SpringApplication的方法
 *
 * @param primarySources 启动类的class数组
 * @param args           启动参数
 * @return 可配置的应用程序上下文
 */
public static ConfigurableApplicationContext run( Class<?>[] primarySources, String[] args ){
   //构造一个SpringApplication实例，然后执行run方法
   return new SpringApplication( primarySources ).run( args );
}

```

可以看到，静态run方法最终会构造一个SpringApplication实例，然后执行run方法进行启动初始化。

# 1 new SpringApplication构建Sring应用实例

该构造器将创建一个SpringApplication实例并且执行一些初始化操作。比如设置主要bean来源集合，设置应用程序类型，设置ApplicationContextInitializer初始化器集合，设置Listener监听器集合等。

![SpringApplication](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20230906115354477.png)

```java
/**
 * 创建一个新的SpringApplication实例，并从指定的来源加载bean的信息
 *
 * @param primarySources 主要bean来源
 */
public SpringApplication( Class<?>... primarySources ){
   //空的资源加载器
   this( null, primarySources );
}

/**
 * 主要bean来源集合
 */
private Set<Class<?>> primarySources;
/**
 * 应用程序初始化器集合
 */
private List<ApplicationContextInitializer<?>> initializers;

/**
 * 应用程序监听器集合
 */
private List<ApplicationListener<?>> listeners;

/**
 * 主应用程序类
 */
private Class<?> mainApplicationClass;

/**
 * 应用程序类型
 */
private WebApplicationType webApplicationType;

/**
 * 创建一个新的SpringApplication实例，并从指定的来源加载bean的信息
 *
 * @param resourceLoader 要使用的资源加载器
 * @param primarySources 主要bean来源
 */
@SuppressWarnings( { "unchecked", "rawtypes" } )
public SpringApplication( ResourceLoader resourceLoader, Class<?>... primarySources ){

   this.resourceLoader = resourceLoader;
   Assert.notNull( primarySources, "PrimarySources must not be null" );
   //将主要来源设置到一个集合里面，默认来源就只有一个启动类的class
   this.primarySources = new LinkedHashSet<>( Arrays.asList( primarySources ) );
   //设置Web应用程序类型，可能是SERVLET程序，也可能是REACTIVE响应式程序，还有可能是NONE，即非web应用程序
   this.webApplicationType = WebApplicationType.deduceFromClasspath();
   //设置ApplicationContextInitializer，应用程序初始化器。从META-INF/spring.factories文件中获取
   setInitializers( ( Collection )getSpringFactoriesInstances( ApplicationContextInitializer.class ) );
   //设置ApplicationListener，应用程序监听器。从META-INF/spring.factories文件中获取
   setListeners( ( Collection )getSpringFactoriesInstances( ApplicationListener.class ) );
   //设置主应用程序类，一般就是Spring boot项目的启动类
   this.mainApplicationClass = deduceMainApplicationClass();
}

```

## 1.1 deduceFromClasspath推断应用程序类型

该方法根据是否存在指定路径的类来推断应用程序类型。有NONE、REACTIVE、SERVLET三种，一般都是SERVLET类型。

![deduceFromClasspath](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/image-20230906115241087.png)

```java
private static final String WEBMVC_INDICATOR_CLASS = 
"org.springframework.web.servlet.DispatcherServlet";

private static final String WEBFLUX_INDICATOR_CLASS = "org.springframework.web.reactive.DispatcherHandler";

private static final String JERSEY_INDICATOR_CLASS = "org.glassfish.jersey.servlet.ServletContainer";

private static final String[] SERVLET_INDICATOR_CLASSES = { "javax.servlet.Servlet",
      "org.springframework.web.context.ConfigurableWebApplicationContext" };


static WebApplicationType deduceFromClasspath() {
   //如果存在org.springframework.web.reactive.DispatcherHandler类型，并且不存在org.springframework.web.servlet.DispatcherServlet类型
   //并且不存在org.glassfish.jersey.servlet.ServletContainer类型
   //那么设置为REACTIVE，即响应式web应用程序
   if (ClassUtils.isPresent(WEBFLUX_INDICATOR_CLASS, null) && !ClassUtils.isPresent(WEBMVC_INDICATOR_CLASS, null)
         && !ClassUtils.isPresent(JERSEY_INDICATOR_CLASS, null)) {
      return WebApplicationType.REACTIVE;
   }
   //如果不存在javax.servlet.Servlet类型，或者不存在org.springframework.web.context.ConfigurableWebApplicationContext类型
   //那么设置为NONE，即非web应用程序
   for (String className : SERVLET_INDICATOR_CLASSES) {
      if (!ClassUtils.isPresent(className, null)) {
         return WebApplicationType.NONE;
      }
   }
   //否则设置为SERVLET，即给予servlet的web应用程序，一般都是SERVLET
   return WebApplicationType.SERVLET;
}

```

## 1.2 setInitializers设置初始化器

设置ApplicationContextInitializer初始化器，后面初始化的时候会使用到，在Spring上下文被刷新之前进行初始化的操作，例如注入Property Sources属性源或者是激活Profiles环境。

这里会借助SpringFactoriesLoader工具类获取所有引入的jar包中和当前类路径下的META-INF/spring.factories文件中指定类型的实例，也就是ApplicationContextInitializer类型的实例。

spring.factories 是Spirng boot提供的一种扩展机制，实际上spring.factories就是仿照Java中的SPI扩展机制来实现的Spring Boot自己的SPI机制，它是实现Spribf Boot的自动配置的基础。

spring.factories该文件必须是 Properties 格式，其中 key 是接口或抽象类的完全限定名称，value 是逗号分隔的实现类名称列表。

```java
public void setInitializers( Collection<? extends 
ApplicationContextInitializer<?>> initializers ){

   this.initializers = new ArrayList<>( initializers );
}

/**
 * 借助SpringFactoriesLoader获取所有引入的jar包中和当前类路径下的META-INF/spring.factories文件中指定类型的实例
 * spring.factories 文件必须是 Properties 格式，其中 key 是接口或抽象类的完全限定名称，value 是逗号分隔的实现类名称列表。
 *
 * @param type 指定类型
 */
private <T> Collection<T> getSpringFactoriesInstances( Class<T> type ){

   return getSpringFactoriesInstances( type, new Class<?>[]{} );
}

private <T> Collection<T> getSpringFactoriesInstances( Class<T> type, Class<?>[] parameterTypes, Object... args ){

   ClassLoader classLoader = getClassLoader();
   //借助SpringFactoriesLoader获取所有引入的jar包中和当前类路径下的META-INF/spring.factories文件中指定类型的实例名称
   //spring.factories 文件必须是 Properties 格式，其中 key 是接口或抽象类的完全限定名称，value 是逗号分隔的实现类名称列表。
   //使用名称Set集合保存数据，确保唯一以防止重复
   Set<String> names = new LinkedHashSet<>( SpringFactoriesLoader.loadFactoryNames( type, classLoader ) );
   //根据获取的类型全路径名反射创建实例
   List<T> instances = createSpringFactoriesInstances( type, parameterTypes, classLoader, args, names );
   //对实例进行排序
   AnnotationAwareOrderComparator.sort( instances );
   return instances;

```

### 1.2.1 loadFactoryNames加载给定类型的全路径名

通过SpringFactoriesLoader从全部“META-INF/spring.factories”文件中根据给定的type类型获取所有对应的是实现类的全路径类名集合。这里的type就是ApplicationContextInitializer。

```java
public static List<String> loadFactoryNames(Class<?> factoryType, 
@Nullable ClassLoader classLoader) {
   //获取工厂类型名，这里就是org.springframework.context.ApplicationContextInitializer
   String factoryTypeName = factoryType.getName();
   //根据上面的名字作为key从/META-INF/spring.factories文件中获取指定的value并转换为集合
   //value就是实现类的全路径名，并通过','拆分多个实现类
   return loadSpringFactories(classLoader).getOrDefault(factoryTypeName, Collections.emptyList());
}

```

例如，与常见的自动配置类相关的是位于spring-boot-autoconfigure.jar下的/META-INF/spring.factories文件。其文件中，名为org.springframework.context.ApplicationContextInitializer的key对应的value为包括三个初始化器：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/12fea1b7c3c04a8da9c39ed5bdbe732d~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

在另一个spring-boot.jar包中同样有该初始化器的配置信息，同样会被加载：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/036ad58202bd4f70b7991b850d44aadf~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

### 1.2.2 createSpringFactoriesInstances实例化

该方法将会对上面方法加载的全部ApplicationContextInitializer的实现进行实例化，实际上就是一系列反射创建对象的过程。

```java
/**
 * SpringApplication的方法
 * 
 * 反射创建实例
 */
private <T> List<T> createSpringFactoriesInstances( Class<T> type, Class<?>[] parameterTypes, ClassLoader classLoader, Object[] args,
      Set<String> names ){
   //最终返回的对象集合
   List<T> instances = new ArrayList<>( names.size() );
   //遍历全路径名数组
   for( String name : names ){
      try{
         //根据全路径名获取对应的class对象
         Class<?> instanceClass = ClassUtils.forName( name, classLoader );
         Assert.isAssignable( type, instanceClass );
         //获取指定的构造器
         Constructor<?> constructor = instanceClass.getDeclaredConstructor( parameterTypes );
         //通过构造器反射创建对象
         T instance = ( T )BeanUtils.instantiateClass( constructor, args );
         instances.add( instance );
      }
      catch( Throwable ex ){
         throw new IllegalArgumentException( "Cannot instantiate " + type + " : " + name, ex );
      }
   }
   return instances;
}

```

## 1.3 setListeners设置监听器

设置ApplicationListener监听器。该方法和上面的setInitializers方法的逻辑是一样的。

这里是从META-INF/spring.factories文件中获取配置的ApplicationListener类型的实例。

spring-boot-autoconfigure.jar下的/META-INF/spring.factories文件中，名为org.springframework.context.ApplicationListener的key对应的value为包括一个监听器。

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/8a321995150a45c48abe033e34b8b1f8~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

在另一个spring-boot.jar包中同样有该初始化器的配置信息，同样会被加载：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/6b3cb0734bbe48f2a78cb495566b15b0~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

## 1.4 deduceMainApplicationClass推断应用程序主类

该方法推断应用程序主类，一般就是Spring boot项目的启动类，也就是调用main方法的类。

```java
/**
 * SpringApplication的方法
 * 推断应用程序主类，一般就是Spring boot项目的启动类
 *
 * @return 主类class
 */
private Class<?> deduceMainApplicationClass(){

   try{
      //获取堆栈跟踪记录
      StackTraceElement[] stackTrace = new RuntimeException().getStackTrace();
      for( StackTraceElement stackTraceElement : stackTrace ){
         //找到调用main方法的类，返回该类的class
         if( "main".equals( stackTraceElement.getMethodName() ) ){
            return Class.forName( stackTraceElement.getClassName() );
         }
      }
   }
   catch( ClassNotFoundException ex ){
      // Swallow and continue
   }
   return null;
}

```

# 2 run运行spring应用实例

该方法将会运行SpringApplication实例，并且创建并刷新一个新的ApplicationContext。该方法就是Spring boot项目启动的关键方法。

该方法主要有以下步骤：

1. 获取全部SpringApplicationRunListener运行监听器并封装到SpringApplicationRunListeners中。SpringApplicationRunListener的实现也是从spring.factories文件中加载的，其中一个实现就是EventPublishingRunListener。
2. 执行所有SpringApplicationRunListener监听器的starting的方法，可以用于非常早期的初始化操作。EventPublishingRunListener的starting方法会向之前初始化的所有ApplicationListener发送一个ApplicationStartingEvent事件，标志着SpringApplication的启动。
3. 根据SpringApplicationRunListeners和启动参数准备环境。这一步会查找项目的配置文件以及激活的profile等信息。
4. 打印启动banner图。
5. 创建spring上下文容器实例，核心方法。基于servlet的web项目容器是AnnotationConfigServletWebServerApplicationContext类型。
6. 准备上下文容器，核心方法。该方法会将我们的启动类注入到springboot的容器上下文内部的beanfactory中，有了这一步，后面就可以解析启动类的注解和各种配置，进而执行springboot的自动配置（启动类上有@SpringBootApplication注解，还有其他各种注解）。
7. 刷新上下文容器，核心方法。该方法就是spring容器的启动方法，将会加载和解析容器中的bean以及各种配置。这个方法的源码非常多，我们在之前的spring启动源码部分花了大量时间已经讲过了，在此不再赘述。之前的文章链接[Spring IoC容器初始化源码](https://link.juejin.cn?target=https%3A%2F%2Fblog.csdn.net%2Fweixin_43767015%2Farticle%2Fdetails%2F109258468)。
8. 刷新后处理。该方法是一个扩展方法，没有提供任何默认的实现，我们自定义的子类可以进行扩展。
9. 应用SpringApplicationRunListener监听器的started方法。EventPublishingRunListener将会发出ApplicationStartedEvent事件，表明容器已启动
10. 调用runner，即执行容器中的ApplicationRunner和CommandLineRunner类型bean的run方法。这也是一个扩展点，用于执行spring容器完全启动后需要做的逻辑。
11. 应用SpringApplicationRunListener监听器的running方法。EventPublishingRunListener将会发出ApplicationReadyEvent事件，表明容器已就绪，可以被使用了。

```java
/**
 * SpringApplication的方法
 * 运行容器
 *
 * @param args 启动参数，也就是main方法的参数
 * @return 一个上下文环境对象，代表着spring容器
 */
public ConfigurableApplicationContext run( String... args ){
   //创建并启动一个计时器，用于统计run方法执行时常，即应用启动时常
   StopWatch stopWatch = new StopWatch();
   stopWatch.start();
   //spring的应用程序上下文，代表着spring容器
   ConfigurableApplicationContext context = null;
   //SpringBootExceptionReporter异常报告者集合，用于记录项目启动过程中的异常信息
   Collection<SpringBootExceptionReporter> exceptionReporters = new ArrayList<>();
   //配置headless系统属性，Headless模式是系统的一种配置模式。在该模式下，系统缺少了显示设备、键盘或鼠标。
   configureHeadlessProperty();
   /*
    * 1、获取全部SpringApplicationRunListener运行监听器并封装到SpringApplicationRunListeners中
    * SpringApplicationRunListener的实现也是从spring.factories文件中加载的，其中一个实现就是EventPublishingRunListener
    */
   SpringApplicationRunListeners listeners = getRunListeners( args );
   /*
    * 2、执行所有SpringApplicationRunListener监听器的starting的方法，可以用于非常早期的初始化操作
    */
   //EventPublishingRunListener的starting方法会向之前初始化的所有ApplicationListener发送一个ApplicationStartingEvent事件
   //ApplicationStartingEvent事件标志着SpringApplication的启动，并且此时ApplicationContext还没有初始化，这是一个早期事件
   listeners.starting();
   try{
      //参数对象，封装了传递进来的启动参数
      ApplicationArguments applicationArguments = new DefaultApplicationArguments( args );
      /*
       * 3、根据SpringApplicationRunListeners和启动参数准备环境
       */
      ConfigurableEnvironment environment = prepareEnvironment( listeners, applicationArguments );
      /*
       * 配置spring.beaninfo.ignore属性
       * 这个配置用来忽略所有自定义的BeanInfo类的搜索，优化启动速度
       */
      configureIgnoreBeanInfo( environment );
      /*
       * 4、打印启动banner图
       */
      Banner printedBanner = printBanner( environment );
      /*
       * 5、创建spring上下文容器实例，核心方法
       */
      context = createApplicationContext();
      /*
       * 获取SpringBootExceptionReporter异常报告者集合，用于记录项目启动过程中的异常信息
       * SpringBootExceptionReporter的实现也是从spring.factories文件中加载的
       */
      exceptionReporters = getSpringFactoriesInstances( SpringBootExceptionReporter.class, new Class[]{ ConfigurableApplicationContext.class },
            context );
      /*
       * 6、准备上下文容器，核心方法
       * 该方法会将我们的启动类注入到容器中，后续通过该类启动自动配置
       */
      prepareContext( context, environment, listeners, applicationArguments, printedBanner );
      /*
       * 7、刷新上下文容器，核心方法
       * 该方法就是spring容器的启动方法，将会加载bean以及各种配置
       * 这个方法的源码非常多，我们在之前的spring启动源码部分花了大量时间已经讲过了，在此不再赘述
       */
      refreshContext( context );
      /*
       * 8、刷新后处理
       * 该方法是一个扩展方法，没有提供任何默认的实现，我们自定义的子类可以进行扩展。
       */
      afterRefresh( context, applicationArguments );
      /*
       * springboot项目启动完毕，停止stopWatch计时
       */
      stopWatch.stop();
      /*
       * 打印容器启动耗时日志
       * 例如：Started SpringBootLearnApplication in 13.611 seconds (JVM running for 20.626)
       */
      if( this.logStartupInfo ){
         new StartupInfoLogger( this.mainApplicationClass ).logStarted( getApplicationLog(), stopWatch );
      }
      /*
       * 9、应用SpringApplicationRunListener监听器的started方法
       * EventPublishingRunListener将会发出ApplicationStartedEvent事件，表明容器已启动
       */
      listeners.started( context );
      /*
       * 10、执行容器中的ApplicationRunner和CommandLineRunner类型的bean的run方法
       * 这也是一个扩展点，用于实现spring容器启动后需要做的事
       */
      callRunners( context, applicationArguments );
   }
   catch( Throwable ex ){
      /*
       * 如果启动过程中出现了异常，那么会将异常信息加入到exceptionReporters中并抛出IllegalStateException
       */
      handleRunFailure( context, ex, exceptionReporters, listeners );
      throw new IllegalStateException( ex );
   }

   try{
      /*
       * 11、应用SpringApplicationRunListener监听器的running方法
       * EventPublishingRunListener将会发出ApplicationReadyEvent事件，表明容器已就绪，可以被使用了
       */
      listeners.running( context );
   }
   catch( Throwable ex ){
      /*
       * 如果发布事件的过程中出现了异常，那么会将异常信息加入到exceptionReporters中并抛出IllegalStateException
       */
      handleRunFailure( context, ex, exceptionReporters, null );
      throw new IllegalStateException( ex );
   }
   //返回容器
   return context;
}

```

## 2.1 configureHeadlessProperty配置headless属性

配置headless系统属性，Headless模式是系统的一种配置模式。在该模式下，系统缺少了显示设备、键盘或鼠标。默认为true。

```java
private static final String SYSTEM_PROPERTY_JAVA_AWT_HEADLESS = 
"java.awt.headless";
private boolean headless = true;

/**
 * SpringApplication的方法
 */
private void configureHeadlessProperty(){

   System.setProperty( SYSTEM_PROPERTY_JAVA_AWT_HEADLESS,
         System.getProperty( SYSTEM_PROPERTY_JAVA_AWT_HEADLESS, Boolean.toString( this.headless ) ) );
}

```

## 2.2 getRunListeners获取运行监听器

该方法用于获取运行监听器SpringApplicationRunListener，其也是从spring.factories文件中加载的，key为org.springframework.boot.SpringApplicationRunListener。

```java
/**
 * SpringApplication的方法
 *
 * 获取运行监听器SpringApplicationRunListener并封装到SpringApplicationRunListeners中
 */
private SpringApplicationRunListeners getRunListeners( String[] args ){

   Class<?>[] types = new Class<?>[]{ SpringApplication.class, String[].class };
   //借助SpringFactoriesLoader获取所有引入的jar包中和当前类路径下的META-INF/spring.factories文件中指定类型的实例
   //这里指定类型为SpringApplicationRunListener，默认情况下spring.factories文件中有一个实现，即EventPublishingRunListener
   //最终所有的SpringApplicationRunListener集合会被封装到一个SpringApplicationRunListeners对象中。
   return new SpringApplicationRunListeners( logger, getSpringFactoriesInstances( SpringApplicationRunListener.class, types, this, args ) );
}

//SpringApplicationRunListeners的属性

private final Log log;

private final List<SpringApplicationRunListener> listeners;

/**
 * SpringApplicationRunListeners的构造器
 */
SpringApplicationRunListeners(Log log, Collection<? extends SpringApplicationRunListener> listeners) {
   this.log = log;
   this.listeners = new ArrayList<>(listeners);
}

```

这个key对应的属性仅在spring-boot.jar的spring.factories文件中被设置，且只有一个实现类EventPublishingRunListener。

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/f736618e0a214a05b48c9501fa484658~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

### 2.2.1 EventPublishingRunListener事件发布运行监听器

EventPublishingRunListener是一个很有趣的监听器，在上一步被找到之后会对监听器进行实例化，他的构造器如下：

```java
//EventPublishingRunListener的属性

private final SpringApplication application;

private final String[] args;

/**
 * 事件广播器，用于广播事件
 */
private final SimpleApplicationEventMulticaster initialMulticaster;

public EventPublishingRunListener( SpringApplication application, String[] args ){

   this.application = application;
   this.args = args;
   /*
    * 创建一个 SimpleApplicationEventMulticaster对象
    * 事件广播器，用于向多个监听器广播事件
    */
   this.initialMulticaster = new SimpleApplicationEventMulticaster();
   //将此前获取的ApplicationListener全部加入到事件广播器中
   for( ApplicationListener<?> listener : application.getListeners() ){
      this.initialMulticaster.addApplicationListener( listener );
   }
}

```

EventPublishingRunListener在被实例化的时候，内部会初始化一个事件广播器，并且会将此前获取的ApplicationListener全部加入到事件广播器中。

## 2.3 starting启动监听器

在run()方法开始执行时，该方法就立即被调用，启动所有运行监听器，可用于在初始化最早期时做一些工作。

```java
/**
 * SpringApplicationRunListeners的方法
 * 启动所有运行监听器
 */
void starting(){

   for( SpringApplicationRunListener listener : this.listeners ){
      //调用所有运行监听器的starting方法
      listener.starting();
   }
}

```

EventPublishingRunListener的starting方法会向之前初始化的所有ApplicationListener发送一个ApplicationStartingEvent事件。

ApplicationStartingEvent事件标志着SpringApplication的启动，并且此时ApplicationContext还没有初始化，这是一个早期事件。

```java
/**
 * EventPublishingRunListener的方法
 */
@Override
public void starting(){
   //通过内部的广播器向所有的ApplicationListener发送一个ApplicationStartingEvent事件
   this.initialMulticaster.multicastEvent( new ApplicationStartingEvent( this.application, this.args ) );
}

/**
 * EventPublishingRunListener广播器的方法
 *
 * @param event 发布的事件
 */
@Override
public void multicastEvent( ApplicationEvent event ){

   multicastEvent( event, resolveDefaultEventType( event ) );
}

/**
 * EventPublishingRunListener广播器的方法
 *
 * @param event     发布的事件
 * @param eventType 事件的ResolvableType
 */
@Override
public void multicastEvent( final ApplicationEvent event, @Nullable ResolvableType eventType ){

   ResolvableType type = ( eventType != null ? eventType : resolveDefaultEventType( event ) );
   //获取事件发布执行器，如果设置了多线程的执行器，那么就可以异步的发布事件
   //EventPublishingRunListener的执行器是null，即同步发布
   Executor executor = getTaskExecutor();
   //执行所有ApplicationListener的onApplicationEvent方法，触发对事件的处理
   for( ApplicationListener<?> listener : getApplicationListeners( event, type ) ){
      if( executor != null ){
         executor.execute( () -> invokeListener( listener, event ) );
      }
      else{
         invokeListener( listener, event );
      }
   }
}

```

## 2.4 prepareEnvironment准备环境

启动监听器之后，首先需要准备容器环境，根据SpringApplicationRunListeners和启动参数准备环境。这里会对外部配置的参数进行设置，比如端口号之类的。

```java
/**
 * SpringApplication的方法
 * 准备环境
 *
 * @param listeners            运行监听器
 * @param applicationArguments 配置参数
 * @return 环境
 */
private ConfigurableEnvironment prepareEnvironment( SpringApplicationRunListeners listeners, ApplicationArguments applicationArguments ){
   /*
    * 获取或者创建环境对象，一般都是StandardServletEnvironment类型
    */
   ConfigurableEnvironment environment = getOrCreateEnvironment();
   /*
    * 配置环境
    * 主要配置属性源和激活的环境，将来自外部的配置源放在属性源集合的头部
    */
   configureEnvironment( environment, applicationArguments.getSourceArgs() );
   //继续封装属性源
   ConfigurationPropertySources.attach( environment );
   /*
    * 环境准备完毕之后，向所有的ApplicationListener发出ApplicationEnvironmentPreparedEvent事件
    */
   listeners.environmentPrepared( environment );
   /*
    * 将环境对象绑定到SpringApplication
    * */
   bindToSpringApplication( environment );
   /*
    * 如果不是自定义的环境变量，若有必要则进行转换，一般都需要转换
    */
   if( !this.isCustomEnvironment ){
      environment = new EnvironmentConverter( getClassLoader() ).convertEnvironmentIfNecessary( environment, deduceEnvironmentClass() );
   }
   //继续封装属性源
   ConfigurationPropertySources.attach( environment );
   return environment;
}

/**
 * SpringApplication的属性
 * 环境对象
 */
private ConfigurableEnvironment environment;

/**
 * SpringApplication的方法
 * 创建和配置环境
 */
private ConfigurableEnvironment getOrCreateEnvironment(){
   //如果已存在就直接返回
   if( this.environment != null ){
      return this.environment;
   }
   //根据应用程序类型创建不同的环境对象
   switch( this.webApplicationType ){
      //一般都是SERVLET项目，因此一般都是StandardServletEnvironment
      case SERVLET:
         return new StandardServletEnvironment();
      case REACTIVE:
         return new StandardReactiveWebEnvironment();
      default:
         return new StandardEnvironment();
   }
}

/**
 * SpringApplication的方法
 * 配置环境
 */
protected void configureEnvironment( ConfigurableEnvironment environment, String[] args ){
   //是否需要添加转换服务，默认需要
   if( this.addConversionService ){
      ConversionService conversionService = ApplicationConversionService.getSharedInstance();
      environment.setConversionService( ( ConfigurableConversionService )conversionService );
   }
   //配置属性源，所谓属性源实际上可以看做是多个配置集的集合，来自外部的配置集将会被放在配置集合的首位
   configurePropertySources( environment, args );
   //配置激活的环境
   configureProfiles( environment, args );
}

```

### 2.4.1 environmentPrepared发布事件

在环境准备好之后，会向所有的SpringApplicationRunListener发布事件。而EventPublishingRunListener又会通过内部的广播器向所有的 ApplicationListener发出ApplicationEnvironmentPreparedEvent事件，即会发布环境已准备事件。

```java
/**
 * SpringApplicationRunListeners的方法
 * <p>
 * 发布环境已准备事件
 *
 * @param environment 已准备好的环境对象
 */
void environmentPrepared(ConfigurableEnvironment environment) {
    //调用所有SpringApplicationRunListener的environmentPrepared方法
    for (SpringApplicationRunListener listener : this.listeners) {
        listener.environmentPrepared(environment);
    }
}

/**
 * EventPublishingRunListener的方法
 *
 * @param environment 已准备好的环境对象
 */
@Override
public void environmentPrepared(ConfigurableEnvironment environment) {
    //向所有ApplicationListener发布ApplicationEnvironmentPreparedEvent事件
    this.initialMulticaster
            .multicastEvent(new ApplicationEnvironmentPreparedEvent(this.application, this.args, environment));
}

```

#### 2.4.1.1 ConfigFileApplicationListener配置文件监听器

不同的监听器在接收到不同的事件之后，会进行不同的处理。这里就有一个非常关键的监听器ConfigFileApplicationListener，它会监听ApplicationEnvironmentPreparedEvent事件，并在监听到该事件的发布之后，去加载项目中的 properties 和yml配置文件并添加到Environment的PropertySources列表里，所以他是一个很关键的监听器。

下面是ConfigFileApplicationListener处理事件的方法，其内部会从spring.factories文件中加载加载环境后处理器EnvironmentPostProcessor，然后委托给EnvironmentPostProcessor来处理事件。而ConfigFileApplicationListener本身也是一个EnvironmentPostProcessor，他的postProcessEnvironment方法就会去加载配置文件。

```java
/**
 * ConfigFileApplicationListener的方法
 * 应用程序事件处理的方法
 *
 * @param event
 */
@Override
public void onApplicationEvent( ApplicationEvent event ){

   if( event instanceof ApplicationEnvironmentPreparedEvent ){
      //如果是坏境准备完毕事件，那么调用该方法处理
      onApplicationEnvironmentPreparedEvent( ( ApplicationEnvironmentPreparedEvent )event );
   }
   if( event instanceof ApplicationPreparedEvent ){
      onApplicationPreparedEvent( event );
   }
}

/**
 * ConfigFileApplicationListener的方法
 * 处理环境准备就绪事件的方法
 *
 * @param event
 */
private void onApplicationEnvironmentPreparedEvent( ApplicationEnvironmentPreparedEvent event ){
   //加载环境后处理器EnvironmentPostProcessor，很明显其也是从spring.factories文件中加载的
   List<EnvironmentPostProcessor> postProcessors = loadPostProcessors();
   //将自己页加入其中，因为ConfigFileApplicationListener本身也是一个EnvironmentPostProcessor
   postProcessors.add( this );
   //排序
   AnnotationAwareOrderComparator.sort( postProcessors );
   //循环调用EnvironmentPostProcessor的postProcessEnvironment方法执行环境处理
   for( EnvironmentPostProcessor postProcessor : postProcessors ){
      postProcessor.postProcessEnvironment( event.getEnvironment(), event.getSpringApplication() );
   }
}

```

ConfigFileApplicationListener的是通过一个内部类的实例Loader对象来加载配置文件的，Loader用于加载候选属性源并配置活动配置文件。

```java
/**
 * ConfigFileApplicationListener的方法
 */
@Override
public void postProcessEnvironment( ConfigurableEnvironment environment, SpringApplication application ){

   addPropertySources( environment, application.getResourceLoader() );
}

/**
 * ConfigFileApplicationListener的方法
 */
protected void addPropertySources( ConfigurableEnvironment environment, ResourceLoader resourceLoader ){
   //随机数属性源加入到环境对象中
   RandomValuePropertySource.addToEnvironment( environment );
   /*
    * 关键代码
    * 通过ConfigFileApplicationListener的内部类Loader来加载配置文件
    */
   new Loader( environment, resourceLoader ).load();
}

```

Loader的load方法就是加载配置的关键方法。实际上，从ConfigFileApplicationListener这个类中，就可以得知配置文件的加载位置，以及加载顺序：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/5a28765bdf1642cd923bb3caa6f5e3d5~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

需要注意的是，这里的加载优先级和这里的顺序是相反的，因此，加载顺序为：

1. 项目根目录下的/config目录下的配置文件。
2. 项目根目录下的配置文件。
3. 项目类路径（resources）下的/config目录下的配置文件。
4. 项目类路径（resources）下的配置文件。

同时，符合给定环境profile的配置文件优先于默认的配置文件。

## 2.5 printBanner打印启动banner图

这个方法用于打印banner图，首先会查找自定义的banner资源，banner可以是图片或者txt文本格式，默认自定义资源是txt格式，名字是banner.txt，位于resources目录下。

```java
/**
 * SpringApplication的方法
 *
 * @param environment
 * @return
 */
private Banner printBanner( ConfigurableEnvironment environment ){
   //如果没有启动banner打印，则返回null
   if( this.bannerMode == Banner.Mode.OFF ){
      return null;
   }
   ResourceLoader resourceLoader = ( this.resourceLoader != null ) ? this.resourceLoader : new DefaultResourceLoader( getClassLoader() );
   SpringApplicationBannerPrinter bannerPrinter = new SpringApplicationBannerPrinter( resourceLoader, this.banner );
   //banner输出到日志文件中还是控制台，默认是CONSOLE，即控制台
   if( this.bannerMode == Banner.Mode.LOG ){
      return bannerPrinter.print( environment, this.mainApplicationClass, logger );
   }
   return bannerPrinter.print( environment, this.mainApplicationClass, System.out );
}

/**
 * SpringApplicationBannerPrinter的方法
 */
Banner print( Environment environment, Class<?> sourceClass, PrintStream out ){
   //从当前环境中获取banner资源
   //banner可以是图片或者txt文本格式，默认自定义资源名字是banner.txt，位于resources目录下
   //一般是没有自定义banner资源的，此时采用SpringBootBanner，也就是默认的banner配置
   Banner banner = getBanner( environment );
   //打印banner图
   banner.printBanner( environment, sourceClass, out );
   return new SpringApplicationBannerPrinter.PrintedBanner( banner, sourceClass );
}

```

一般是没有自定义banner资源的，此时采用SpringBootBanner，也就是默认的banner配置：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/abfcd498026c4683af169b0f5dd83db5~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

此时控制台的banner图就是非常熟悉的样式：

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/a74f6a74bba04c749d2a41d23c86dc2c~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp) 要想自定义banner资源很简单，根据上面的源码，最简单的是我们只需要在springboot项目的resources文件夹下面创建一个banner.txt文件，springboot启动的时候会去加载这个文件，当然图片也可以。下面是几个定制banner的网站：

1. [patorjk.com/software/ta…](https://link.juejin.cn?target=http%3A%2F%2Fpatorjk.com%2Fsoftware%2Ftaag)
2. [www.network-science.de/ascii/](https://link.juejin.cn?target=http%3A%2F%2Fwww.network-science.de%2Fascii%2F)
3. [www.degraeve.com/img2txt.php](https://link.juejin.cn?target=http%3A%2F%2Fwww.degraeve.com%2Fimg2txt.php)

## 2.6 createApplicationContext创建spring容器

在准备好环境并且加载了配置文件之后，通过createApplicationContext方法创建spring容器对象，基于servlet的web项目容器是AnnotationConfigServletWebServerApplicationContext类型。

```java
/**
 * 自定义的容器类型
 */
private Class<? extends ConfigurableApplicationContext> applicationContextClass;

/**
 * 默认情况下将用于非 Web 的应用程序上下文的类名。
 */
public static final String DEFAULT_CONTEXT_CLASS = "org.springframework.context." + "annotation.AnnotationConfigApplicationContext";

/**
 * 默认情况下将用于 Web 的应用程序上下文的类名。
 */
public static final String DEFAULT_SERVLET_WEB_CONTEXT_CLASS = "org.springframework.boot." + "web.servlet.context.AnnotationConfigServletWebServerApplicationContext";

/**
 * 默认情况下将用于反应式 Web 的应用程序上下文的类名。
 */
public static final String DEFAULT_REACTIVE_WEB_CONTEXT_CLASS = "org.springframework." + "boot.web.reactive.context.AnnotationConfigReactiveWebServerApplicationContext";

/**
 * SpringApplication的方法
 * 用于创建 ApplicationContext 即spring容器的策略方法。
 *
 * @return 可配置的spring容器
 */
protected ConfigurableApplicationContext createApplicationContext(){

   Class<?> contextClass = this.applicationContextClass;
   //如果没有设置容器类型
   if( contextClass == null ){
      try{
         //根据web应用程序类型选择spring容器的类型
         switch( this.webApplicationType ){
            //一般都是servlet应用，因此spring容器就是AnnotationConfigServletWebServerApplicationContext类型
            case SERVLET:
               contextClass = Class.forName( DEFAULT_SERVLET_WEB_CONTEXT_CLASS );
               break;
            case REACTIVE:
               contextClass = Class.forName( DEFAULT_REACTIVE_WEB_CONTEXT_CLASS );
               break;
            default:
               contextClass = Class.forName( DEFAULT_CONTEXT_CLASS );
         }
      }
      catch( ClassNotFoundException ex ){
         throw new IllegalStateException( "Unable create a default ApplicationContext, please specify an ApplicationContextClass", ex );
      }
   }
   //调用无参构造器反射创建实例
   return ( ConfigurableApplicationContext )BeanUtils.instantiateClass( contextClass );
}

```

## 2.7 prepareContext准备上下文

该方法用于准备容器上下文，主要是进行ApplicationContextInitializer扩展点的应用，以及打印启动日志，比如激活的profiles图，设置是否允许同名bean覆盖（默认不允许），是否懒加载（默认不允许）等操作。

最重要的是该方法会将我们的启动类注入到springboot的容器上下文内部的beanfactory中，有了这一步，后面就可以解析启动类的注解和各种配置，进而执行springboot的自动配置（启动类上有@SpringBootApplication注解，还有其他各种注解）。

```java
/**
 * SpringApplication的方法
 * 准备容器上下文
 *
 * @param context              spring容器
 * @param environment          环境对象
 * @param listeners            监听器
 * @param applicationArguments 配置参数
 * @param printedBanner        banner
 */
private void prepareContext( ConfigurableApplicationContext context, ConfigurableEnvironment environment, SpringApplicationRunListeners listeners,
      ApplicationArguments applicationArguments, Banner printedBanner ){
   //设置环境变量
   context.setEnvironment( environment );
   /*
    * 对于容器的后处理，会尝试注入BeanNameGenerator，设置resourceLoader，设置ConversionService等操作
    * 子类可以根据需要应用额外的处理。
    */
   postProcessApplicationContext( context );
   /*
    * 应用ApplicationContextInitializer扩展点的initialize方法
    * 从而实现自定义容器的逻辑，这是一个扩展点
    */
   applyInitializers( context );
   /*
    * 应用SpringApplicationRunListener监听器的contextPrepared方法
    * EventPublishingRunListener将会发出ApplicationContextInitializedEvent事件
    */
   listeners.contextPrepared( context );
   //是否打印启动相关日志，默认true
   if( this.logStartupInfo ){
      //记录启动日志信息，即banner图日志下面的第一行日志信息
      logStartupInfo( context.getParent() == null );
      //记录激活的配置环境profiles日志信息
      //即The following profiles are active: dev，或者No active profile set, falling back to default profiles:
      logStartupProfileInfo( context );
   }
   // 获取此上下文内部的beanFactory，即bean工厂
   ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
   //将applicationArguments作为一个单例对象注册到bean工厂中
   beanFactory.registerSingleton( "springApplicationArguments", applicationArguments );
   if( printedBanner != null ){
      //将banner作为一个单例对象注册到bean工厂中
      beanFactory.registerSingleton( "springBootBanner", printedBanner );
   }
   //如果是该类型，servlet项目默认就是该类型
   if( beanFactory instanceof DefaultListableBeanFactory ){
      //设置是否允许同名bean的覆盖，这里默认false，如果有同名bean就会抛出异常
      ( ( DefaultListableBeanFactory )beanFactory ).setAllowBeanDefinitionOverriding( this.allowBeanDefinitionOverriding );
   }
   //设置是否允许懒加载，即延迟初始化bean，即仅在需要bean时才创建该bean，并注入其依赖项。
   //默认false，即所有定义的bean及其依赖项都是在创建应用程序上下文时创建的。
   if( this.lazyInitialization ){
      context.addBeanFactoryPostProcessor( new LazyInitializationBeanFactoryPostProcessor() );
   }
   // 加载启动源，默认就是我们的启动类
   Set<Object> sources = getAllSources();
   Assert.notEmpty( sources, "Sources must not be empty" );
   /*
    * 加载启动类，并将启动类注入到容器，关键方法
    * 有了这一步，后面就可以解析启动了伤的竹节和各种配置，进行执行springboot的自动配置
    */
   load( context, sources.toArray( new Object[ 0 ] ) );
   /*
    * 应用SpringApplicationRunListener监听器的contextLoaded方法
    * EventPublishingRunListener将会发出ApplicationPreparedEvent事件
    */
   listeners.contextLoaded( context );
}

```

## 2.8 refreshContext刷新上下文

如果你之前看过了我的spring启动源码的一系列文章，那么对此方法你一定不会陌生。该方法就是spring容器的启动方法，将会加载bean以及各种配置。该方法是spring项目的核心方法，源码非常多，我们在之前以及花了大量时间讲过了，在此不再赘述，之前的文章链接[Spring IoC容器初始化源码](https://link.juejin.cn?target=https%3A%2F%2Fblog.csdn.net%2Fweixin_43767015%2Farticle%2Fdetails%2F109258468)。

该方法还会向当前的JVM运行时环境注册一个钩子函数，该函数会在JVM关闭之前进行执行，并且会执行当前spring上下文容器的doClose方法，即关闭容器。

```java
/**
 * SpringApplication的方法
 *
 * @param context
 */
private void refreshContext( ConfigurableApplicationContext context ){
   /*
    * 刷新容器
    */
   refresh( ( ApplicationContext )context );
   //判断是否注册销毁容器的钩子方法，默认true
   if( this.registerShutdownHook ){
      try{
         //注册销毁容器时的钩子
         //该方法向 JVM 运行时环境注册一个关闭钩子函数，在 JVM 关闭时会先关闭此上下文，即执行此上线文的close方法
         context.registerShutdownHook();
      }
      catch( AccessControlException ex ){
         // Not allowed in some environments.
      }
   }
}

/**
 * AbstractApplicationContext的方法
 * 向JVM注册钩子函数，该函数将会在JVM关闭时被执行，进行spring上下文的关闭操作
 */
public void registerShutdownHook(){

   if( this.shutdownHook == null ){
      // 钩子函数
      this.shutdownHook = new Thread( SHUTDOWN_HOOK_THREAD_NAME ){

         @Override
         public void run(){

            synchronized( startupShutdownMonitor ){
               //执行当前上下文环境的close方法
               doClose();
            }
         }
      };
      Runtime.getRuntime().addShutdownHook( this.shutdownHook );
   }
}

```

## 2.9 afterRefresh刷新后处理

该方法是一个扩展方法，没有提供任何默认的实现，我们自定义的子类可以进行扩展。

```java
protected void afterRefresh(ConfigurableApplicationContext context, ApplicationArguments args) {
}

```

## 2.10 callRunners调用runner

runner是一类特殊的bean，如果该bean属于ApplicationRunner或者CommandLineRunner类型，那么该bean就被称为runner，那么在springboot启动之后会自动调用该bean的run方法，这里就是调用的源码！

```java
/**
 * SpringApplication的方法
 * 调用runner
 */
private void callRunners( ApplicationContext context, ApplicationArguments args ){

   List<Object> runners = new ArrayList<>();
   //从容器中查找全部ApplicationRunner和CommandLineRunner类型的bean实例，并且加入到集合中
   runners.addAll( context.getBeansOfType( ApplicationRunner.class ).values() );
   runners.addAll( context.getBeansOfType( CommandLineRunner.class ).values() );
   //排序
   AnnotationAwareOrderComparator.sort( runners );
   //依次运行这些runner
   for( Object runner : new LinkedHashSet<>( runners ) ){
      if( runner instanceof ApplicationRunner ){
         callRunner( ( ApplicationRunner )runner, args );
      }
      if( runner instanceof CommandLineRunner ){
         callRunner( ( CommandLineRunner )runner, args );
      }
   }
}

private void callRunner( ApplicationRunner runner, ApplicationArguments args ){

   try{
      //运行ApplicationRunner，参数就是当前的配置参数
      ( runner ).run( args );
   }
   catch( Exception ex ){
      throw new IllegalStateException( "Failed to execute ApplicationRunner", ex );
   }
}

private void callRunner( CommandLineRunner runner, ApplicationArguments args ){

   try{
      //运行CommandLineRunner，参数就是当前返回传递给应用程序的原始未处理参数
      ( runner ).run( args.getSourceArgs() );
   }
   catch( Exception ex ){
      throw new IllegalStateException( "Failed to execute CommandLineRunner", ex );
   }
}

```

# 3 总结

Spring Boot的启动源码整体看下来还是比较易懂的，当然细节全都在refreshContext方法中，而这个方法实际上也是spring中的方法，此前我们花了很大的篇幅去介绍该方法，之前的文章链接[Spring IoC容器初始化源码](https://link.juejin.cn?target=https%3A%2F%2Fblog.csdn.net%2Fweixin_43767015%2Farticle%2Fdetails%2F109258468)。

另外，我们常常听别人说Spring Boot内嵌了Tomcat服务器，但是本次源码分析却没有Tomcat服务器的影子，那么Tomcat是在哪里地方，是在什么时候启动的呢？

聪明的你可能已经猜到了，实际上Tomcat服务器也是在Spring Boot自动装配的环节进行配置的，那么Spring Boot自动装配的原理是什么呢？这个我们之前也有了分析：[Spring Boot自动配置的原理简介以及@Conditional条件注解](https://link.juejin.cn?target=https%3A%2F%2Fblog.csdn.net%2Fweixin_43767015%2Farticle%2Fdetails%2F118178404)。实际上这一切都是在refreshContext方法中去完成的。

与Tomcat服务器相关的自动配置类是哪一个呢？实际上它是位于spring-boot-autoconfigure.jar下的/META-INF/spring.factories文件中的一个名为ServletWebServerFactoryAutoConfiguration的自动配置类。

![在这里插入图片描述](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/00433a208b414a8abfcc0e1fbdf80bfc~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)

那么，Tomcat具体是怎么装配的呢？这就要看这个自动配置类的源码了，这个问题我们下一篇文章再继续分析！

