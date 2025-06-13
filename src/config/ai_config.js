/**
 * AI 助教配置
 */
module.exports = {
    // OpenAI API 密鑰
    apiKey: process.env.OPENAI_API_KEY,

    // 模型配置
    modelConfig: {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3,
        timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
    }
}; 