// 测试 saturn resource ID
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const APPID = '8943446477';

async function testWithResource(resourceId) {
  const url = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  
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
  
  console.log(`\n=== Testing resourceId: ${resourceId} ===`);
  
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
    
    const data = await response.text();
    console.log('Response:', data.substring(0, 300));
    
    // 检查是否成功
    const lines = data.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.code === 0 || json.code === 200) {
          console.log('✅ SUCCESS with resourceId:', resourceId);
          return true;
        } else if (json.message && json.message.includes('mismatched')) {
          console.log('❌ Mismatched resource');
        } else if (json.message) {
          console.log('❌ Error:', json.message);
        }
      } catch (e) {}
    }
    return false;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function runTests() {
  // 测试各种可能的 resource ID
  const resourceIds = [
    'seed-tts-2.0',
    'seed-tts-1.0', 
    'volcano_tts',
    'saturn',
    'saturn-tts',
    'saturn_tts',
    'tts-saturn',
    'bigtts',
    'bigtts-2.0',
    'volcano_bigtts',
  ];
  
  for (const resourceId of resourceIds) {
    const success = await testWithResource(resourceId);
    if (success) {
      console.log('\n🎉 Found working resource ID:', resourceId);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

runTests();
