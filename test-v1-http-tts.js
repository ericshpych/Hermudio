// V1 HTTP 非流式接口测试
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const APPID = '8943446477';

// 测试不同的 voice_type
const TEST_VOICES = [
  'zh_male_yunzhou_jupiter_bigtts',
  'zh_female_vv_jupiter_bigtts',
  'zh_female_xiaohe_jupiter_bigtts',
  'zh_male_xiaotian_jupiter_bigtts',
  'ICL_zh_male_qinglen_v1_tob',
  'ICL_zh_female_chengshu_v1_tob',
];

async function testV1Http(voiceType) {
  const url = 'https://openspeech.bytedance.com/api/v1/tts';
  
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
      text: '你好，欢迎使用火山引擎语音合成服务',
      text_type: 'plain',
      operation: 'query'
    }
  };
  
  console.log(`\n=== Testing voiceType=${voiceType} ===`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
    
    if (data.data && data.data.audio) {
      console.log('✅ SUCCESS! Audio data received:', data.data.audio.length, 'bytes');
      const fs = require('fs');
      fs.writeFileSync(`test-v1-${voiceType}.mp3`, Buffer.from(data.data.audio, 'base64'));
      return true;
    } else if (data.header && data.header.code !== 0) {
      console.log('❌ Error:', data.header.message);
      return false;
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
  for (const voiceType of TEST_VOICES) {
    const success = await testV1Http(voiceType);
    if (success) {
      console.log('\n🎉 Found working voice type!');
      console.log(`Voice Type: ${voiceType}`);
      break;
    }
    // 等待1秒再试下一个
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n=== Test complete ===');
}

runTests();
