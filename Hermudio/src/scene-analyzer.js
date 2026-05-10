/**
 * Scene Analyzer for Hermudio
 * 
 * Analyzes current context including:
 * - Time of day (morning/afternoon/evening/night)
 * - Weather conditions with real API
 * - User mood inference
 * - Location awareness
 */

const https = require('https');

class SceneAnalyzer {
  constructor() {
    this.weatherCache = null;
    this.weatherCacheTime = null;
    this.cacheDuration = 30 * 60 * 1000; // 30 minutes
    this.location = null;
  }

  /**
   * Get current scene context with rich information
   */
  async getCurrentScene() {
    const now = new Date();
    const hour = now.getHours();

    // Determine time of day with detailed periods
    const timeOfDay = this.getTimeOfDay(hour);
    const timeOfDayDetail = this.getTimeOfDayDetail(hour);

    // Get location
    const location = await this.getLocation();

    // Get weather (with caching and timeout)
    let weather = 'sunny';
    let temperature = 22;
    let windSpeed = 5;
    
    try {
      const weatherData = await Promise.race([
        this.getWeather(location.latitude, location.longitude),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Scene getWeather timeout')), 7000)
        )
      ]);
      weather = weatherData.condition;
      temperature = weatherData.temperature;
      windSpeed = weatherData.windSpeed;
    } catch (error) {
      console.error('[SceneAnalyzer] getWeather failed, using default:', error.message);
      weather = 'sunny';
      temperature = 22;
    }

    // Infer mood from time, weather, and temperature
    const mood = this.inferMood(timeOfDay, weather, temperature);

    const scene = {
      timeOfDay,
      timeOfDayDetail,
      weather,
      temperature,
      windSpeed,
      mood,
      hour,
      location: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: now.toISOString(),
      weatherDisplay: this.getWeatherDisplay(weather),
      timeOfDayDisplay: this.getTimeOfDayDisplay(timeOfDay),
      moodDisplay: this.getMoodDisplay(mood),
      description: this.getSceneDescription({ timeOfDay, weather, mood, temperature })
    };

    console.log('[SceneAnalyzer] Current scene:', scene);
    return scene;
  }

  /**
   * Determine time of day based on hour
   */
  getTimeOfDay(hour) {
    if (hour >= 5 && hour < 12) {
      return 'morning';
    } else if (hour >= 12 && hour < 17) {
      return 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'evening';
    } else {
      return 'night';
    }
  }

  /**
   * Get detailed time period
   */
  getTimeOfDayDetail(hour) {
    if (hour >= 0 && hour < 5) return 'midnight';
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 9) return 'early_morning';
    if (hour >= 9 && hour < 12) return 'late_morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 17) return 'late_afternoon';
    if (hour >= 17 && hour < 19) return 'dusk';
    if (hour >= 19 && hour < 21) return 'early_night';
    if (hour >= 21 && hour < 24) return 'late_night';
    return 'unknown';
  }

  /**
   * Get location information
   */
  async getLocation() {
    try {
      if (!this.location) {
        // Default location: Beijing
        this.location = {
          name: '北京',
          latitude: 39.9042,
          longitude: 116.4074,
          country: 'CN'
        };
      }
      return this.location;
    } catch (error) {
      console.error('[SceneAnalyzer] 获取位置失败:', error.message);
      return {
        name: '未知',
        latitude: 39.9042,
        longitude: 116.4074,
        country: 'CN'
      };
    }
  }

  /**
   * Set custom location
   */
  setLocation(name, latitude, longitude) {
    this.location = {
      name,
      latitude,
      longitude,
      country: 'CN'
    };
    // Clear weather cache to force refresh
    this.weatherCache = null;
    this.weatherCacheTime = null;
    console.log('[SceneAnalyzer] Location updated to:', name);
  }

  /**
   * Get weather information (with caching)
   */
  async getWeather(lat, lon) {
    // Check cache
    if (this.weatherCache && this.weatherCacheTime) {
      const elapsed = Date.now() - this.weatherCacheTime;
      if (elapsed < this.cacheDuration) {
        return this.weatherCache;
      }
    }

    try {
      const weatherData = await Promise.race([
        this.fetchWeatherFromAPI(lat, lon),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Weather API timeout')), 6000)
        )
      ]);
      this.weatherCache = weatherData;
      this.weatherCacheTime = Date.now();
      return weatherData;
    } catch (error) {
      console.error('[SceneAnalyzer] Weather fetch failed:', error.message);
      return {
        condition: 'sunny',
        temperature: 22,
        windSpeed: 5,
        code: 0
      };
    }
  }

  /**
   * Fetch weather from Open-Meteo API
   */
  fetchWeatherFromAPI(lat, lon) {
    return new Promise((resolve, reject) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;

      const request = https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const weatherData = JSON.parse(data);
            const code = weatherData.current?.weather_code;
            const temperature = weatherData.current?.temperature_2m;
            const windSpeed = weatherData.current?.wind_speed_10m;
            
            resolve({
              condition: this.mapWeatherCode(code),
              temperature: temperature || 22,
              windSpeed: windSpeed || 5,
              code: code || 0
            });
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        reject(error);
      });

      request.setTimeout(5000, () => {
        request.destroy();
        reject(new Error('Weather API request timeout'));
      });
    });
  }

  /**
   * Map WMO weather code to simple weather condition
   */
  mapWeatherCode(code) {
    if (code === undefined) return 'sunny';
    if (code === 0) return 'sunny';
    if (code === 1 || code === 2) return 'partly_cloudy';
    if (code === 3) return 'cloudy';
    if (code >= 45 && code <= 48) return 'foggy';
    if (code >= 51 && code <= 67) return 'rainy';
    if (code >= 71 && code <= 77) return 'snowy';
    if (code >= 80 && code <= 82) return 'rainy';
    if (code >= 85 && code <= 86) return 'snowy';
    if (code >= 95) return 'stormy';
    return 'sunny';
  }

  /**
   * Infer user mood based on time, weather, and temperature
   */
  inferMood(timeOfDay, weather, temperature) {
    const baseMoodMap = {
      morning: {
        sunny: 'energetic',
        partly_cloudy: 'calm',
        cloudy: 'peaceful',
        foggy: 'peaceful',
        rainy: 'relaxed',
        snowy: 'peaceful',
        stormy: 'calm'
      },
      afternoon: {
        sunny: 'happy',
        partly_cloudy: 'focused',
        cloudy: 'focused',
        foggy: 'calm',
        rainy: 'melancholy',
        snowy: 'calm',
        stormy: 'focused'
      },
      evening: {
        sunny: 'relaxed',
        partly_cloudy: 'calm',
        cloudy: 'peaceful',
        foggy: 'peaceful',
        rainy: 'melancholy',
        snowy: 'peaceful',
        stormy: 'calm'
      },
      night: {
        sunny: 'peaceful',
        partly_cloudy: 'peaceful',
        cloudy: 'focused',
        foggy: 'peaceful',
        rainy: 'melancholy',
        snowy: 'peaceful',
        stormy: 'calm'
      }
    };

    let mood = baseMoodMap[timeOfDay]?.[weather] || 'relaxed';

    // Adjust mood based on temperature
    if (temperature < 10) {
      mood = 'peaceful';
    } else if (temperature > 35) {
      mood = 'relaxed';
    }

    return mood;
  }

  /**
   * Get display text for weather
   */
  getWeatherDisplay(condition) {
    const displayMap = {
      sunny: '☀️ 晴天',
      partly_cloudy: '⛅ 多云',
      cloudy: '☁️ 阴天',
      rainy: '🌧️ 雨天',
      snowy: '❄️ 雪天',
      stormy: '⛈️ 雷暴',
      foggy: '🌫️ 雾天'
    };
    return displayMap[condition] || '☀️ 晴天';
  }

  /**
   * Get display text for time of day
   */
  getTimeOfDayDisplay(timeOfDay) {
    const displayMap = {
      morning: '🌅 清晨',
      afternoon: '☀️ 午后',
      evening: '🌆 傍晚',
      night: '🌙 深夜'
    };
    return displayMap[timeOfDay] || '☀️ 白天';
  }

  /**
   * Get display text for mood
   */
  getMoodDisplay(mood) {
    const displayMap = {
      energetic: '充满活力',
      happy: '心情愉快',
      focused: '专注投入',
      calm: '平静安详',
      peaceful: '宁静放松',
      relaxed: '轻松惬意',
      melancholy: '略带忧郁'
    };
    return displayMap[mood] || '平静';
  }

  /**
   * Get rich scene description for UI display
   */
  getSceneDescription(scene) {
    const timeDescriptions = {
      morning: '清晨的阳光洒进窗棂',
      afternoon: '午后的时光静静流淌',
      evening: '黄昏时分，夕阳西下',
      night: '万籁俱寂的夜晚'
    };

    const weatherDescriptions = {
      sunny: '天气晴朗，空气清新',
      partly_cloudy: '几朵白云，点缀天空',
      cloudy: '云层笼罩，光线柔和',
      rainy: '淅淅沥沥的雨声',
      snowy: '雪花飘落，银装素裹',
      stormy: '风雨交加的时刻',
      foggy: '雾气朦胧，如梦如幻'
    };

    const moodDescriptions = {
      energetic: '适合听些充满活力的音乐',
      happy: '让欢快的旋律陪伴你',
      focused: '为你推荐适合专注的音乐',
      calm: '来一首舒缓的曲子吧',
      peaceful: '享受这份宁静时光',
      relaxed: '放松身心，享受音乐',
      melancholy: '用音乐抚慰心灵'
    };

    const timeDesc = timeDescriptions[scene.timeOfDay] || '时光静好';
    const weatherDesc = weatherDescriptions[scene.weather] || '天气宜人';
    const moodDesc = moodDescriptions[scene.mood] || '';

    let description = `${timeDesc}，${weatherDesc}。`;
    if (moodDesc) {
      description += ` ${moodDesc}`;
    }

    // Add temperature info if available
    if (scene.temperature !== undefined) {
      description += ` 当前温度 ${scene.temperature}°C。`;
    }

    return description;
  }

  /**
   * Get keywords for music recommendation
   */
  getRecommendationKeywords(scene) {
    const { timeOfDay, weather, mood } = scene;
    
    const keywords = {
      morning: ['morning', 'peaceful', 'wake up', 'positive'],
      afternoon: ['work', 'focus', 'study', 'energetic'],
      evening: ['evening', 'chill', 'relax', 'unwind'],
      night: ['night', 'sleep', 'calm', 'relaxing'],
      sunny: ['happy', 'upbeat', 'bright', 'cheerful'],
      partly_cloudy: ['chill', 'relaxed', 'easy'],
      cloudy: ['soft', 'ambient', 'mellow'],
      rainy: ['rainy', 'calm', 'peaceful', 'sleep'],
      snowy: ['cozy', 'warm', 'peaceful'],
      stormy: ['dramatic', 'intense', 'epic'],
      foggy: ['ambient', 'dreamy', 'ethereal'],
      energetic: ['energetic', 'upbeat', 'dance', 'pop'],
      happy: ['happy', 'cheerful', 'positive', 'pop'],
      focused: ['focus', 'study', 'work', 'instrumental'],
      calm: ['calm', 'peaceful', 'relaxing'],
      peaceful: ['peaceful', 'meditation', 'sleep', 'ambient'],
      relaxed: ['relaxed', 'chill', 'lofi', 'jazz'],
      melancholy: ['melancholy', 'sad', 'emotional', 'piano']
    };

    const timeKeywords = keywords[timeOfDay] || [];
    const weatherKeywords = keywords[weather] || [];
    const moodKeywords = keywords[mood] || [];

    // Combine and deduplicate
    const allKeywords = [...new Set([...timeKeywords, ...weatherKeywords, ...moodKeywords])];
    
    // Return top 5 keywords
    return allKeywords.slice(0, 5);
  }
}

// Export singleton instance
const sceneAnalyzer = new SceneAnalyzer();

module.exports = {
  SceneAnalyzer,
  getCurrentScene: () => sceneAnalyzer.getCurrentScene(),
  getSceneDescription: (scene) => sceneAnalyzer.getSceneDescription(scene),
  getRecommendationKeywords: (scene) => sceneAnalyzer.getRecommendationKeywords(scene),
  setLocation: (name, lat, lon) => sceneAnalyzer.setLocation(name, lat, lon)
};
