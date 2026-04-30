// V3 HTTP Chunked 流式接口测试
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const APPID = '8943446477';

async function testChunked() {
  const url = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  
  const resourceId = 'seed-tts-2.0';
  const voiceType = 'saturn_zh_female_cancan_tob';
  
  const requestBody = {
    app: {
      appid: APPID,
      token: 'fake_token',
      cluster: 'volcano_tts'
    },
    user: {
      uid: 'test_user'
    },
    audio: {
      voice_type: voiceType,
      encoding: 'mp3',
      speed_ratio: 1.0
    },
    request: {
      reqid: 'test-req-' + Date.now(),
      text: '你好，我是灿灿。',
      text_type: 'plain'
    }
  };
  
  console.log('Testing V3 HTTP Chunked with:');
  console.log('  Resource ID:', resourceId);
  console.log('  Voice Type:', voiceType);
  console.log('');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'X-Api-Resource-Id': resourceId,
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status);
    
    const data = await response.text();
    console.log('Response data (first 500 chars):');
    console.log(data.substring(0, 500));
    
    // 尝试解析 JSON Lines
    const lines = data.split('\n').filter(line => line.trim());
    let audioData = '';
    
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.code !== undefined && json.code !== 0) {
          console.log('Error:', json.message);
        }
        if (json.data && json.data.audio) {
          audioData += json.data.audio;
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    
    if (audioData.length > 0) {
      console.log('');
      console.log('✅ SUCCESS! Audio data received:', audioData.length, 'bytes');
      const fs = require('fs');
      fs.writeFileSync('test-chunked-cancan.mp3', Buffer.from(audioData, 'base64'));
      console.log('Saved to: test-chunked-cancan.mp3');
    } else {
      console.log('❌ No audio data received');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testChunked();
