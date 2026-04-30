// V3 HTTP SSE 流式接口测试
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const APPID = '8943446477';

// 测试不同的 resource_id 组合
const RESOURCE_IDS = ['seed-tts-2.0', 'seed-tts-1.0', 'volcano_tts'];
const VOICE_TYPE = 'saturn_zh_female_cancan_tob';

async function testSSE(resourceId) {
  const url = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
  
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
      voice_type: VOICE_TYPE,
      encoding: 'mp3',
      speed_ratio: 1.0
    },
    request: {
      reqid: 'test-req-' + Date.now(),
      text: '你好，我是灿灿。',
      text_type: 'plain'
    }
  };
  
  console.log(`\n=== Testing: resourceId=${resourceId}, voiceType=${VOICE_TYPE} ===`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'X-Api-Resource-Id': resourceId,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error:', errorText.substring(0, 200));
      return false;
    }
    
    // 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let audioData = '';
    let hasError = false;
    let errorMsg = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      
      // 解析 SSE 数据
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          try {
            const json = JSON.parse(data);
            
            if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
              console.log('Error:', json.message);
              hasError = true;
              errorMsg = json.message;
            }
            if (json.data && json.data.audio) {
              audioData += json.data.audio;
            }
          } catch (e) {
            // 忽略
          }
        }
      }
    }
    
    if (hasError) {
      return false;
    }
    
    if (audioData.length > 0) {
      console.log('✅ SUCCESS! Audio data received:', audioData.length, 'bytes');
      const fs = require('fs');
      fs.writeFileSync(`test-${resourceId}-${VOICE_TYPE}.mp3`, Buffer.from(audioData, 'base64'));
      return true;
    } else {
      console.log('❌ No audio data');
      return false;
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function runTests() {
  for (const resourceId of RESOURCE_IDS) {
    const success = await testSSE(resourceId);
    if (success) {
      console.log('\n🎉 Found working combination!');
      console.log(`Resource ID: ${resourceId}`);
      console.log(`Voice Type: ${VOICE_TYPE}`);
      break;
    }
    // 等待1秒再试下一个
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n=== Test complete ===');
}

runTests();
