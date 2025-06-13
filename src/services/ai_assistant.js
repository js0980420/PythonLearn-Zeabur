const OpenAI = require('openai');
const aiConfig = require('../config/ai_config');

class AIAssistant {
    constructor() {
        try {
            this.openai = new OpenAI({
                apiKey: aiConfig.apiKey
            });
            this.modelConfig = aiConfig.modelConfig;
            this.isAvailable = true;
            console.log('✅ AI 助教初始化成功');
        } catch (error) {
            this.isAvailable = false;
            console.error('❌ AI 助教初始化失敗:', error);
        }
    }

    async explainCode(code) {
        if (!this.isAvailable) {
            return { error: 'AI 助教未啟用' };
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.modelConfig.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一個專業的 Python 程式教師，專門幫助學生理解程式碼。請使用繁體中文回應。'
                    },
                    {
                        role: 'user',
                        content: `請解釋這段 Python 程式碼：\n\n${code}`
                    }
                ],
                max_tokens: this.modelConfig.maxTokens || 2000,
                temperature: this.modelConfig.temperature || 0.3
            });

            return {
                explanation: response.choices[0].message.content
            };
        } catch (error) {
            console.error('❌ AI 解釋程式碼失敗:', error);
            return { error: '無法解釋程式碼，請稍後再試' };
        }
    }

    async checkCode(code) {
        if (!this.isAvailable) {
            return { error: 'AI 助教未啟用' };
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.modelConfig.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一個專業的 Python 程式除錯專家，專門幫助學生找出程式碼中的問題。請使用繁體中文回應。'
                    },
                    {
                        role: 'user',
                        content: `請檢查這段 Python 程式碼中的潛在問題：\n\n${code}`
                    }
                ],
                max_tokens: this.modelConfig.maxTokens || 2000,
                temperature: this.modelConfig.temperature || 0.3
            });

            return {
                issues: response.choices[0].message.content
            };
        } catch (error) {
            console.error('❌ AI 檢查程式碼失敗:', error);
            return { error: '無法檢查程式碼，請稍後再試' };
        }
    }

    async improveCode(code) {
        if (!this.isAvailable) {
            return { error: 'AI 助教未啟用' };
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.modelConfig.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一個專業的 Python 程式優化專家，專門幫助學生改進程式碼品質。請使用繁體中文回應。'
                    },
                    {
                        role: 'user',
                        content: `請提供這段 Python 程式碼的改進建議：\n\n${code}`
                    }
                ],
                max_tokens: this.modelConfig.maxTokens || 2000,
                temperature: this.modelConfig.temperature || 0.3
            });

            return {
                suggestions: response.choices[0].message.content
            };
        } catch (error) {
            console.error('❌ AI 改進程式碼失敗:', error);
            return { error: '無法提供改進建議，請稍後再試' };
        }
    }

    async resolveConflict(code1, code2) {
        if (!this.isAvailable) {
            return { error: 'AI 助教未啟用' };
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.modelConfig.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一個專業的程式碼衝突解決專家，專門幫助學生解決協作編程時的衝突。請使用繁體中文回應。'
                    },
                    {
                        role: 'user',
                        content: `請分析這兩段程式碼的差異並提供解決建議：\n\n版本1：\n${code1}\n\n版本2：\n${code2}`
                    }
                ],
                max_tokens: this.modelConfig.maxTokens || 2000,
                temperature: this.modelConfig.temperature || 0.3
            });

            return {
                resolution: response.choices[0].message.content
            };
        } catch (error) {
            console.error('❌ AI 解決衝突失敗:', error);
            return { error: '無法解決衝突，請稍後再試' };
        }
    }
}

module.exports = new AIAssistant(); 