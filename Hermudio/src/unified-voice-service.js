const { VoiceConfig } = require('./voice-config');

class UnifiedVoiceService {
  constructor() {
    this.config = new VoiceConfig();
    this.currentProvider = this.config.getDefaultProvider();
    this.isSpeaking = false;
    this.audioContext = null;
    this.currentSource = null;
    this.webSpeechTTS = null;
    this.initWebSpeech();
  }

  initWebSpeech() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.webSpeechTTS = {
        synth: window.speechSynthesis,
        voice: null,
        init: () => {
          const voices = this.webSpeechTTS.synth.getVoices();
          this.webSpeechTTS.voice = voices.find(v => v.lang === 'zh-CN') ||
                                     voices.find(v => v.lang.startsWith('zh')) ||
                                     voices[0];
        }
      };
      this.webSpeechTTS.init();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.webSpeechTTS.init();
      }
    }
  }

  async getAvailableProviders() {
    return this.config.getAvailableProviders();
  }

  async getVoices(providerId = this.currentProvider) {
    return this.config.getVoices(providerId);
  }

  setProvider(providerId) {
    const providers = this.config.getAvailableProviders();
    if (providers.some(p => p.id === providerId)) {
      this.currentProvider = providerId;
      return true;
    }
    return false;
  }

  getCurrentProvider() {
    return this.config.getProvider(this.currentProvider);
  }

  async isProviderAvailable(providerId) {
    const provider = this.config.getProvider(providerId);
    if (!provider || !provider.enabled) return false;

    if (providerId === 'browser') {
      return typeof window !== 'undefined' && window.speechSynthesis !== undefined;
    }

    if (providerId === 'hermes') {
      try {
        const response = await fetch(`${provider.endpoint}/health`);
        return response.ok;
      } catch (error) {
        return false;
      }
    }

    if (providerId === 'cloud') {
      return !!provider.apiKey;
    }

    return false;
  }

  async speak(text, options = {}) {
    this.stop();

    const providerId = options.provider || this.currentProvider;
    const provider = this.config.getProvider(providerId);
    
    if (!provider || !provider.enabled) {
      throw new Error(`Provider ${providerId} not available or disabled`);
    }

    const voice = options.voice || provider.defaultVoice;
    const rate = options.rate !== undefined ? options.rate : provider.defaultRate;
    const pitch = options.pitch !== undefined ? options.pitch : provider.defaultPitch;
    const volume = options.volume !== undefined ? options.volume : provider.defaultVolume;

    const available = await this.isProviderAvailable(providerId);
    
    if (!available) {
      if (providerId !== 'browser') {
        return this.speakWithFallback(text, rate, pitch, volume, options);
      }
      throw new Error(`Provider ${providerId} not available`);
    }

    switch (providerId) {
      case 'browser':
        return this.speakWithBrowser(text, rate, pitch, volume, options);
      case 'hermes':
        return this.speakWithHermes(text, voice, rate, pitch, volume, options);
      case 'cloud':
        return this.speakWithCloud(text, voice, rate, pitch, volume, options);
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  async speakWithFallback(text, rate, pitch, volume, options) {
    console.log(`[VoiceService] Provider unavailable, falling back to Web Speech API`);
    return this.speakWithBrowser(text, rate, pitch, volume, options);
  }

  speakWithBrowser(text, rate, pitch, volume, options) {
    if (!this.webSpeechTTS || !this.webSpeechTTS.synth) {
      console.warn('[VoiceService] Web Speech API not available');
      if (options.onEnd) options.onEnd();
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (this.webSpeechTTS.voice) {
      utterance.voice = this.webSpeechTTS.voice;
    }
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (options.onStart) options.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = (event) => {
      console.error('[VoiceService] Web Speech error:', event.error);
      this.isSpeaking = false;
      if (options.onEnd) options.onEnd();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' && options.onWord) {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const wordIndex = Math.min(event.charIndex, words.length - 1);
        options.onWord(words[wordIndex], wordIndex);
      }
    };

    this.webSpeechTTS.synth.speak(utterance);
    return true;
  }

  async speakWithHermes(text, voice, rate, pitch, volume, options) {
    this.isSpeaking = true;
    
    if (options.onStart) options.onStart();
    
    try {
      const provider = this.config.getProvider('hermes');
      const response = await fetch(`${provider.endpoint}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: voice,
          rate: rate,
          pitch: pitch,
          volume: volume
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      const audioDuration = audioBuffer.duration;
      const words = text.split(/\s+/).filter(w => w.length > 0);
      const timePerWord = audioDuration / Math.max(words.length, 1);
      
      let wordIndex = 0;
      const scheduleWordCallback = () => {
        if (wordIndex < words.length && this.isSpeaking) {
          if (options.onWord) {
            options.onWord(words[wordIndex], wordIndex);
          }
          wordIndex++;
          setTimeout(scheduleWordCallback, timePerWord * 1000);
        }
      };
      
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;
      
      this.currentSource.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      this.currentSource.onended = () => {
        this.isSpeaking = false;
        this.currentSource = null;
        if (options.onEnd) options.onEnd();
      };
      
      this.currentSource.start();
      
      if (words.length > 0 && options.onWord) {
        setTimeout(scheduleWordCallback, 100);
      }
      
      return true;
      
    } catch (error) {
      this.isSpeaking = false;
      console.error('[VoiceService] Hermes TTS error:', error.message);
      if (options.onEnd) options.onEnd();
      throw error;
    }
  }

  async speakWithCloud(text, voice, rate, pitch, volume, options) {
    this.isSpeaking = true;
    
    if (options.onStart) options.onStart();
    
    try {
      const provider = this.config.getProvider('cloud');
      
      if (!provider.apiKey) {
        throw new Error('Cloud TTS API key not configured');
      }

      const response = await fetch('/api/tts/doubao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice_type: voice,
          speed: rate,
          vol: volume,
          pitch: pitch
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;
      
      this.currentSource.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      this.currentSource.onended = () => {
        this.isSpeaking = false;
        this.currentSource = null;
        if (options.onEnd) options.onEnd();
      };
      
      this.currentSource.start();
      
      return true;
      
    } catch (error) {
      this.isSpeaking = false;
      console.error('[VoiceService] Cloud TTS error:', error.message);
      if (options.onEnd) options.onEnd();
      throw error;
    }
  }

  stop() {
    this.isSpeaking = false;
    
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {}
      this.currentSource = null;
    }
    
    if (this.webSpeechTTS && this.webSpeechTTS.synth) {
      this.webSpeechTTS.synth.cancel();
    }
  }

  getIsSpeaking() {
    return this.isSpeaking;
  }
}

module.exports = { UnifiedVoiceService };
