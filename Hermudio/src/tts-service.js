/**
 * TTS Service for Hermudio
 * 
 * Provides text-to-speech functionality for radio host narration
 * Uses Web Speech API on frontend, with backend fallback options
 */

class TTSService {
  constructor() {
    this.synth = null;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.onWordCallback = null;
    this.onEndCallback = null;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
  }

  /**
   * Initialize TTS service
   */
  init() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      
      // Voices may load asynchronously
 if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
      
      console.log('[TTS] Service initialized');
      return true;
    }
    
    console.warn('[TTS] Web Speech API not supported');
    return false;
  }

  /**
   * Load available voices and select a good Chinese voice
   */
  loadVoices() {
    if (!this.synth) return;
    
    const voices = this.synth.getVoices();
    
    // Try to find a good Chinese voice
    this.voice = voices.find(v => v.lang === 'zh-CN' && v.name.includes('Female')) ||
                 voices.find(v => v.lang === 'zh-CN') ||
                 voices.find(v => v.lang.startsWith('zh')) ||
                 voices[0];
    
    console.log('[TTS] Selected voice:', this.voice?.name, this.voice?.lang);
  }

  /**
   * Speak text with word-by-word callback for sync display
   * @param {string} text - Text to speak
   * @param {object} options - Options
   * @param {function} options.onWord - Callback(word, index) when each word is spoken
   * @param {function} options.onEnd - Callback() when speech ends
   * @param {function} options.onStart - Callback() when speech starts
   */
  speak(text, options = {}) {
    if (!this.synth) {
      console.warn('[TTS] Not initialized');
      if (options.onEnd) options.onEnd();
      return false;
    }

    // Cancel any ongoing speech
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.lang = 'zh-CN';
    utterance.rate = options.rate || this.rate;
    utterance.pitch = options.pitch || this.pitch;
    utterance.volume = options.volume || this.volume;

    // Split text into words for sync display
    const words = text.split(/\s+/);
    let wordIndex = 0;

    utterance.onstart = () => {
      this.isSpeaking = true;
      console.log('[TTS] Speech started');
      if (options.onStart) options.onStart();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' && options.onWord) {
        // Estimate which word is being spoken based on character index
        const charIndex = event.charIndex;
        let currentWordIndex = 0;
        let charCount = 0;
        
        for (let i = 0; i < words.length; i++) {
          if (charCount >= charIndex) {
            currentWordIndex = i;
            break;
          }
          charCount += words[i].length + 1; // +1 for space
        }
        
        options.onWord(words[currentWordIndex] || '', currentWordIndex);
      }
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      console.log('[TTS] Speech ended');
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Speech error:', event.error);
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (options.onEnd) options.onEnd();
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
    
    return true;
  }

  /**
   * Stop current speech
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
    }
  }

  /**
   * Pause speech
   */
  pause() {
    if (this.synth) {
      this.synth.pause();
    }
  }

  /**
   * Resume speech
   */
  resume() {
    if (this.synth) {
      this.synth.resume();
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
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TTSService };
}
