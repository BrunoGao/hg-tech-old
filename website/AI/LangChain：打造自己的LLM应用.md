---
title: 'LangChain：打造自己的LLM应用'
authors: [不才陈某]
tags: [announcement, release, debugging]
date: 2024-02-29
---
# 1、LangChain是什么

LangChain是一个框架，用于开发由LLM驱动的应用程序。可以简单认为是LLM领域的Spring，以及开源版的ChatGPT插件系统。核心的2个功能为：

1）可以将 LLM 模型与外部数据源进行连接。

2）允许与 LLM 模型与环境进行交互，通过Agent使用工具。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e03cee558e734af39939ef2ac8a87221~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456121.awebp)

# 2、LangChain核心组件

LangChain提供了各种不同的组件帮助使用LLM，如下图所示，核心组件有Models、Indexes、Chains、Memory以及Agent。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e53d816850f548038f24621fd7d78131~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456160.awebp)

## 2.1 Models

LangChain本身不提供LLM，提供通用的接口访问LLM，可以很方便的更换底层的LLM以及自定义自己的LLM。主要有2大类的Models：

1）LLM：将文本字符串作为输入并返回文本字符串的模型，类似OpenAI的text-davinci-003

2）Chat Models：由语言模型支持但将聊天消息列表作为输入并返回聊天消息的模型。一般使用的ChatGPT以及Claude为Chat Models。

与模型交互的，基本上是通过给与Prompt的方式，LangChain通过PromptTemplate的方式方便我们构建以及复用Prompt。

```ini
ini
from langchain import PromptTemplate

prompt_template = '''作为一个资深编辑，请针对 >>> 和 <<< 中间的文本写一段摘要。 
>>> {text} <<<
'''

prompt = PromptTemplate(template=prompt_template, input_variables=["text"])
print(prompt.format_prompt(text="我爱北京天安门"))
```

## 2.2 Indexes

索引和外部数据进行集成，用于从外部数据获取答案。如下图所示，主要的步骤有

1）通过Document Loaders加载各种不同类型的数据源,

2）通过Text Splitters进行文本语义分割

3）通过Vectorstore进行非结构化数据的向量存储

4）通过Retriever进行文档数据检索

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/e1611bdaf6764474be22d1f7be49b52c~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456198.awebp)

### 2.2.1 Document Loaders

LangChain通过Loader加载外部的文档，转化为标准的Document类型。Document类型主要包含两个属性：page_content 包含该文档的内容。meta_data 为文档相关的描述性数据，类似文档所在的路径等。

如下图所示：LangChain目前支持结构化、非结构化以及公开以及私有的各种数据

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/3d9d9166b8824daa9fd706edcf938d2c~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456255.awebp)

### 2.2.2 Text Splitters

LLM一般都会限制上下文窗口的大小，有4k、16k、32k等。针对大文本就需要进行文本分割，常用的文本分割器为RecursiveCharacterTextSplitter，可以通过separators指定分隔符。其先通过第一个分隔符进行分割，不满足大小的情况下迭代分割。

文本分割主要有2个考虑：

1）将语义相关的句子放在一块形成一个chunk。一般根据不同的文档类型定义不同的分隔符，或者可以选择通过模型进行分割。

2）chunk控制在一定的大小，可以通过函数去计算。默认通过len函数计算，模型内部一般都是使用token进行计算。token通常指的是将文本或序列数据划分成的小的单元或符号，便于机器理解和处理。使用OpenAI相关的大模型，可以通过tiktoken包去计算其token大小。

```css
css
from langchain.text_splitter import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="gpt-3.5-turb
    allowed_special="all",
    separators=["\n\n", "\n", "。", "，"],
    chunk_size=7000,
    chunk_overlap=0
)
docs = text_splitter.create_documents(["文本在这里"])
print(docs)
```

### 2.2.3 Vectorstore

通过Text Embedding models，将文本转为向量，可以进行语义搜索，在向量空间中找到最相似的文本片段。目前支持常用的向量存储有Faiss、Chroma等。

Embedding模型支持OpenAIEmbeddings、HuggingFaceEmbeddings等。通过HuggingFaceEmbeddings加载本地模型可以节省embedding的调用费用。

```ini
ini
#通过cache_folder加载本地模型
embeddings = HuggingFaceEmbeddings(model_name="text2vec-base-chinese", cache_folder="本地模型地址")

embeddings = embeddings_model.embed_documents(
    [
        "我爱北京天安门!",
        "Hello world!"
    ]
)
```

### 2.2.4 Retriever

Retriever接口用于根据非结构化的查询获取文档，一般情况下是文档存储在向量数据库中。可以调用 get_relevant_documents 方法来检索与查询相关的文档。

```ini
ini
from langchain import FAISS
from langchain.document_loaders import WebBaseLoader
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter

loader = WebBaseLoader("https://in.m.jd.com/help/app/register_info.html")
data = loader.load()
text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="gpt-3.5-turbo",
    allowed_special="all",
    separators=["\n\n", "\n", "。", "，"],
    chunk_size=800,
    chunk_overlap=0
)
docs = text_splitter.split_documents(data)
#通过cache_folder设置自己的本地模型路径
embeddings = HuggingFaceEmbeddings(model_name="text2vec-base-chinese", cache_folder="models")
vectorstore = FAISS.from_documents(docs, embeddings)
result = vectorstore.as_retriever().get_relevant_documents("用户注册资格")
print(result)
print(len(result))
```

## 2.3 Chains

Langchain通过chain将各个组件进行链接，以及chain之间进行链接，用于简化复杂应用程序的实现。其中主要有LLMChain、Sequential Chain以及Route Chain

### 2.3.1 LLMChain

最基本的链为LLMChain，由PromptTemplate、LLM和OutputParser组成。LLM的输出一般为文本，OutputParser用于让LLM结构化输出并进行结果解析，方便后续的调用。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/d88c0aaf8aac4f0783c071401af6264b~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456299.awebp)

类似下面的示例，给评论进行关键词提前以及情绪分析，通过LLMChain组合PromptTemplate、LLM以及OutputParser，可以很简单的实现一个之前通过依赖小模型不断需要调优的事情。

```ini
ini
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.output_parsers import ResponseSchema, StructuredOutputParser
from azure_chat_llm import llm

#output parser
keyword_schema = ResponseSchema(name="keyword", description="评论的关键词列表")
emotion_schema = ResponseSchema(name="emotion", description="评论的情绪，正向为1，中性为0，负向为-1")
response_schemas = [keyword_schema, emotion_schema]
output_parser = StructuredOutputParser.from_response_schemas(response_schemas)
format_instructions = output_parser.get_format_instructions()

#prompt template
prompt_template_txt = '''
作为资深客服，请针对 >>> 和 <<< 中间的文本识别其中的关键词，以及包含的情绪是正向、负向还是中性。
>>> {text} <<<
RESPONSE:
{format_instructions}
'''

prompt = PromptTemplate(template=prompt_template_txt, input_variables=["text"],
                        partial_variables={"format_instructions": format_instructions})

#llmchain
llm_chain = LLMChain(prompt=prompt, llm=llm)
comment = "京东物流没的说，速度态度都是杠杠滴！这款路由器颜值贼高，怎么说呢，就是泰裤辣！这线条，这质感，这速度，嘎嘎快！以后妈妈再也不用担心家里的网速了！"
result = llm_chain.run(comment)
data = output_parser.parse(result)
print(f"type={type(data)}, keyword={data['keyword']}, emotion={data['emotion']}")
```

输出：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/86c0401315374975820eaa25e0a1bf59~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456330.awebp)

### 2.3.2 Sequential Chain

SequentialChains是按预定义顺序执行的链。SimpleSequentialChain为顺序链的最简单形式，其中每个步骤都有一个单一的输入/输出，一个步骤的输出是下一个步骤的输入。SequentialChain 为顺序链更通用的形式，允许多个输入/输出。

```scala
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.chains import SimpleSequentialChain

first_prompt = PromptTemplate.from_template(
    "翻译下面的内容到中文:"
    "\n\n{content}"
)
# chain 1: 输入：Review 输出： 英文的 Review
chain_trans = LLMChain(llm=llm, prompt=first_prompt, output_key="content_zh")

second_prompt = PromptTemplate.from_template(
    "一句话总结下面的内容:"
    "\n\n{content_zh}"
)

chain_summary = LLMChain(llm=llm, prompt=second_prompt)
overall_simple_chain = SimpleSequentialChain(chains=[chain_trans, chain_summary],verbose=True)
content = '''In a blog post authored back in 2011, Marc Andreessen warned that, “Software is eating the world.” Over a decade later, we are witnessing the emergence of a new type of technology that’s consuming the world with even greater voracity: generative artificial intelligence (AI). This innovative AI includes a unique class of large language models (LLM), derived from a decade of groundbreaking research, that are capable of out-performing humans at certain tasks. And you don’t have to have a PhD in machine learning to build with LLMs—developers are already building software with LLMs with basic HTTP requests and natural language prompts.
In this article, we’ll tell the story of GitHub’s work with LLMs to help other developers learn how to best make use of this technology. This post consists of two main sections: the first will describe at a high level how LLMs function and how to build LLM-based applications. The second will dig into an important example of an LLM-based application: GitHub Copilot code completions.
Others have done an impressive job of cataloging our work from the outside. Now, we’re excited to share some of the thought processes that have led to the ongoing success of GitHub Copilot.
'''
result = overall_simple_chain.run(content)
print(f'result={result}')
```

输出：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/0f3d4c7319e34562bc93d835de3ccb60~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456373.awebp)

### 2.3.3 Router Chain

RouterChain是根据输入动态的选择下一个链，每条链处理特定类型的输入。

RouterChain由两个组件组成：

1）路由器链本身，负责选择要调用的下一个链，主要有2种RouterChain，其中LLMRouterChain通过LLM进行路由决策，EmbeddingRouterChain 通过向量搜索的方式进行路由决策。

2）目标链列表，路由器链可以路由到的子链。

初始化RouterChain以及destination_chains完成后，通过MultiPromptChain将两者结合起来使用。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/b6cf264543f04fbd9a6c6cfa72209ca3~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456432.awebp)

### 2.3.4 Documents Chain

下面的4种Chain主要用于Document的处理，在基于文档生成摘要、基于文档的问答等场景中经常会用到，在后续的落地实践里也会有所体现。

#### 2.3.4.1 Stuff

StuffDocumentsChain这种链最简单直接，是将所有获取到的文档作为context放入到Prompt中，传递到LLM获取答案。

这种方式可以完整的保留上下文，调用LLM的次数也比较少，建议能使用stuff的就使用这种方式。其适合文档拆分的比较小，一次获取文档比较少的场景，不然容易超过token的限制。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/6fc81fbe79e845f483170bea049bdc91~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456471.awebp)

#### 2.3.4.2 Refine

RefineDocumentsChain是通过迭代更新的方式获取答案。先处理第一个文档，作为context传递给llm，获取中间结果intermediate answer。然后将第一个文档的中间结果以及第二个文档发给llm进行处理，后续的文档类似处理。

Refine这种方式能部分保留上下文，以及token的使用能控制在一定范围。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/6576772150aa4abab9277979132505a3~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456510.awebp)

#### 2.3.4.3 MapReduce

MapReduceDocumentsChain先通过LLM对每个document进行处理，然后将所有文档的答案在通过LLM进行合并处理，得到最终的结果。

MapReduce的方式将每个document单独处理，可以并发进行调用。但是每个文档之间缺少上下文。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/bc119fe26b3247ceb0ee6669754209ad~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456551.awebp)

#### 2.3.4.4 MapRerank

MapRerankDocumentsChain和MapReduceDocumentsChain类似，先通过LLM对每个document进行处理，每个答案都会返回一个score，最后选择score最高的答案。

MapRerank和MapReduce类似，会大批量的调用LLM，每个document之间是独立处理。

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/f21131dfaf374bb4b0da34fc9f21b969~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456601.awebp)

## 2.4 Memory

正常情况下Chain无状态的，每次交互都是独立的，无法知道之前历史交互的信息。LangChain使用Memory组件保存和管理历史消息，这样可以跨多轮进行对话，在当前会话中保留历史会话的上下文。Memory组件支持多种存储介质，可以与Monogo、Redis、SQLite等进行集成，以及简单直接形式就是Buffer Memory。常用的Buffer Memory有

1）ConversationSummaryMemory ：以摘要的信息保存记录

2）ConversationBufferWindowMemory：以原始形式保存最新的n条记录

3）ConversationBufferMemory：以原始形式保存所有记录

通过查看chain的prompt，可以发现history变量传递了从memory获取的会话上下文。下面的示例演示了Memory的使用方式，可以很明细看到，答案是从之前的问题里获取的。

```python

from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory

from azure_chat_llm import llm

memory = ConversationBufferMemory()
conversation = ConversationChain(llm=llm, memory=memory, verbose=True)
print(conversation.prompt)
print(conversation.predict(input="我的姓名是tiger"))
print(conversation.predict(input="1+1=?"))
print(conversation.predict(input="我的姓名是什么"))
```

输出：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/492a024e0e1d49b09242b17c914865fe~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456636.awebp)

## 2.5 Agent

Agent字面含义就是代理，如果说LLM是大脑，Agent就是代理大脑使用工具Tools。目前的大模型一般都存在知识过时、逻辑计算能力低等问题，通过Agent访问工具，可以去解决这些问题。目前这个领域特别活跃，诞生了类似AutoGPT、BabyAGI、AgentGPT等一堆优秀的项目。传统使用LLM，需要给定Prompt一步一步的达成目标，通过Agent是给定目标，其会自动规划并达到目标。

### 2.5.1 Agent核心组件

Agent：代理，负责调用LLM以及决定下一步的Action。其中LLM的prompt必须包含agent_scratchpad变量，记录执行的中间过程

Tools：工具，Agent可以调用的方法。LangChain已有很多内置的工具，也可以自定义工具。注意Tools的description属性，LLM会通过描述决定是否使用该工具。

ToolKits：工具集，为特定目的的工具集合。类似Office365、Gmail工具集等

Agent Executor：Agent执行器，负责进行实际的执行。

### 2.5.2 Agent的类型

一般通过initialize_agent函数进行Agent的初始化，除了llm、tools等参数，还需要指定AgentType。

```ini
ini
agent = initialize_agent(agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
                tools=tools,
                llm=llm,
                verbose=True)
print(agent.agent.llm_chain.prompt.template)
```

该Agent为一个zero-shot-react-description类型的Agent，其中zero-shot表明只考虑当前的操作，不会记录以及参考之前的操作。react表明通过ReAct框架进行推理，description表明通过工具的description进行是否使用的决策。

其他的类型还有chat-conversational-react-description、conversational-react-description、react-docstore、self-ask-with-search等，类似chat-conversational-react-description通过memory记录之前的对话，应答会参考之前的操作。

可以通过agent.agent.llm_chain.prompt.template方法，获取其推理决策所使用的模板。

### 2.5.3 自定义Tool

有多种方式可以自定义Tool，最简单的方式是通过@tool装饰器，将一个函数转为Tool。注意函数必须得有docString，其为Tool的描述。

```python
python
from azure_chat_llm import llm
from langchain.agents import load_tools, initialize_agent, tool
from langchain.agents.agent_types import AgentType
from datetime import date

@tool
def time(text: str) -> str:
    """
    返回今天的日期。
    """
    return str(date.today())


tools = load_tools(['llm-math'], llm=llm)
tools.append(time)
agent_math = initialize_agent(agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
                                   tools=tools,
                                   llm=llm,
                                   verbose=True)
print(agent_math("计算45 * 54"))
print(agent_math("今天是哪天？"))
```

输出为：

![img](https://heguang-tech-1300607181.cos.ap-shanghai.myqcloud.com/uPic/3213016eb62d4ab9992fbde8bd516d42~tplv-k3u1fbpfcp-zoom-in-crop-mark:1512:0:0:0-20240229172456682.awebp)

# 3、LangChain落地实践

## 3.1 文档生成总结

1）通过Loader加载远程文档

2）通过Splitter基于Token进行文档拆分

3）加载summarize链，链类型为refine，迭代进行总结

```ini
ini
from langchain.prompts import PromptTemplate
from langchain.document_loaders import PlaywrightURLLoader
from langchain.chains.summarize import load_summarize_chain
from langchain.text_splitter import RecursiveCharacterTextSplitter
from azure_chat_llm import llm

loader = PlaywrightURLLoader(urls=["https://content.jr.jd.com/article/index.html?pageId=708258989"])
data = loader.load()

text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="gpt-3.5-turbo",
    allowed_special="all",
    separators=["\n\n", "\n", "。", "，"],
    chunk_size=7000,
    chunk_overlap=0
)

prompt_template = '''
作为一个资深编辑，请针对 >>> 和 <<< 中间的文本写一段摘要。 
>>> {text} <<<
'''
refine_template = '''
作为一个资深编辑，基于已有的一段摘要：{existing_answer}，针对 >>> 和 <<< 中间的文本完善现有的摘要。 
>>> {text} <<<
'''

PROMPT = PromptTemplate(template=prompt_template, input_variables=["text"])
REFINE_PROMPT = PromptTemplate(
    template=refine_template, input_variables=["existing_answer", "text"]
)

chain = load_summarize_chain(llm, chain_type="refine", question_prompt=PROMPT, refine_prompt=REFINE_PROMPT, verbose=False)

docs = text_splitter.split_documents(data)
result = chain.run(docs)
print(result)
```

### 3.2 基于外部文档的问答

1）通过Loader加载远程文档

2）通过Splitter基于Token进行文档拆分

3）通过FAISS向量存储文档，embedding加载HuggingFace的text2vec-base-chinese模型

4）自定义QA的prompt，通过RetrievalQA回答相关的问题

```ini
ini
from langchain.chains import RetrievalQA
from langchain.document_loaders import WebBaseLoader
from langchain.embeddings.huggingface import HuggingFaceEmbeddings
from langchain.prompts import PromptTemplate
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS

from azure_chat_llm import llm

loader = WebBaseLoader("https://in.m.jd.com/help/app/register_info.html")
data = loader.load()
text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="gpt-3.5-turbo",
    allowed_special="all",
    separators=["\n\n", "\n", "。", "，"],
    chunk_size=800,
    chunk_overlap=0
)
docs = text_splitter.split_documents(data)
#设置自己的模型路径
embeddings = HuggingFaceEmbeddings(model_name="text2vec-base-chinese", cache_folder="model")
vectorstore = FAISS.from_documents(docs, embeddings)

template = """请使用下面提供的背景信息来回答最后的问题。 如果你不知道答案，请直接说不知道，不要试图凭空编造答案。
回答时最多使用三个句子，保持回答尽可能简洁。 回答结束时，请一定要说"谢谢你的提问！"
{context}
问题: {question}
有用的回答:"""
QA_CHAIN_PROMPT = PromptTemplate(input_variables=["context", "question"], template=template)

qa_chain = RetrievalQA.from_chain_type(llm, retriever=vectorstore.as_retriever(),
                                       return_source_documents=True,
                                       chain_type_kwargs={"prompt": QA_CHAIN_PROMPT})

result = qa_chain({"query": "用户注册资格"})
print(result["result"])
print(len(result['source_documents']))
```

# 4、未来发展方向

随着大模型的发展，LangChain应该是目前最火的LLM开发框架，能和外部数据源交互、能集成各种常用的组件等等，大大降低了LLM应用开发的门槛。其创始人Harrison Chase也和Andrew Ng联合开发了2门短课程，帮忙大家快速掌握LangChain的使用。

目前大模型的迭代升级特别快，作为一个框架，LangChain也得保持特别快的迭代速度。其开发特别拼，每天都会提交大量的commit，基本隔几天就会发布一个新版本，其Contributor也达到了1200多人，特别活跃。

个人认为，除了和业务结合落地LLM应用外，还有2个大的方向可以进一步去探索：

1）通过低代码的形式进一步降低LLM应用的开发门槛。类似langflow这样的可视化编排工具发展也很快

2）打造更加强大的Agent。Agent之于大模型，个人觉得类似SQL之于DB，能大幅度提升LLM的应用场景

# 5、参考资料

1、[python.langchain.com/docs/get_st…](https://link.juejin.cn?target=https%3A%2F%2Fpython.langchain.com%2Fdocs%2Fget_started%2Fintroduction.html)

2、[github.com/liaokongVFX…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FliaokongVFX%2FLangChain-Chinese-Getting-Started-Guide)

3、[www.deeplearning.ai/short-cours…](https://link.juejin.cn?target=https%3A%2F%2Fwww.deeplearning.ai%2Fshort-courses%2Flangchain-for-llm-application-development%2F)

4、[lilianweng.github.io/posts/2023-…](https://link.juejin.cn?target=https%3A%2F%2Flilianweng.github.io%2Fposts%2F2023-06-23-agent%2F)

5、[mp.weixin.qq.com/s/3coFhAdzr…](https://link.juejin.cn?target=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2F3coFhAdzr40tozn8f9Dc-w)

6、[github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain)