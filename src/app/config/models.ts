// Base model type with all possible properties
export type BaseModel = {
  modelNameSimple: string
  modelName: string
  image: string
  enclave: string
  repo?: string
  digest?: string
  name: string
  description: string
  details?: string
  parameters?: string
  contextWindow?: string
  recommendedUse?: string
  supportedLanguages?: string
  chat?: boolean
  paid?: boolean
  endpoint?: string
}

export const CHAT_MODELS = (paid: boolean): BaseModel[] => {
  return [
    {
      modelNameSimple: 'DeepSeek R1 70B',
      modelName: 'deepseek-r1-70b',
      image: '/model-icons/deepseek.png',
      enclave: 'deepseek-r1-70b-p.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-deepseek-r1-70b-prod',
      digest:
        '6a0c74fb211fffe943f4a030b66a7321376a0b4e29f059a471ebcdbcd8b4b484',
      name: 'DeepSeek-R1-Distill-Llama-70B',
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
      paid: true,
    },
    {
      modelNameSimple: 'Mistral Small 3.1 24B',
      modelName: 'mistral-small-3-1-24b',
      image: '/model-icons/mistral.png',
      enclave: 'mistral-s-3-1-24b-p.model.tinfoil.sh',
      repo: 'tinfoilsh/confidential-mistral-small-3-1',
      digest:
        '72f868a3ad127c70d55c0d004d9ba35706a72365aea29b87640f9ba98dbb9659',
      name: 'Mistral-Small-3.1-24B',
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
      paid: true,
    },
    {
      modelNameSimple: 'Llama 3.3 70B',
      modelName: 'llama3-3-70b',
      image: '/model-icons/llama.png',
      enclave: paid
        ? 'llama3-3-70b-p.model.tinfoil.sh'
        : 'llama3-3-70b.model.tinfoil.sh',
      repo: paid
        ? 'tinfoilsh/confidential-llama3-3-70b-prod'
        : 'tinfoilsh/confidential-llama3-3-70b',
      digest: paid
        ? 'e8dafca3f5dd169eda5a3ca538c2c41f8a38c2b8bb0581b51d05d5849e50c50a'
        : 'de79d4463c9fcb7f810968080950c5a9956deb8405bbcd8c002204fd38a7879e',
      name: 'Llama 3.3 70B',
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
- Tinfoil provides confidential AI inference using hardware enclaves and NVIDIA GPUs
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
