/**
 * Scene Analyzer for Hermudio
 * 
 * Analyzes current context including:
 * - Time of day (morning/afternoon/evening/night)
 * - Weather conditions
 * - User mood inference
 */

const https = require('https');

class SceneAnalyzer {
  constructor() {
    this.weatherCache = null;
    this.weatherCacheTime = null;
    this.cacheDuration = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get current scene context
   */
  async getCurrentScene() {
    const now = new Date();
    const hour = now.getHours();

    // Determine time of day
    const timeOfDay = this.getTimeOfDay(hour);

    // Get weather (with caching)
    const weather = await this.getWeather();

    // Infer mood from time and weather
    const mood = this.inferMood(timeOfDay, weather);

    return {
      timeOfDay,
      weather,
      mood,
      hour,
      timestamp: now.toISOString()
    };
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
   * Get weather information (with caching)
   */
  async getWeather() {
    // Check cache
    if (this.weatherCache && this.weatherCacheTime) {
      const elapsed = Date.now() - this.weatherCacheTime;
      if (elapsed < this.cacheDuration) {
        return this.weatherCache;
      }
    }

    try {
      // Using Open-Meteo API (free, no key required)
      const weather = await this.fetchWeatherFromAPI();
      this.weatherCache = weather;
      this.weatherCacheTime = Date.now();
      return weather;
    } catch (error) {
      console.error('[SceneAnalyzer] Weather fetch failed:', error);
      // Return default weather
      return 'sunny';
    }
  }

  /**
   * Fetch weather from Open-Meteo API
   */
  fetchWeatherFromAPI() {
    return new Promise((resolve, reject) => {
      // Default to Beijing coordinates, can be customized
      const lat = 39.9042;
      const lon = 116.4074;
      
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const weatherData = JSON.parse(data);
            const code = weatherData.current_weather.weathercode;
            const weather = this.mapWeatherCode(code);
            resolve(weather);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Map WMO weather code to simple weather condition
   */
  mapWeatherCode(code) {
    // WMO Weather interpretation codes
    // https://open-meteo.com/en/docs
    if (code === 0) return 'sunny';
    if (code >= 1 && code <= 3) return 'cloudy';
    if (code >= 45 && code <= 48) return 'cloudy'; // fog
    if (code >= 51 && code <= 67) return 'rainy'; // drizzle/rain
    if (code >= 71 && code <= 77) return 'snowy'; // snow
    if (code >= 80 && code <= 82) return 'rainy'; // showers
    if (code >= 85 && code <= 86) return 'snowy'; // snow showers
    if (code >= 95 && code <= 99) return 'rainy'; // thunderstorm
    return 'sunny';
  }

  /**
   * Infer user mood based on time and weather
   */
  inferMood(timeOfDay, weather) {
    const moodMap = {
      morning: {
        sunny: 'energetic',
        cloudy: 'calm',
        rainy: 'relaxed',
        snowy: 'peaceful'
      },
      afternoon: {
        sunny: 'happy',
        cloudy: 'focused',
        rainy: 'melancholy',
        snowy: 'calm'
      },
      evening: {
        sunny: 'relaxed',
        cloudy: 'calm',
        rainy: 'melancholy',
        snowy: 'peaceful'
      },
      night: {
        sunny: 'peaceful',
        cloudy: 'focused',
        rainy: 'melancholy',
        snowy: 'peaceful'
      }
    };

    return moodMap[timeOfDay]?.[weather] || 'relaxed';
  }

  /**
   * Get scene description for UI display
   */
  getSceneDescription(scene) {
    const timeDescriptions = {
      morning: '清晨',
      afternoon: '午后',
      evening: '傍晚',
      night: '深夜'
    };

    // Weather descriptions that make sense for different times of day
    const weatherDescriptions = {
      morning: {
        sunny: '阳光明媚',
        cloudy: '云淡风轻',
        rainy: '细雨绵绵',
        snowy: '白雪皑皑'
      },
      afternoon: {
        sunny: '阳光正好',
        cloudy: '云层轻薄',
        rainy: '细雨霏霏',
        snowy: '雪花飘飘'
      },
      evening: {
        sunny: '夕阳余晖',
        cloudy: '暮色苍茫',
        rainy: '暮雨潇潇',
        snowy: '暮雪纷飞'
      },
      night: {
        sunny: '星光璀璨',  // Night with clear sky -> stars
        cloudy: '夜色朦胧',
        rainy: '雨夜静谧',
        snowy: '雪夜安宁'
      }
    };

    const timeDesc = timeDescriptions[scene.timeOfDay] || scene.timeOfDay;
    const weatherDesc = weatherDescriptions[scene.timeOfDay]?.[scene.weather] || '';

    if (weatherDesc) {
      return `${weatherDesc}的${timeDesc}`;
    }
    return timeDesc;
  }
}

// Export singleton instance
const sceneAnalyzer = new SceneAnalyzer();

module.exports = {
  SceneAnalyzer,
  getCurrentScene: () => sceneAnalyzer.getCurrentScene(),
  getSceneDescription: (scene) => sceneAnalyzer.getSceneDescription(scene)
};
