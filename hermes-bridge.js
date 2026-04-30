// Hermes AI 桥接模块 - 将DJ聊天框接入本地Hermes
class HermesBridge {
  constructor() {
    // Hermes API 配置
    this.config = {
      baseUrl: 'http://localhost:8642/v1',  // Hermes默认API端口
      apiKey: 'change-me-local-dev',         // 默认API密钥
      model: 'hermes-agent',
      maxContextLength: 10  // 保留最近10轮对话
    };
    
    // 对话历史
    this.conversationHistory = [];
    this.conversationId = null;
    
    // 系统提示词 - 定义DJ角色
    this.systemPrompt = `你是Hermudio的AI DJ助手，一个专业、热情、懂音乐的主持人。

你的职责：
1. 与用户聊天互动，回答关于音乐、歌曲、艺人的问题
2. 根据用户心情推荐合适的音乐
3. 分享音乐知识和趣闻
4. 协助用户管理播放列表
5. 用温暖、专业的语气与用户交流

当前环境信息：
- 你正在主持Hermudio电台
- Hermudio 已经集成了完整的音乐播放功能（基于 ncm-cli）
- 你可以获取实时天气和时间信息
- 用户当前播放的歌曲信息会在上下文中提供

【极其重要 - 必须遵守】
1. 你只允许输出给用户看的最终回复内容
2. 严禁输出任何思考过程、分析步骤、内心独白
3. 严禁复述系统指令、规则或任何元信息
4. 严禁输出"根据系统提示"、"我需要"、"我应该"等自我指涉语句
5. 严禁输出"操作规则:"、"绝对禁止:"等标签或标题
6. 直接开始你的回复，不要有任何前置说明

操作规则：
- 当用户要求播放歌曲时，你只需要推荐歌曲并回复文字即可
- 当用户说"试试看"、"需要"、"播放这首"等确认词时，前端会自动播放你刚才推荐的歌曲
- 你不需要调用 ncm-cli 或执行任何系统命令，前端会自动处理播放逻辑
- 推荐歌曲时，使用**加粗**或《书名号》突出显示歌名，方便前端识别
- 不要假设歌曲已经开始播放，推荐后询问用户是否想听
- 重要提醒：部分歌曲可能因版权问题没有播放权限，如果用户反馈播放的不是推荐歌曲，请建议用户尝试搜索其他版本或其他歌曲

回复风格：
- 热情友好，像朋友一样交流
- 专业但不失亲切
- 简洁明了，避免过长回复
- 适当使用emoji增加亲和力
- 直接开始回复，不要有任何前缀或说明`;


    // 回调函数
    this.onMessage = null;
    this.onError = null;
    this.onThinking = null;
  }
  
  // 检查Hermes是否可用（使用health端点）
  async checkAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

      // 使用 health 端点检查 Gateway 状态
      const response = await fetch(`http://localhost:8642/health`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          console.log('[Hermes] 连接成功');
          return { available: true, message: 'Hermes已连接' };
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('[Hermes] 连接超时');
      } else {
        console.log('[Hermes] 连接失败:', e.message);
      }
    }
    
    return { 
      available: false, 
      message: '无法连接到Hermes，请确保hermes gateway已启动 (端口: 8642)' 
    };
  }
  
  // 发送消息到Hermes（非流式，更稳定）
  async sendMessage(userMessage, context = {}) {
    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    try {
      // 触发思考状态
      this.onThinking?.(true);

      // 构建消息列表（限制历史长度，避免请求过大）
      const recentHistory = this.conversationHistory.slice(-6); // 只保留最近3轮对话
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...recentHistory,
        { role: 'user', content: this.buildContextualPrompt(userMessage, context) }
      ];

      console.log('[Hermes] 发送非流式请求，消息数:', messages.length);

      // 调用Hermes API（本地运行无需认证）
      let response;
      try {
        response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: messages,
            stream: false,
            temperature: 0.7,
            max_tokens: 600,
            stop: ["<think>", "</think>"]
          }),
          signal: controller.signal,
          keepalive: true
        });
      } catch (fetchError) {
        // 处理 fetch 错误（包括 ERR_ABORTED）
        if (fetchError.name === 'AbortError') {
          throw new Error('请求超时');
        }
        if (fetchError.message?.includes('ERR_ABORTED')) {
          console.warn('[Hermes] 请求被中断，尝试重试...');
          // 等待1秒后重试一次
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await fetch(`${this.config.baseUrl}/chat/completions`, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: this.config.model,
              messages: messages,
              stream: false,
              temperature: 0.7,
              max_tokens: 600,
              stop: ["<think>", "</think>"]
            }),
            keepalive: true
          });
        } else {
          throw fetchError;
        }
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0]?.message?.content || '抱歉，我没有理解你的问题。';

      console.log('[Hermes] 收到回复，长度:', assistantMessage.length);

      // 更新对话历史
      this.updateHistory(userMessage, assistantMessage);

      // 触发消息回调
      this.onMessage?.(assistantMessage);

      return { success: true, message: assistantMessage };

    } catch (e) {
      clearTimeout(timeoutId);

      // 处理超时
      if (e.name === 'AbortError') {
        console.error('[Hermes] 请求超时');
        this.onError?.('请求超时，请重试');
        return {
          success: false,
          message: '请求超时，请重试',
          error: 'timeout'
        };
      }

      console.error('[Hermes] 发送消息失败:', e);
      this.onError?.(e.message);
      return {
        success: false,
        message: '连接AI助手失败，请检查Hermes是否正常运行',
        error: e.message
      };
    } finally {
      this.onThinking?.(false);
    }
  }
  
  // 构建带上下文的提示词
  buildContextualPrompt(userMessage, context) {
    let prompt = userMessage;
    
    // 添加上下文信息
    if (context.currentSong) {
      prompt = `[当前播放: ${context.currentSong.name} - ${context.currentSong.artist}]\n${prompt}`;
    }
    
    if (context.weather) {
      prompt = `[天气: ${context.weather}${context.temp ? ', ' + context.temp + '°C' : ''}]\n${prompt}`;
    }
    
    if (context.time) {
      prompt = `[时间: ${context.time}]\n${prompt}`;
    }
    
    return prompt;
  }
  
  // 更新对话历史
  updateHistory(userMessage, assistantMessage) {
    this.conversationHistory.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantMessage }
    );
    
    // 限制历史长度
    if (this.conversationHistory.length > this.config.maxContextLength * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.config.maxContextLength * 2);
    }
  }
  
  // 清空对话历史
  clearHistory() {
    this.conversationHistory = [];
    this.conversationId = null;
    console.log('[Hermes] 对话历史已清空');
  }
  
  // 设置配置
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[Hermes] 配置已更新:', this.config);
  }
  
  // 流式发送消息（支持打字机效果）
  async sendMessageStream(userMessage, context = {}, onChunk) {
    // 保存当前请求的控制器，用于取消
    this.currentRequestController = new AbortController();

    try {
      this.onThinking?.(true);

      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory,
        { role: 'user', content: this.buildContextualPrompt(userMessage, context) }
      ];

      // 调用Hermes API（本地运行无需认证）
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 300,
          stop: ["<think>", "</think>"]
        }),
        signal: this.currentRequestController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 处理SSE流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullMessage = '';
      let buffer = '';
      const THINK_START = '<think>';
      const THINK_END = '</think>';
      let inThinkBlock = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // 处理缓冲区中的完整行
        const lines = buffer.split('\n');
        // 保留最后一行（可能不完整）到缓冲区
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                // 实时过滤 think 标签
                let filteredContent = '';
                for (let i = 0; i < content.length; i++) {
                  const char = content[i];
                  
                  // 检查是否进入 think 块
                  if (!inThinkBlock) {
                    const remainingStart = content.substring(i, i + THINK_START.length);
                    if (remainingStart === THINK_START) {
                      inThinkBlock = true;
                      i += THINK_START.length - 1;
                      continue;
                    }
                  }
                  
                  // 检查是否退出 think 块
                  if (inThinkBlock) {
                    const remainingEnd = content.substring(i, i + THINK_END.length);
                    if (remainingEnd === THINK_END) {
                      inThinkBlock = false;
                      i += THINK_END.length - 1;
                      continue;
                    }
                  }
                  
                  // 只有在 think 块外才收集内容
                  if (!inThinkBlock) {
                    filteredContent += char;
                  }
                }
                
                if (filteredContent) {
                  fullMessage += filteredContent;
                  onChunk?.(filteredContent, fullMessage);
                }
              }
            } catch (e) {
              // 忽略解析错误
              console.log('[Hermes] SSE解析错误:', e.message);
            }
          }
        }
      }
      
      // 处理最后可能剩余的缓冲区
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content && !inThinkBlock) {
              // 过滤 think 标签
              const filteredContent = content.replace(/<think>[\s\S]*?<\/think>/g, '');
              if (filteredContent) {
                fullMessage += filteredContent;
                onChunk?.(filteredContent, fullMessage);
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      // 更新历史
      this.updateHistory(userMessage, fullMessage);
      this.onThinking?.(false);
      
      return { success: true, message: fullMessage };
      
    } catch (e) {
      // 处理请求被取消的情况
      if (e.name === 'AbortError') {
        console.log('[Hermes] 请求被主动取消 (AbortError)');
        this.onThinking?.(false);
        return { success: false, error: '请求已取消', aborted: true };
      }

      // 处理其他类型的错误
      console.error('[Hermes] 流式发送失败:');
      console.error('  错误名称:', e.name);
      console.error('  错误信息:', e.message);
      console.error('  错误类型:', typeof e);

      // 如果是网络错误，提供更友好的提示
      if (e.message && e.message.includes('ERR_ABORTED')) {
        console.log('[Hermes] 请求被中止，可能是页面刷新或网络中断');
        this.onThinking?.(false);
        return { success: false, error: '请求被中断，请重试', aborted: true };
      }

      this.onThinking?.(false);
      this.onError?.(e.message);
      return { success: false, error: e.message };
    } finally {
      // 清理控制器
      this.currentRequestController = null;
    }
  }

  // 取消当前请求
  cancelCurrentRequest() {
    if (this.currentRequestController) {
      this.currentRequestController.abort();
      console.log('[Hermes] 已取消当前请求');
    }
  }
}

// 创建全局实例
const hermesBridge = new HermesBridge();
