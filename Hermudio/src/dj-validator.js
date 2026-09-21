/**
 * DJ台词质量校验器
 * 
 * 校验AI生成的电台文案，确保质量稳定
 * 基于 Claudio 项目的质量校验思路，结合 Hermudio 实际情况定制
 * 
 * 核心规则：
 * 1. 字数范围检查
 * 2. 开头句式重复检测
 * 3. 广播腔检测
 * 4. 书面语检测
 * 5. 空洞形容词检测
 * 6. 纯音乐事实校验
 * 7. 真实天气检测（不能编造天气）
 * 8. 意象词重复检测
 * 9. 命令式结尾检测
 * 10. 套路开头检测
 */

class DjValidator {
  constructor() {
    // ========== 禁用模式 ==========

    // 广播腔：传统电台主持人的套路说法
    this.broadcastTonePatterns = [
      /亲爱的听众/g,
      /各位听众/g,
      /听众朋友们/g,
      /欢迎收听/g,
      /为您带来/g,
      /为您送上/g,
      /为您播放/g,
      /本期节目/g,
      /今天的节目/g,
      /敬请欣赏/g,
      /感谢您的收听/g,
      /希望您喜欢/g,
      /希望大家喜欢/g,
      /让我们一起/g,
      /让我们聆听/g,
      /让我们欣赏/g,
    ];

    // 书面语/乐评腔：不适合口语化的电台
    this.writtenLanguagePatterns = [
      /氛围感/g,
      /层次感/g,
      /画面感/g,
      /听感/g,
      /质感/g,
      /张力/g,
      /律动/g,
      /旋律线/g,
      /编曲/g,
      /曲风/g,
      /曲风/g,
      /音乐性/g,
      /艺术性/g,
      /感染力/g,
      /穿透力/g,
      /治愈系/g,
      /小清新/g,
      /氛围感拉满/g,
    ];

    // 空洞形容词：没有具体信息的赞美
    this.emptyAdjectivePatterns = [
      /太美了/g,
      /太好听了/g,
      /太动人了/g,
      /令人难忘/g,
      /触动人心/g,
      /动人心弦/g,
      /感人至深/g,
      /非常好听/g,
      /特别好听/g,
      /真的很好听/g,
      /超好听/g,
      /绝了/g,
      /yyds/g,
      /神曲/g,
      /经典之作/g,
      /不朽之作/g,
      /千古绝唱/g,
    ];

    // 命令式结尾：对听众下指令
    this.imperativeEndingPatterns = [
      /闭上眼睛[，。！？]?$/g,
      /用心感受[，。！？]?$/g,
      /静静聆听[，。！？]?$/g,
      /细细品味[，。！？]?$/g,
      /慢慢欣赏[，。！？]?$/g,
      /放松心情[，。！？]?$/g,
      /享受这一刻[，。！？]?$/g,
      /沉浸其中[，。！？]?$/g,
      /让音乐带你/g,
      /让旋律带你/g,
      /让歌声带你/g,
    ];

    // 套路开头：用烂了的开场白
    this.clicheOpeningPatterns = [
      /^你知道吗/g,
      /^不知道你有没有/g,
      /^有没有那么一首歌/g,
      /^接下来这首/g,
      /^下面这首/g,
      /^今天给大家/g,
      /^今天为大家/g,
      /^今天给你/g,
      /^今天为你/g,
      /^首先/g,
      /^第一首/g,
      /^来听一下/g,
      /^一起来听/g,
      /^让我们来听/g,
      /^说到/g,
      /^提到/g,
    ];

    // 天气编造：声称真实天气但没有上下文支持
    this.weatherFabricationPatterns = [
      /外面正在下雨/g,
      /窗外下着雨/g,
      /今天下雨/g,
      /雨下得很大/g,
      /淅淅沥沥的雨声/g,
      /今天很冷/g,
      /今天很热/g,
      /今天天气真好/g,
      /阳光明媚/g,
      /大雪纷飞/g,
      /秋风萧瑟/g,
      /春意盎然/g,
    ];

    // 纯音乐禁用词：纯音乐不能提歌词/人声/声线
    this.instrumentalBannedPatterns = [
      /歌词/g,
      /人声/g,
      /声线/g,
      /嗓音/g,
      /唱腔/g,
      /演唱/g,
      /唱的/g,
      /唱得/g,
      /歌声/g,
      /主唱/g,
      /副歌/g,
      /主歌/g,
      /作词/g,
      /作曲/g,
    ];

    // ========== 意象词集群（检测重复） ==========
    this.imageryClusters = {
      night: ['夜色', '夜晚', '深夜', '黑夜', '夜幕', '夜空', '星月', '星光', '月光'],
      light: ['灯光', '路灯', '霓虹', '光晕', '灯火', '烛光', '光线'],
      window: ['窗边', '窗外', '窗台', '车窗', '窗前', '玻璃'],
      rain: ['雨声', '雨滴', '下雨', '细雨', '大雨', '雨幕', '雨水'],
      wind: ['微风', '晚风', '清风', '风', '风声', '秋风', '春风'],
      city: ['街道', '城市', '都市', '车流', '人群', '喧嚣', '繁华'],
      memory: ['回忆', '记忆', '往事', '从前', '小时候', '那年', '曾经'],
      heart: ['心里', '心底', '内心', '心头', '心弦', '心灵', '心情'],
    };

    // ========== 字数配置 ==========
    this.lengthConfig = {
      welcome: { min: 40, max: 100 },
      intro: { min: 50, max: 120 },
      outro: { min: 30, max: 90 },
      transition: { min: 10, max: 50 },
      closing: { min: 30, max: 80 },
      'playlist-intro': { min: 50, max: 150 },
      default: { min: 30, max: 120 },
    };
  }

  /**
   * 主校验方法
   * @param {string} script - 待校验的台词
   * @param {Object} options - 校验选项
   * @param {boolean} options.isInstrumental - 是否纯音乐
   * @param {string[]} options.recentScripts - 近期台词（用于检测重复，建议3-5条）
   * @param {Object} options.weatherContext - 真实天气上下文 { condition, temperature }
   * @param {string} options.scriptType - 台词类型
   * @returns {Object} 校验结果 { valid, errors, warnings, score }
   */
  validate(script, options = {}) {
    const errors = [];
    const warnings = [];

    if (!script || typeof script !== 'string') {
      return {
        valid: false,
        errors: [{ type: 'empty', message: '台词为空', severity: 'critical' }],
        warnings: [],
        score: 0,
      };
    }

    const cleanScript = script.trim();

    // 1. 字数检查
    const lengthResult = this.checkLength(cleanScript, options.scriptType);
    if (lengthResult) errors.push(lengthResult);

    // 2. 开头句式重复检测
    if (options.recentScripts && options.recentScripts.length > 0) {
      const openingResult = this.checkOpeningRepetition(cleanScript, options.recentScripts);
      if (openingResult) errors.push(openingResult);
    }

    // 3. 广播腔检测
    const broadcastResult = this.checkPatterns(cleanScript, this.broadcastTonePatterns, 'broadcast_tone', '广播腔');
    if (broadcastResult) errors.push(broadcastResult);

    // 4. 书面语检测
    const writtenResult = this.checkPatterns(cleanScript, this.writtenLanguagePatterns, 'written_language', '书面语/乐评腔');
    if (writtenResult) errors.push(writtenResult);

    // 5. 空洞形容词检测
    const emptyResult = this.checkPatterns(cleanScript, this.emptyAdjectivePatterns, 'empty_adjective', '空洞形容词');
    if (emptyResult) errors.push(emptyResult);

    // 6. 纯音乐事实校验
    if (options.isInstrumental) {
      const instrumentalResult = this.checkPatterns(cleanScript, this.instrumentalBannedPatterns, 'instrumental_fact', '纯音乐不能提及的内容');
      if (instrumentalResult) errors.push(instrumentalResult);
    }

    // 7. 真实天气检测
    const weatherResult = this.checkWeatherFabrication(cleanScript, options.weatherContext);
    if (weatherResult) errors.push(weatherResult);

    // 8. 意象词重复检测（单条内过度使用同一集群）
    const imageryResult = this.checkImageryOveruse(cleanScript);
    if (imageryResult) warnings.push(imageryResult);

    // 9. 命令式结尾检测
    const imperativeResult = this.checkImperativeEnding(cleanScript);
    if (imperativeResult) errors.push(imperativeResult);

    // 10. 套路开头检测
    const clicheResult = this.checkClicheOpening(cleanScript);
    if (clicheResult) errors.push(clicheResult);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateScore(errors, warnings),
    };
  }

  // ========== 具体校验规则 ==========

  /**
   * 1. 字数检查
   */
  checkLength(script, scriptType = 'default') {
    const config = this.lengthConfig[scriptType] || this.lengthConfig.default;
    const length = script.length;

    if (length < config.min) {
      return {
        type: 'length_too_short',
        message: `字数过少（${length}字），最少${config.min}字`,
        severity: 'warning',
        actual: length,
        expected: config.min,
      };
    }

    if (length > config.max) {
      return {
        type: 'length_too_long',
        message: `字数过多（${length}字），最多${config.max}字`,
        severity: 'warning',
        actual: length,
        expected: config.max,
      };
    }

    return null;
  }

  /**
   * 2. 开头句式重复检测
   * 检测近几条台词的开头是否相似
   */
  checkOpeningRepetition(script, recentScripts) {
    if (!recentScripts || recentScripts.length === 0) return null;

    // 取当前台词的前10个字作为开头特征
    const currentOpening = this.normalizeOpening(script.substring(0, 10));

    for (const recent of recentScripts.slice(-3)) {
      const recentOpening = this.normalizeOpening(recent.substring(0, 10));

      // 计算相似度（简单的字符重叠率）
      const similarity = this.calculateStringSimilarity(currentOpening, recentOpening);

      if (similarity > 0.6) {
        return {
          type: 'opening_repetition',
          message: `开头与近期台词过于相似（相似度${Math.round(similarity * 100)}%）`,
          severity: 'error',
          currentOpening,
          recentOpening,
          similarity,
        };
      }
    }

    return null;
  }

  /**
   * 3/4/5. 通用模式检测
   */
  checkPatterns(script, patterns, type, label) {
    const matches = [];

    for (const pattern of patterns) {
      const match = script.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return {
        type,
        message: `检测到${label}：${matches.join('、')}`,
        severity: 'error',
        matches,
      };
    }

    return null;
  }

  /**
   * 6. 纯音乐事实校验（已合并到 checkPatterns）
   */

  /**
   * 7. 天气编造检测
   * 如果没有提供真实天气上下文，不能声称具体天气
   */
  checkWeatherFabrication(script, weatherContext) {
    const matches = [];

    for (const pattern of this.weatherFabricationPatterns) {
      const match = script.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      // 如果有真实天气上下文，检查是否匹配
      if (weatherContext && weatherContext.condition) {
        const condition = weatherContext.condition;
        const isRainy = condition === 'rainy';
        const isSnowy = condition === 'snowy';
        const isSunny = condition === 'sunny';

        // 简单校验：如果提到下雨但实际不是雨天，算编造
        const mentionsRain = matches.some(m => m.includes('雨'));
        const mentionsSnow = matches.some(m => m.includes('雪'));
        const mentionsSun = matches.some(m => m.includes('阳光') || m.includes('晴天'));

        if ((mentionsRain && !isRainy) || (mentionsSnow && !isSnowy) || (mentionsSun && !isSunny)) {
          return {
            type: 'weather_mismatch',
            message: `天气描述与实际不符（提到：${matches.join('、')}，实际：${condition}）`,
            severity: 'error',
            matches,
            actualCondition: condition,
          };
        }

        // 天气匹配则不算错误
        return null;
      }

      // 没有天气上下文时，作为警告（可能是泛指，但最好不要）
      return {
        type: 'weather_uncertain',
        message: `提到具体天气但无上下文验证：${matches.join('、')}`,
        severity: 'warning',
        matches,
      };
    }

    return null;
  }

  /**
   * 8. 意象词过度使用检测
   * 单条台词中同一集群的词出现超过2次算过度
   */
  checkImageryOveruse(script) {
    const overusedClusters = [];

    for (const [clusterName, words] of Object.entries(this.imageryClusters)) {
      let count = 0;
      const foundWords = [];

      for (const word of words) {
        const regex = new RegExp(word, 'g');
        const matches = script.match(regex);
        if (matches) {
          count += matches.length;
          foundWords.push(word);
        }
      }

      if (count >= 3) {
        overusedClusters.push({
          cluster: clusterName,
          count,
          words: foundWords,
        });
      }
    }

    if (overusedClusters.length > 0) {
      return {
        type: 'imagery_overuse',
        message: `意象词过度集中：${overusedClusters.map(c => `${c.cluster}(${c.count}次)`).join('、')}`,
        severity: 'warning',
        clusters: overusedClusters,
      };
    }

    return null;
  }

  /**
   * 9. 命令式结尾检测
   */
  checkImperativeEnding(script) {
    const matches = [];

    for (const pattern of this.imperativeEndingPatterns) {
      const match = script.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return {
        type: 'imperative_ending',
        message: `命令式表达：${matches.join('、')}`,
        severity: 'error',
        matches,
      };
    }

    return null;
  }

  /**
   * 10. 套路开头检测
   */
  checkClicheOpening(script) {
    const matches = [];

    for (const pattern of this.clicheOpeningPatterns) {
      const match = script.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return {
        type: 'cliche_opening',
        message: `套路开头：${matches.join('、')}`,
        severity: 'error',
        matches,
      };
    }

    return null;
  }

  // ========== 辅助方法 ==========

  /**
   * 归一化开头（去掉标点、空格，便于比较）
   */
  normalizeOpening(text) {
    return text.replace(/[，。！？、；：""''（）【】《》\s]/g, '').substring(0, 8);
  }

  /**
   * 计算字符串相似度（Jaccard相似度）
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));

    let intersection = 0;
    for (const char of set1) {
      if (set2.has(char)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 计算质量分数（0-100）
   */
  calculateScore(errors, warnings) {
    let score = 100;

    for (const error of errors) {
      if (error.severity === 'critical') {
        score -= 50;
      } else if (error.severity === 'error') {
        score -= 15;
      } else if (error.severity === 'warning') {
        score -= 5;
      }
    }

    for (const warning of warnings) {
      score -= 3;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取校验失败的简要描述（用于日志）
   */
  getFailureSummary(result) {
    if (result.valid) return '通过';

    const errorTypes = result.errors.map(e => e.type);
    return `失败（${errorTypes.join(', ')}），分数：${result.score}`;
  }
}

// 导出单例
const djValidator = new DjValidator();

module.exports = {
  DjValidator,
  djValidator,
  validateDjScript: (script, options) => djValidator.validate(script, options),
};
