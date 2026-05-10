const EdgeTTS = require('edge-tts-nodejs');
const fs = require('fs');

async function test() {
  try {
    console.log('开始测试...');
    const buffer = await EdgeTTS.toVoice({
      text: '你好，欢迎来到 Hermudio 音乐电台！',
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 0,
      pitch: 0
    });
    
    console.log('合成成功！Buffer 大小:', buffer.length);
    fs.writeFileSync('test-output.mp3', buffer);
    console.log('已保存到 test-output.mp3');
    
    console.log('获取音色列表...');
    const voices = await EdgeTTS.voices();
    console.log('找到', voices.length, '个音色');
    console.log('前 5 个中文音色:');
    voices.filter(v => v.Locale && v.Locale.startsWith('zh')).slice(0, 5).forEach((v, i) => {
      console.log(`${i+1}. ${v.ShortName} - ${v.FriendlyName}`);
    });
  } catch (error) {
    console.error('错误:', error);
  }
}

test();
