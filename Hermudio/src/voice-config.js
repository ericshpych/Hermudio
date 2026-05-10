const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = {
  defaultProvider: 'hermes',
  
  providers: {
    browser: {
      enabled: true,
      name: '浏览器语音',
      description: '使用浏览器内置的 Web Speech API',
      defaultVoice: 'zh-CN',
      defaultRate: 1.0,
      defaultPitch: 1.0,
      defaultVolume: 1.0
    },
    
    hermes: {
      enabled: true,
      name: 'Hermes 语音',
      description: '使用本地 Edge TTS 语音合成',
      endpoint: 'http://localhost:6688/api/tts',
      defaultVoice: 'zh-CN-XiaoxiaoNeural',
      defaultRate: 0,
      defaultPitch: 0,
      defaultVolume: 1.0,
      
      voices: [
        { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', lang: 'zh-CN', gender: 'female', desc: '活泼少女' },
        { id: 'zh-CN-XiaoyiNeural', name: '晓伊', lang: 'zh-CN', gender: 'female', desc: '温柔女声' },
        { id: 'zh-CN-XiaohanNeural', name: '晓涵', lang: 'zh-CN', gender: 'female', desc: '青春女声' },
        { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', lang: 'zh-CN', gender: 'female', desc: '知性女声' },
        { id: 'zh-CN-XiaoruiNeural', name: '晓睿', lang: 'zh-CN', gender: 'female', desc: '甜美女声' },
        { id: 'zh-CN-YunxiNeural', name: '云希', lang: 'zh-CN', gender: 'male', desc: '磁性男声' },
        { id: 'zh-CN-YunyangNeural', name: '云扬', lang: 'zh-CN', gender: 'male', desc: '新闻男声' },
        { id: 'zh-CN-YunhaoNeural', name: '云浩', lang: 'zh-CN', gender: 'male', desc: '成熟男声' },
        { id: 'zh-HK-HiuGaaiNeural', name: '凱喬', lang: 'zh-HK', gender: 'female', desc: '香港粤语' },
        { id: 'zh-HK-HiuMaaiNeural', name: '凱雯', lang: 'zh-HK', gender: 'female', desc: '香港粤语' },
        { id: 'zh-TW-HsiaoYuNeural', name: '曉雨', lang: 'zh-TW', gender: 'female', desc: '台湾国语' }
      ]
    },
    
    cloud: {
      enabled: true,
      name: '云端语音',
      description: '使用云端 TTS 服务（如 MiniMax）',
      provider: 'minimax',
      apiKey: '',
      defaultVoice: 'female-yujie',
      defaultRate: 1.0,
      defaultPitch: 0,
      defaultVolume: 1.0,
      
      voices: [
        { id: 'female-yujie', name: '御姐', lang: 'zh-CN', gender: 'female', desc: '御姐音色' },
        { id: 'female-shaonv', name: '少女', lang: 'zh-CN', gender: 'female', desc: '少女音色' },
        { id: 'female-chengshu', name: '成熟', lang: 'zh-CN', gender: 'female', desc: '成熟女声' },
        { id: 'female-tianmei', name: '甜美', lang: 'zh-CN', gender: 'female', desc: '甜美女声' },
        { id: 'male-qn-qingse', name: '青涩', lang: 'zh-CN', gender: 'male', desc: '青涩青年' },
        { id: 'male-qn-jingying', name: '精英', lang: 'zh-CN', gender: 'male', desc: '精英青年' },
        { id: 'male-qn-badao', name: '霸道', lang: 'zh-CN', gender: 'male', desc: '霸道青年' },
        { id: 'presenter_female', name: '女主持', lang: 'zh-CN', gender: 'female', desc: '主持人女声' },
        { id: 'presenter_male', name: '男主持', lang: 'zh-CN', gender: 'male', desc: '主持人男声' }
      ]
    }
  }
};

class VoiceConfig {
  constructor() {
    this.configPath = path.join(__dirname, '../config/voice.config.json');
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      } else {
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
      }
    } catch (error) {
      console.error('[VoiceConfig] Failed to load config:', error.message);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[VoiceConfig] Failed to save config:', error.message);
    }
  }

  getConfig() {
    return this.config;
  }

  getProvider(providerId) {
    return this.config.providers[providerId] || null;
  }

  getDefaultProvider() {
    return this.config.defaultProvider;
  }

  setDefaultProvider(providerId) {
    if (this.config.providers[providerId]) {
      this.config.defaultProvider = providerId;
      this.saveConfig();
      return true;
    }
    return false;
  }

  getAvailableProviders() {
    return Object.entries(this.config.providers)
      .filter(([_, provider]) => provider.enabled)
      .map(([id, provider]) => ({
        id,
        name: provider.name,
        description: provider.description
      }));
  }

  getVoices(providerId) {
    const provider = this.getProvider(providerId);
    return provider ? provider.voices || [] : [];
  }

  updateProvider(providerId, updates) {
    if (this.config.providers[providerId]) {
      this.config.providers[providerId] = { ...this.config.providers[providerId], ...updates };
      this.saveConfig();
      return true;
    }
    return false;
  }
}

module.exports = { VoiceConfig, DEFAULT_CONFIG };
