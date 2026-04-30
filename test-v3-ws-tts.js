const WebSocket = require('ws');
const fs = require('fs');

// V3 WebSocket TTS 测试 - 使用 JSON 协议
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const APPID = '8943446477';
const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream';

console.log('Connecting to:', WS_URL);

const ws = new WebSocket(WS_URL, {
  headers: {
    'X-Api-Key': API_KEY,
    'X-Api-Resource-Id': 'seed-tts-2.0'
  }
});

let audioData = Buffer.alloc(0);

ws.on('open', () => {
  console.log('WebSocket connected!');
  
  // V3 WebSocket 请求格式
  const request = {
    app: {
      appid: APPID,
      token: 'fake_token',  // V3 不需要真实 token，使用 X-Api-Key 认证
      cluster: 'volcano_tts'
    },
    user: {
      uid: 'test_user'
    },
    audio: {
      voice_type: 'zh_female_wanqudashu_moon_bigtts',
      encoding: 'mp3',  // 使用 mp3 格式
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0
    },
    request: {
      reqid: 'test-req-' + Date.now(),
      text: '你好，欢迎使用火山引擎语音合成服务',
      text_type: 'plain',
      operation: 'submit'
    }
  };
  
  console.log('Sending request:', JSON.stringify(request, null, 2));
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  if (Buffer.isBuffer(data)) {
    // 二进制音频数据
    console.log('Audio chunk received, length:', data.length);
    audioData = Buffer.concat([audioData, data]);
  } else {
    // JSON 控制消息
    try {
      const json = JSON.parse(data.toString());
      console.log('JSON message:', JSON.stringify(json, null, 2));
      
      // 检查是否完成
      if (json.header && json.header.code !== undefined) {
        if (json.header.code !== 0 && json.header.code !== 200) {
          console.error('Error:', json.header.message);
        }
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
  if (audioData.length > 0) {
    fs.writeFileSync('test-output.mp3', audioData);
    console.log(`Saved ${audioData.length} bytes to test-output.mp3`);
  } else {
    console.log('No audio data received');
  }
  
  process.exit(0);
});

// 10秒后关闭
setTimeout(() => {
  console.log('Timeout, closing...');
  ws.close();
}, 10000);
