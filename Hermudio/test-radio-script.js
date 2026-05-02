/**
 * 测试电台文案生成功能
 * 用于验证Hermes服务配置是否正确
 */

const { HermesService } = require('./src/hermes-service');

// 模拟依赖
const mockRecommendationEngine = {};
const mockMusicService = {};
const mockUserProfile = {};

async function testRadioScriptGeneration() {
  console.log('========================================');
  console.log('测试电台文案生成功能');
  console.log('========================================\n');

  const hermes = new HermesService(mockRecommendationEngine, mockMusicService, mockUserProfile);

  // 测试1: 检查Hermes AI是否可用
  console.log('测试1: 检查Hermes AI服务可用性...');
  const isAvailable = await hermes.checkHermesAvailability();
  console.log(`  Hermes AI可用: ${isAvailable}\n`);

  if (!isAvailable) {
    console.log('⚠️  Hermes AI服务不可用，请确保服务已启动在 http://localhost:8642');
    console.log('   继续测试配置是否正确...\n');
  }

  // 测试2: 检查配置
  console.log('测试2: 检查电台文案生成配置...');
  console.log('  Radio Config:');
  console.log(`    - temperature: ${hermes.radioConfig.temperature} (建议: 0.9-1.0)`);
  console.log(`    - maxTokens: ${hermes.radioConfig.maxTokens} (建议: 800-1000)`);
  console.log(`    - topP: ${hermes.radioConfig.topP}`);
  console.log(`    - frequencyPenalty: ${hermes.radioConfig.frequencyPenalty}`);
  console.log(`    - presencePenalty: ${hermes.radioConfig.presencePenalty}\n`);

  // 测试3: 检查system prompt
  console.log('测试3: 检查电台主持人System Prompt...');
  const promptPreview = hermes.radioHostSystemPrompt.substring(0, 100) + '...';
  console.log(`  ${promptPreview}\n`);

  // 测试4: 尝试生成文案（如果服务可用）
  if (isAvailable) {
    console.log('测试4: 尝试生成欢迎语文案...');
    
    const welcomePrompt = `晚上好。现在是晚上10点，窗外微风轻拂，空气里都是宁静的味道。

请用温暖、亲切的中文生成一段20-30秒的电台欢迎语。
不要自我介绍，直接开始说。
结合当前的时间和氛围，让听众感到"这就是为我说的"。
邀请听众放松心情，享受接下来的音乐时光。

要求：
- 口语化、自然、有感染力
- 像真实电台DJ一样，有画面感
- 不要机械地罗列信息
- 每句话都要有温度`;

    try {
      const result = await hermes.generateRadioScript(welcomePrompt, { type: 'welcome' });
      
      if (result.success) {
        console.log('  ✅ 文案生成成功！');
        console.log('  生成的文案:');
        console.log('  "' + result.script + '"\n');
      } else {
        console.log('  ❌ 文案生成失败:', result.error);
      }
    } catch (error) {
      console.log('  ❌ 测试出错:', error.message);
    }

    console.log('测试5: 尝试生成歌曲intro...');
    
    const introPrompt = `现在深夜，宁静正浓。

即将播放周杰伦的《晴天》。

请用中文生成一段15-20秒的歌曲intro：
- 自然地引入这首歌，不要说"接下来这首歌是..."这种机械的开场
- 结合当前的时间和氛围，说说为什么现在听这首歌很合适
- 可以引用歌词、分享感受、或者描述画面
- 让听众对这首歌产生期待

要求：
- 像电台DJ一样自然、有感染力
- 口语化，有画面感
- 不要罗列信息
- 直接开始说，不要自我介绍`;

    try {
      const result = await hermes.generateRadioScript(introPrompt, { type: 'intro' });
      
      if (result.success) {
        console.log('  ✅ 文案生成成功！');
        console.log('  生成的文案:');
        console.log('  "' + result.script + '"\n');
      } else {
        console.log('  ❌ 文案生成失败:', result.error);
      }
    } catch (error) {
      console.log('  ❌ 测试出错:', error.message);
    }
  }

  console.log('========================================');
  console.log('测试完成');
  console.log('========================================');
}

// 运行测试
testRadioScriptGeneration().catch(console.error);
