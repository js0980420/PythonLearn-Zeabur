/**
 * AI 助教配置
 */
const config = require('./env');

module.exports = {
    // OpenAI API 密鑰
    apiKey: config.openai.apiKey,

    // 模型配置
    modelConfig: {
        model: config.openai.model,
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
        timeout: config.openai.timeout
    }
}; 