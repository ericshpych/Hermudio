const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// 配置
const API_KEY = 'a0817ccb-eb3e-4585-ab33-cf515328a1e5';
const RESOURCE_ID = 'seed-tts-2.0';
const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

// 要合成的文本
const text = '你好，这是豆包语音合成的测试。';
const voiceType = 'zh_male_yunzhou_jupiter_bigtts';

console.log('🎙️ 测试豆包语音 WebSocket TTS');
console.log('文本:', text);
console.log('音色:', voiceType);
console.log('');

// 建立 WebSocket 连接
const ws = new WebSocket(WS_URL, {
  headers: {
    'X-Api-Key': API_KEY,
    'X-Api-Resource-Id': RESOURCE_ID
  }
});

let audioData = '';
let sessionId = uuidv4();

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功');
  
  // 发送 start_connection
  const startConnection = {
    header: {
      appid: '8943446477',
      uid: 'hermudio_user'
    },
    payload: {
      connect: {
        token: API_KEY,
        cluster: 'volcano_tts'
      }
    }
  };
  
  console.log('📤 发送 start_connection');
  ws.send(JSON.stringify(startConnection));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 收到消息:', JSON.stringify(message).substring(0, 200));
    
    // 处理连接成功
    if (message.header && message.header.code === 0 && message.payload && message.payload.connect) {
      console.log('✅ 连接已建立，发送 start_session');
      
      // 发送 start_session
      const startSession = {
        header: {
          appid: '8943446477',
          uid: 'hermudio_user'
        },
        payload: {
          session: {
            id: sessionId,
            text: text,
            voice_type: voiceType,
            encoding: 'mp3',
            speed_ratio: 1.0,
            volume_ratio: 1.0,
            pitch_ratio: 1.0
          }
        }
      };
      
      ws.send(JSON.stringify(startSession));
    }
    
    // 处理音频数据
    if (message.payload && message.payload.audio) {
      audioData += message.payload.audio.data || '';
      console.log('🎵 收到音频数据，当前长度:', audioData.length);
    }
    
    // 处理会话完成
    if (message.header && message.header.code === 0 && message.payload && message.payload.session) {
      if (message.payload.session.finish === true) {
        console.log('✅ 会话完成');
        
        // 发送 finish_connection
        const finishConnection = {
          header: {
            appid: '8943446477',
            uid: 'claudio_fm_user'
          },
          payload: {
            connect: {
              finish: true
            }
          }
        };
        
        ws.send(JSON.stringify(finishConnection));
        
        // 关闭连接
        setTimeout(() => {
          ws.close();
          
          if (audioData) {
            console.log('');
            console.log('✅ 语音合成成功!');
            console.log('音频数据长度:', audioData.length);
            console.log('音频数据前100字符:', audioData.substring(0, 100));
          } else {
            console.log('');
            console.log('❌ 未收到音频数据');
          }
        }, 1000);
      }
    }
    
    // 处理错误
    if (message.header && message.header.code !== 0) {
      console.log('❌ 错误:', message.header.message);
      ws.close();
    }
  } catch (e) {
    console.log('📥 收到非JSON数据:', data.toString().substring(0, 100));
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket 错误:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket 连接已关闭');
});
