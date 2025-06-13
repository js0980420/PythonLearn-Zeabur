const { Configuration, OpenAIApi } = require('openai');
const aiConfig = require('../config/ai_config');

class AIAssistant {
    constructor() {
        const configuration = new Configuration({
            apiKey: aiConfig.apiKey
        });
        this.openai = new OpenAIApi(configuration);
        this.modelConfig = aiConfig.modelConfig;
    }

    async explainCode(code) {
        try {
            const response = await this.openai.createChatCompletion({
                ...this.modelConfig,
                messages: [
                    { role: "system", content: "你是一個專業的 Python 程式教學助教。請用清晰、易懂的方式解釋程式碼。" },
                    { role: "user", content: `請解釋以下 Python 程式碼：\n\n${code}` }
                ]
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ AI 解釋程式碼失敗:', error);
            throw new Error('AI 解釋程式碼時發生錯誤');
        }
    }

    async checkErrors(code) {
        try {
            const response = await this.openai.createChatCompletion({
                ...this.modelConfig,
                messages: [
                    { role: "system", content: "你是一個專業的 Python 程式碼檢查器。請仔細檢查程式碼中的錯誤和潛在問題。" },
                    { role: "user", content: `請檢查以下 Python 程式碼的錯誤：\n\n${code}` }
                ]
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ AI 檢查錯誤失敗:', error);
            throw new Error('AI 檢查錯誤時發生錯誤');
        }
    }

    async suggestImprovements(code) {
        try {
            const response = await this.openai.createChatCompletion({
                ...this.modelConfig,
                messages: [
                    { role: "system", content: "你是一個專業的 Python 程式優化專家。請提供具體的改進建議。" },
                    { role: "user", content: `請為以下 Python 程式碼提供改進建議：\n\n${code}` }
                ]
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ AI 提供改進建議失敗:', error);
            throw new Error('AI 提供改進建議時發生錯誤');
        }
    }

    async analyzeConflict(originalCode, currentCode, incomingCode) {
        try {
            const response = await this.openai.createChatCompletion({
                ...this.modelConfig,
                messages: [
                    { role: "system", content: "你是一個專業的程式碼衝突分析專家。請協助解決程式碼合併衝突。" },
                    {
                        role: "user",
                        content: `請分析以下程式碼衝突並提供解決方案：
                        
原始程式碼：
${originalCode}

當前版本：
${currentCode}

傳入版本：
${incomingCode}`
                    }
                ]
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ AI 分析衝突失敗:', error);
            throw new Error('AI 分析衝突時發生錯誤');
        }
    }

    async analyzeCodeExecution(code, output, error = null) {
        try {
            const response = await this.openai.createChatCompletion({
                ...this.modelConfig,
                messages: [
                    { role: "system", content: "你是一個專業的 Python 程式執行分析專家。請分析程式碼執行結果。" },
                    {
                        role: "user",
                        content: `請分析以下 Python 程式碼的執行結果：
                        
程式碼：
${code}

執行輸出：
${output}

${error ? `錯誤信息：\n${error}` : ''}`
                    }
                ]
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ AI 分析執行結果失敗:', error);
            throw new Error('AI 分析執行結果時發生錯誤');
        }
    }
}

// 創建單例實例
const aiAssistant = new AIAssistant();
module.exports = aiAssistant; 