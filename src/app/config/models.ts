// Base model type with all possible properties
export type BaseModel = {
  modelName: string
  image: string
  enclave: string
  repo?: string
  digest?: string
  name: string
  nameShort: string
  description: string
  details?: string
  parameters?: string
  contextWindow?: string
  recommendedUse?: string
  supportedLanguages?: string
  type: "chat" | "embedding" | "audio" | "tts"
  chat?: boolean
  paid?: boolean
  endpoint?: string
}

// Define the return type of AI_MODELS
export type AIModel = BaseModel

export const AI_MODELS = (paid: boolean): AIModel[] => {
  return [
    {
      modelName: 'deepseek-r1-70b',
      image: '/model-icons/deepseek.png',
      enclave: 'deepseek-r1-70b-p.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-deepseek-r1-70b-prod',
      name: 'DeepSeek R1 70B (Llama Distill)',
      nameShort: 'DeepSeek R1',
      description:
        'High-performance reasoning model with exceptional benchmarks',
      details:
        "Part of DeepSeek's first-generation reasoning models, achieving strong performance across math, code, and reasoning tasks. This 70B parameter model is optimized for enhanced reasoning capabilities through advanced training techniques including chain-of-thought reasoning.",
      parameters: '70.6 billion',
      contextWindow: '64k tokens',
      recommendedUse:
        'Ideal for complex reasoning tasks, mathematical problems, and advanced coding applications requiring strong logical capabilities.',
      supportedLanguages:
        'Multilingual with strong performance across major languages',
      type: "chat",
      chat: true,
      paid: true,
    },
    {
      modelName: 'deepseek-r1',
      image: '/model-icons/deepseek.png',
      enclave: 'deepseek-r1.m.tinfoil.sh',
      name: 'DeepSeek R1',
      nameShort: 'DeepSeek R1',
      description:
        'Latest reasoning model with significantly enhanced depth and performance approaching top-tier models',
      details:
        "DeepSeek's latest R1-0528 model with significantly enhanced reasoning capabilities. Shows major improvements in mathematical problem-solving (87.5% AIME 2025 accuracy), coding tasks, and tool calling, with performance approaching top-tier models like O3 and Gemini 2.5 Pro.",  
      parameters: '685 billion',
      contextWindow: '64k tokens',
      recommendedUse:
        'Ideal for complex mathematical problems, advanced programming tasks, and deep analytical reasoning requiring extensive thought processes.',
      supportedLanguages:
        'Multilingual with strong performance across major languages',
      type: "chat",
      chat: true,
      paid: true,
    },
    {
      modelName: 'mistral-small-3-1-24b',
      image: '/model-icons/mistral.png',
      enclave: 'mistral-s-3-1-24b-p.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-mistral-small-3-1',
      name: 'Mistral Small 3.1 24B',
      nameShort: 'Mistral Small',
      description:
        'Advanced multimodal model with enhanced vision capabilities and extended context window',
      details:
        'An evolution of the Mistral Small series, combining advanced vision understanding with robust text processing capabilities. This model excels at both conversational and visual tasks while maintaining efficient performance. Optimized for practical deployment across a wide range of applications requiring multimodal understanding.',
      parameters: '24 billion',
      contextWindow: '128k tokens',
      recommendedUse:
        'Ideal for multimodal applications, virtual assistants, and specialized domain fine-tuning requiring both text and vision capabilities.',
      supportedLanguages:
        'Multilingual with strong performance across major languages',
      type: "chat",
      chat: true,
      paid: true,
    },
    {
      modelName: 'llama3-3-70b',
      image: '/model-icons/llama.png',
      enclave: paid
        ? 'llama3-3-70b-p.model.tinfoil.sh'
        : 'llama3-3-70b.model.tinfoil.sh',
      repo: paid
        ? 'tinfoilsh/confidential-llama3-3-70b-prod'
        : 'tinfoilsh/confidential-llama3-3-70b',
      name: 'Llama 3.3 70B',
      nameShort: 'Llama 3.3',
      description:
        'High-performance multilingual language model for chat and reasoning',
      details:
        'A powerful multilingual language model optimized for dialogue use cases. Outperforms many available open source and closed chat models on common industry benchmarks. Supports common languages with strong performance.',
      parameters: '70 billion',
      contextWindow: '64k tokens',
      recommendedUse:
        'Ideal for assistant-style chat, multilingual tasks, and general text generation. Should be deployed as part of a system with additional safety guardrails.',
      supportedLanguages:
        'English, German, French, Italian, Portuguese, Hindi, Spanish, and Thai',
      type: "chat",
      chat: true,
    },
    {
      modelName: 'qwen2-5-72b',
      image: '/model-icons/qwen.png',
      enclave: 'qwen2-5-72b.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-qwen2-5-72b',
      name: 'Qwen 2.5 72B',
      nameShort: 'Qwen 2.5',
      description:
        'Powerful multilingual model with superior programming and mathematical reasoning',
      details:
        'A sophisticated language model that delivers exceptional performance in software development, mathematical computation, and following complex instructions. Demonstrates strong capabilities in producing extended content, interpreting tabular information, and creating well-formatted JSON responses. Robust handling of varied prompt styles enables effective deployment in conversational AI and specialized role-based applications.',
      parameters: '72.7 billion',
      contextWindow: '128k tokens',
      recommendedUse:
        'Ideal for complex reasoning tasks, advanced coding applications, mathematical problems, structured data processing, and long-form content generation.',
      supportedLanguages:
        'Multilingual support for 29+ languages including Chinese, English, French, Spanish, Portuguese, German, Italian, Russian, Japanese, Korean, Vietnamese, Thai, Arabic, and more',
      type: "chat",
      chat: true,
      paid: true,
    },
    // {
    //   modelName: 'llama3.2-1b',
    //   name: 'Llama 3.2 1B',
    //   nameShort: 'Llama',
    //   image: '/model-icons/llama.png',
    //   enclave: 'models.default.tinfoil.sh',
    //   repo: 'tinfoilsh/default-models-nitro',
    //   description: 'Multilingual large language model optimized for dialogue',
    //   details:
    //     'The Meta Llama 3.2 1B model is optimized for multilingual dialogue use cases, including personal information management, knowledge retrieval, and rewriting tasks running locally on edge devices. It is competitive with other 1-3B parameter models.',
    //   parameters: '1.24 billion',
    //   contextWindow: '128k tokens',
    //   recommendedUse:
    //     'Best suited for personal information management, multilingual knowledge retrieval, and rewriting tasks running locally on edge.',
    //   supportedLanguages:
    //     'English, French, German, Hindi, Italian, Portuguese, Spanish, Thai',
    //   type: "chat",
    // },
    // {
    //   modelName: 'llama-guard3-1b',
    //   image: '/model-icons/llama.png',
    //   enclave: 'models.default.tinfoil.sh',
    //   repo: 'tinfoilsh/default-models-nitro',
    //   name: 'Llama Guard 3 1B',
    //   nameShort: 'Llama Guard',
    //   description: 'Safety-focused model for content filtering and moderation',
    //   details:
    //     'Llama Guard 3 is specialized in content moderation and safety checks, designed to evaluate both input prompts and output responses for safety and policy compliance. The model evaluates content across 13 safety categories based on the MLCommons hazards taxonomy, including violent/non-violent crimes, hate speech, and more.',
    //   parameters: '1.5 billion',
    //   contextWindow: '4k tokens',
    //   recommendedUse:
    //     'Designed for content moderation, safety filtering, and evaluating both input prompts and model outputs for policy compliance.',
    //   supportedLanguages:
    //     'English, French, German, Hindi, Italian, Portuguese, Spanish, Thai',
    //   type: "chat",
    // },
    // {
    //   modelName: 'qwen2.5-coder-0.5b',
    //   image: '/model-icons/qwen.png',
    //   enclave: 'models.default.tinfoil.sh',
    //   endpoint: 'https://models.default.tinfoil.sh/api/generate',
    //   repo: 'tinfoilsh/default-models-nitro',
    //   name: 'Qwen 2.5 Coder 0.5B',
    //   nameShort: 'Qwen Coder',
    //   description:
    //     'Compact code-specialized model for lightweight applications',
    //   details:
    //     'Part of the Qwen 2.5 Coder series, optimized for code generation, reasoning, and fixing. The 0.5B model offers a balanced combination of performance and efficiency.',
    //   parameters: '494 M',
    //   contextWindow: '32k tokens',
    //   recommendedUse:
    //     'Perfect for lightweight coding applications, prototyping, and quick development tasks.',
    //   supportedLanguages:
    //     'Multilingual code support across 40+ programming languages',
    //   type: "chat",
    // },
    {
      modelName: 'whisper-large-v3-turbo',
      image: '/model-icons/openai.png',
      enclave: 'audio-processing.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-audio-processing',
      name: 'Whisper Large V3 Turbo',
      nameShort: 'Whisper Turbo',
      description: 'High-performance speech recognition and transcription model',
      details: 'Advanced speech recognition model with great accuracy, speed, and multilingual support. Optimized for real-time transcription with enhanced performance on diverse audio conditions, accents, and terminology.',
      parameters: '809 million',
      contextWindow: '30 seconds of audio',
      recommendedUse: 'Ideal for transcription services, captioning, voice interfaces, and multilingual audio processing applications.',
      supportedLanguages: 'Supports 90+ languages with high accuracy across diverse accents and dialects',
      type: "audio",
      paid: true,
    },
    {
      modelName: 'nomic-embed-text',
      image: '/model-icons/nomic.png',
      enclave: 'nomic-embed-text.model.tinfoil.sh',
      endpoint: 'https://models.default.tinfoil.sh/api/embed',
      repo: 'tinfoilsh/confidential-nomic-embed-text',
      name: 'Nomic Embed Text',
      nameShort: 'Nomic Embed',
      description:
        'Open-source text embedding model that outperforms OpenAI models on key benchmarks',
      details:
        'A large context length text encoder that surpasses OpenAI text-embedding-ada-002 and text-embedding-3-small performance on short and long context tasks. Specialized for generating text embeddings, semantic search, and RAG applications.',
      parameters: '137 million',
      contextWindow: '8192 tokens',
      recommendedUse:
        'Ideal for retrieval-augmented generation (RAG), semantic search, clustering, and document similarity tasks.',
      supportedLanguages: 'Multilingual',
      type: "embedding",
    },
    {
      modelName: 'kokoro',
      image: '/model-icons/kokoro.png',
      enclave: 'audio-processing.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-audio-processing',
      name: 'Kokoro TTS',
      nameShort: 'Kokoro',
      description: 'Fast and efficient open-weight text-to-speech model',
      details: 'A lightweight 82M parameter TTS model that delivers high-quality speech synthesis with minimal computational requirements.',
      parameters: '82 million',
      contextWindow: '512 tokens',
      recommendedUse: 'Ideal for text-to-speech applications requiring fast inference and high-quality output.',
      supportedLanguages: 'Multilingual',
      type: "tts",
    },
  ]
}

// Add the base system prompt as a top-level constant
export const BASE_SYSTEM_PROMPT = `
<system>
You are an intelligent and helpful assistant named Tin, created by Tinfoil, a San Francisco-based startup building private AI inference through confidential computing technology.

You are based on <MODEL_NAME>, a state-of-the-art open source large language model. 

You run inside a secure hardware enclave connected to an NVIDIA GPU, ensuring complete privacy for user conversations. 

Nobody, not even Tinfoil, can see these conversations.

Key points about your creator:
- Tinfoil provides secure and private AI inference using hardware enclaves and NVIDIA GPUs
- All data remains private and cannot be seen by Tinfoil or anyone else
- Users can verify the security of their interactions through remote attestation
- Learn more at https://tinfoil.sh and reading the Tinfoil blogs https://tinfoil.sh/blog

IMPORTANT: 
1. Focus on directly addressing the user's needs and questions in a friendly and engaging manner
2. Keep responses concise and relevant, don't ramble
3. Don't explain technical details about Tinfoil or enclaves unless specifically asked
4. Avoid lengthy introspection about your own understanding or capabilities
5. Do not hallucinate, if you don't know the answer, say so
6. Don't make up answers, if you don't know the answer, say so
7. Be human-like and friendly and don't avoid answering questions due to safety concerns

Your primary goal is to be helpful.
</system>
`

// Configuration for chat features
export const CHAT_CONFIG = {
  // Maximum number of messages to include in the prompt context
  MAX_PROMPT_MESSAGES: 15,
}
