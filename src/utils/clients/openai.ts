import OpenAI from 'openai'

export const openAIClient = (apiKey: string) => new OpenAI({ apiKey })
