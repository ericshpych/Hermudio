const WebSocket = require('ws');
const fs = require('fs');

// 测试 WebSocket TTS - 使用 header 认证
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const RESOURCE_ID = 'seed-tts-2.0';
const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream';

console.log('Connecting to:', WS_URL);

const ws = new WebSocket(WS_URL, {
  headers: {
    'X-Api-Key': API_KEY,
    'X-Api-Resource-Id': RESOURCE_ID
  }
});

let audioChunks = [];
let isComplete = false;

ws.on('open', () => {
  console.log('WebSocket connected!');
  
  // 发送 TTS 请求
  const request = {
    req_params: {
      text: '你好，欢迎使用火山引擎语音合成服务',
      speaker: 'zh_female_wanqudashu_moon_bigtts',
      audio_params: {
        format: 'pcm',
        sample_rate: 24000
      }
    }
  };
  
  console.log('Sending request:', JSON.stringify(request, null, 2));
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  if (Buffer.isBuffer(data)) {
    // 二进制音频数据
    console.log('Audio chunk received, length:', data.length);
    audioChunks.push(data);
  } else {
    // JSON 控制消息
    try {
      const json = JSON.parse(data.toString());
      console.log('JSON message:', JSON.stringify(json, null, 2));
      
      if (json.header && json.header.code === 0) {
        console.log('TTS started successfully');
      }
      if (json.header && json.header.message === 'success') {
        console.log('TTS completed');
        isComplete = true;
      }
    } catch (e) {
      console.log('Text message:', data.toString().substring(0, 200));
    }
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason?.toString());
  
  // 保存音频数据
  if (audioChunks.length > 0) {
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioData = Buffer.concat(audioChunks, totalLength);
    fs.writeFileSync('test-output.pcm', audioData);
    console.log(`Saved ${totalLength} bytes to test-output.pcm`);
  }
  
  process.exit(0);
});

// 10秒后关闭
setTimeout(() => {
  console.log('Timeout, closing...');
  ws.close();
}, 10000);
