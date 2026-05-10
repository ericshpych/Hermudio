/**
 * Hermes TTS Service for Hermudio
 * 
 * Integrates with local Hermes AI for high-quality text-to-speech
 * Falls back to Web Speech API if Hermes is unavailable
 * 
 * Hermes TTS API Endpoints:
 * - POST /v1/tts/synthesize - Synthesize speech
 * - GET /v1/tts/voices - List available voices
 */

class HermesTTSService {
  constructor() {
    this.baseUrl = 'http://localhost:8642/v1/tts';
    this.defaultVoice = 'zh-CN-XiaoxiaoNeural';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.isSpeaking = false;
    this.audioContext = null;
    this.currentAudioBuffer = null;
    this.currentSource = null;
    this.onWordCallback = null;
    this.onEndCallback = null;
    
    // Web Speech API fallback
    this.webSpeechTTS = null;
    this.initWebSpeechFallback();
    
    // Available voices cache
    this.availableVoices = [];
  }

  /**
   * Initialize Web Speech API fallback
   */
  initWebSpeechFallback() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.webSpeechTTS = {
        synth: window.speechSynthesis,
        voice: null,
        init: () => {
          const voices = this.webSpeechTTS.synth.getVoices();
          this.webSpeechTTS.voice = voices.find(v => v.lang === 'zh-CN') ||
                                     voices.find(v => v.lang.startsWith('zh')) ||
                                     voices[0];
          console.log('[HermesTTS] Web Speech fallback voice:', this.webSpeechTTS.voice?.name);
        }
      };
      this.webSpeechTTS.init();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.webSpeechTTS.init();
      }
    }
  }

  /**
   * Check if Hermes TTS is available
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortController.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        return data.status === 'ok';
      }
    } catch (e) {
      console.log('[HermesTTS] Service not available:', e.message);
    }
    return false;
  }

  /**
   * Get available voices from Hermes TTS
   */
  async getAvailableVoices() {
    if (this.availableVoices.length > 0) {
      return this.availableVoices;
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        method: 'GET',
        signal: AbortController.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        this.availableVoices = data.voices || [];
        console.log('[HermesTTS] Available voices:', this.availableVoices.length);
        return this.availableVoices;
      }
    } catch (e) {
      console.log('[HermesTTS] Failed to get voices:', e.message);
    }

    // Return default voices if Hermes is unavailable
    return [
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', lang: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-XiaoyiNeural', name: '晓伊', lang: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-XiaohanNeural', name: '晓涵', lang: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', lang: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-YunxiNeural', name: '云希', lang: 'zh-CN', gender: 'male' },
      { id: 'zh-CN-YunhaoNeural', name: '云浩', lang: 'zh-CN', gender: 'male' }
    ];
  }

  /**
   * Select best Chinese voice for Hermes TTS
   */
  async selectBestVoice() {
    const voices = await this.getAvailableVoices();
    
    // Prefer female voices for better clarity
    const femaleChineseVoices = voices.filter(v => 
      v.lang.startsWith('zh') && (v.gender === 'female' || v.name.includes('女'))
    );
    
    if (femaleChineseVoices.length > 0) {
      // Prefer Xiaoxiao if available
      const xiaoxiao = femaleChineseVoices.find(v => v.name.includes('晓晓') || v.id.includes('Xiaoxiao'));
      if (xiaoxiao) {
        return xiaoxiao.id;
      }
      
      // Otherwise pick first female voice
      return femaleChineseVoices[0].id;
    }
    
    // Fallback to any Chinese voice
    const chineseVoices = voices.filter(v => v.lang.startsWith('zh'));
    if (chineseVoices.length > 0) {
      return chineseVoices[0].id;
    }
    
    return this.defaultVoice;
  }

  /**
   * Speak text using Hermes TTS
   * @param {string} text - Text to speak
   * @param {object} options - Options
   */
  async speak(text, options = {}) {
    this.stop();
    
    const rate = options.rate || this.rate;
    const pitch = options.pitch || this.pitch;
    const volume = options.volume || this.volume;
    const voice = options.voice || await this.selectBestVoice();

    // Check if Hermes TTS is available
    const hermesAvailable = await this.isAvailable();
    
    if (hermesAvailable) {
      try {
        return await this.speakWithHermes(text, voice, rate, pitch, volume, options);
      } catch (error) {
        console.error('[HermesTTS] Failed with Hermes TTS:', error.message);
        console.log('[HermesTTS] Falling back to Web Speech API');
      }
    }

    // Fallback to Web Speech API
    return this.speakWithWebSpeech(text, rate, pitch, volume, options);
  }

  /**
   * Speak using Hermes TTS API
   */
  async speakWithHermes(text, voice, rate, pitch, volume, options) {
    this.isSpeaking = true;
    
    if (options.onStart) options.onStart();
    
    try {
      const response = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          voice: voice,
          rate: rate,
          pitch: pitch,
          volume: volume,
          format: 'mp3'
        }),
        signal: AbortController.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get audio buffer from response
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode and play audio
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      this.currentAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Calculate duration for word callbacks
      const audioDuration = this.currentAudioBuffer.duration;
      const words = text.split(/\s+/).filter(w => w.length > 0);
      const timePerWord = audioDuration / words.length;
      
      // Schedule word callbacks
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
      
      // Start playing audio
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.currentAudioBuffer;
      
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;
      
      this.currentSource.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      this.currentSource.onended = () => {
        this.isSpeaking = false;
        this.currentSource = null;
        this.currentAudioBuffer = null;
        console.log('[HermesTTS] Speech ended');
        if (options.onEnd) options.onEnd();
      };
      
      this.currentSource.start();
      
      // Start word callbacks
      if (words.length > 0 && options.onWord) {
        setTimeout(scheduleWordCallback, 100);
      }
      
      return true;
      
    } catch (error) {
      this.isSpeaking = false;
      console.error('[HermesTTS] Speak failed:', error);
      if (options.onEnd) options.onEnd();
      throw error;
    }
  }

  /**
   * Speak using Web Speech API fallback
   */
  speakWithWebSpeech(text, rate, pitch, volume, options) {
    if (!this.webSpeechTTS || !this.webSpeechTTS.synth) {
      console.warn('[HermesTTS] Web Speech API not available');
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
      console.log('[HermesTTS] Web Speech started');
      if (options.onStart) options.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      console.log('[HermesTTS] Web Speech ended');
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = (event) => {
      console.error('[HermesTTS] Web Speech error:', event.error);
      this.isSpeaking = false;
      if (options.onEnd) options.onEnd();
    };

    this.webSpeechTTS.synth.speak(utterance);
    return true;
  }

  /**
   * Stop current speech
   */
  stop() {
    this.isSpeaking = false;
    
    // Stop Hermes audio
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Audio may already be stopped
      }
      this.currentSource = null;
      this.currentAudioBuffer = null;
    }
    
    // Stop Web Speech fallback
    if (this.webSpeechTTS && this.webSpeechTTS.synth) {
      this.webSpeechTTS.synth.cancel();
    }
  }

  /**
   * Pause speech (only works with Web Speech API)
   */
  pause() {
    if (this.webSpeechTTS && this.webSpeechTTS.synth) {
      this.webSpeechTTS.synth.pause();
    }
  }

  /**
   * Resume speech (only works with Web Speech API)
   */
  resume() {
    if (this.webSpeechTTS && this.webSpeechTTS.synth) {
      this.webSpeechTTS.synth.resume();
    }
  }

  /**
   * Check if currently speaking
   */
  getIsSpeaking() {
    return this.isSpeaking;
  }

  /**
   * Set speech rate
   */
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  /**
   * Set speech pitch
   */
  setPitch(pitch) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  /**
   * Set speech volume
   */
  setVolume(volume) {
    this.volume = Math.max(0.1, Math.min(1.0, volume));
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      defaultVoice: this.defaultVoice
    };
  }
}

// Export singleton instance
const hermesTTS = new HermesTTSService();

module.exports = {
  HermesTTSService,
  ttsService: hermesTTS,
  speak: (text, options) => hermesTTS.speak(text, options),
  stop: () => hermesTTS.stop(),
  isAvailable: () => hermesTTS.isAvailable(),
  getAvailableVoices: () => hermesTTS.getAvailableVoices()
};
