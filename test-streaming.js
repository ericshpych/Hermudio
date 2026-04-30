// 测试 Hermes 流式聊天功能
// 这个脚本模拟 Hermes 的 SSE 流式响应，用于测试前端流式读取逻辑

class MockHermesServer {
  constructor() {
    this.baseUrl = 'http://localhost:8642';
  }

  // 模拟流式响应
  async mockStreamResponse(userMessage) {
    console.log('🎵 模拟 Hermes 流式响应');
    console.log('用户消息:', userMessage);
    console.log('---');

    // 模拟 SSE 格式的响应数据
    const mockChunks = [
      { choices: [{ delta: { content: '你好' } }] },
      { choices: [{ delta: { content: '！' } }] },
      { choices: [{ delta: { content: '我是' } }] },
      { choices: [{ delta: { content: '你的' } }] },
      { choices: [{ delta: { content: ' AI ' } }] },
      { choices: [{ delta: { content: 'DJ' } }] },
      { choices: [{ delta: { content: ' 助手' } }] },
      { choices: [{ delta: { content: '。' } }] },
      { choices: [{ delta: { content: '\n\n' } }] },
      { choices: [{ delta: { content: '当前播放的这首歌' } }] },
      { choices: [{ delta: { content: '很适合' } }] },
      { choices: [{ delta: { content: '现在的' } }] },
      { choices: [{ delta: { content: '天气' } }] },
      { choices: [{ delta: { content: '呢' } }] },
      { choices: [{ delta: { content: '！' } }] }
    ];

    // 模拟流式输出
    let fullMessage = '';
    for (const chunk of mockChunks) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullMessage += content;

      // 模拟网络延迟
      await this.delay(100);

      // 输出当前块
      process.stdout.write(content);
    }

    console.log('\n---');
    console.log('完整消息:', fullMessage);
    return fullMessage;
  }

  // 模拟 fetch 的流式响应
  createMockFetchResponse() {
    const mockChunks = [
      'data: {"choices":[{"delta":{"content":"你好"}}]}',
      'data: {"choices":[{"delta":{"content":"！"}}]}',
      'data: {"choices":[{"delta":{"content":"我是"}}]}',
      'data: {"choices":[{"delta":{"content":"你的"}}]}',
      'data: {"choices":[{"delta":{"content":" AI "}}]}',
      'data: {"choices":[{"delta":{"content":"DJ"}}]}',
      'data: {"choices":[{"delta":{"content":" 助手"}}]}',
      'data: {"choices":[{"delta":{"content":"。"}}]}',
      'data: {"choices":[{"delta":{"content":"\\n\\n"}}]}',
      'data: {"choices":[{"delta":{"content":"很高兴"}}]}',
      'data: {"choices":[{"delta":{"content":"为你"}}]}',
      'data: {"choices":[{"delta":{"content":"推荐"}}]}',
      'data: {"choices":[{"delta":{"content":"音乐"}}]}',
      'data: {"choices":[{"delta":{"content":"！"}}]}',
      'data: [DONE]'
    ];

    let chunkIndex = 0;
    const encoder = new TextEncoder();

    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (chunkIndex >= mockChunks.length) {
              return { done: true, value: undefined };
            }

            // 模拟网络延迟
            await new Promise(resolve => setTimeout(resolve, 150));

            const chunk = mockChunks[chunkIndex] + '\n';
            chunkIndex++;

            return {
              done: false,
              value: encoder.encode(chunk)
            };
          }
        })
      }
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 测试流式读取逻辑（与 hermes-bridge.js 相同的逻辑）
async function testStreamReading() {
  console.log('========================================');
  console.log('🧪 测试流式读取逻辑');
  console.log('========================================\n');

  const mockServer = new MockHermesServer();

  // 模拟 fetch 响应
  const response = mockServer.createMockFetchResponse();

  if (!response.ok) {
    console.error('请求失败');
    return;
  }

  console.log('📝 模拟流式输出:\n');

  // 使用与 hermes-bridge.js 相同的流式读取逻辑
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullMessage = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          if (content) {
            fullMessage += content;
            // 实时输出（模拟前端打字机效果）
            process.stdout.write(content);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  console.log('\n\n========================================');
  console.log('✅ 流式读取完成');
  console.log('========================================');
  console.log('\n完整消息:');
  console.log(fullMessage);
}

// 运行测试
testStreamReading().catch(console.error);
