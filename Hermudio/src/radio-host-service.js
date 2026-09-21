/**
 * Radio Host Service for Hermudio
 * 
 * Generates AI-powered radio host narration scripts
 * Manages the flow: Welcome -> Song Intro -> Song Play -> Outro
 */

const { getCurrentScene, getSceneDescription } = require('./scene-analyzer');
const { djValidator } = require('./dj-validator');

class RadioHostService {
  constructor(db, hermesService) {
    this.db = db;
    this.hermes = hermesService;
    this.currentPlaylist = [];
    this.currentSongIndex = 0;
    this.isPlaying = false;
    this.usedIntros = new Set(); // 追踪已使用的intro，避免重复
    this.usedOutros = new Set(); // 追踪已使用的outro，避免重复
    this.recentScripts = []; // 近期生成的台词，用于质量校验（开头重复检测等）
    this.maxRecentScripts = 5; // 最多保留5条近期台词
  }

  /**
   * 校验台词并记录到历史
   * @param {string} script - 待校验的台词
   * @param {Object} options - 校验选项
   * @returns {Object} 校验结果
   */
  validateScript(script, options = {}) {
    const result = djValidator.validate(script, {
      ...options,
      recentScripts: this.recentScripts,
    });

    console.log('[RadioHost][Validator]', result.valid ? '✓ 通过' : '✗ 失败', {
      score: result.score,
      errors: result.errors.map(e => e.type),
      warnings: result.warnings.map(w => w.type),
    });

    return result;
  }

  /**
   * 记录台词到历史（用于后续的重复检测）
   */
  recordScript(script) {
    if (!script) return;
    this.recentScripts.push(script);
    if (this.recentScripts.length > this.maxRecentScripts) {
      this.recentScripts.shift();
    }
  }

  /**
   * 带校验的AI生成：生成 → 校验 → 不通过则重试 → 仍失败则走fallback
   * @param {Function} aiGenerateFn - AI生成函数（返回 {success, script}）
   * @param {Function} fallbackFn - 兜底函数
   * @param {Object} validateOptions - 校验选项
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<string>} 最终台词
   */
  async generateWithValidation(aiGenerateFn, fallbackFn, validateOptions = {}, maxRetries = 2) {
    let lastResult = null;
    let lastScript = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const aiResult = await aiGenerateFn(attempt);

        if (aiResult.success && aiResult.script && aiResult.script.length > 10) {
          let script = aiResult.script;

          // 清理乱码
          script = this.cleanScriptText(script);

          // 质量校验
          const validation = this.validateScript(script, validateOptions);

          if (validation.valid) {
            console.log(`[RadioHost] ✓ 第${attempt + 1}次生成通过校验，长度：${script.length}`);
            this.recordScript(script);
            return script;
          }

          lastResult = validation;
          lastScript = script;
          console.log(`[RadioHost] ✗ 第${attempt + 1}次生成未通过校验：${validation.errors.map(e => e.type).join(', ')}`);

          // 如果是最后一次重试，且分数还可以（>=60），就用这个（比fallback好）
          if (attempt === maxRetries && validation.score >= 60) {
            console.log(`[RadioHost] 最后一次重试分数${validation.score}，采用该结果（有警告但可用）`);
            this.recordScript(script);
            return script;
          }
        } else {
          console.log(`[RadioHost] ✗ 第${attempt + 1}次AI生成失败或结果无效`);
        }
      } catch (error) {
        console.log(`[RadioHost] ✗ 第${attempt + 1}次生成异常：${error.message}`);
      }
    }

    // 所有重试都失败，走fallback
    console.log('[RadioHost] → 所有重试失败，使用本地兜底文案');
    const fallback = fallbackFn();
    this.recordScript(fallback);
    return fallback;
  }

  /**
   * 清理乱码字符
   */
  cleanScriptText(text) {
    return text.replace(/[^\u4e00-\u9fff\u0000-\u007f\u3000-\u303f\uff00-\uffef\n\r，。、！？：；""''（）【】《》…—–.?!,;:'"()[\] ]/g, (m) => {
      return /[ \t]/.test(m) ? m : '';
    });
  }

  /**
   * Generate welcome message for the radio show
   * 优先使用Hermes AI生成，失败时使用本地兜底
   * 【修改】限制在100字以内，简短精炼
   * 【优化】添加超时机制，避免天气API或AI调用阻塞
   */
  async generateWelcomeMessage() {
    const hour = new Date().getHours();
    
    let timeGreeting = '';
    if (hour < 6) timeGreeting = '凌晨好';
    else if (hour < 9) timeGreeting = '早上好';
    else if (hour < 12) timeGreeting = '上午好';
    else if (hour < 14) timeGreeting = '中午好';
    else if (hour < 18) timeGreeting = '下午好';
    else timeGreeting = '晚上好';

    // 获取场景信息（带超时，避免天气API阻塞）
    let scene, sceneDesc;
    try {
      scene = await Promise.race([
        getCurrentScene(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Scene timeout')), 3000))
      ]);
      sceneDesc = getSceneDescription(scene);
    } catch (error) {
      console.log('[RadioHost] Scene fetch timeout or error, using default:', error.message);
      // 使用默认场景
      scene = { timeOfDay: hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night', weather: 'sunny', mood: '平静', hour };
      sceneDesc = this.getDefaultSceneDesc(hour);
    }

    // 使用带校验的生成机制
    return this.generateWithValidation(
      // AI生成函数
      async (attempt) => {
        if (!this.hermes || !this.hermes.generateRadioScript) {
          return { success: false, script: '', error: 'Hermes not available' };
        }

        // 不同重试次数用略有差异的prompt，增加多样性
        const attemptHints = [
          '',
          '【注意】换一个角度和表达方式，不要用常见的套路开头。',
          '【重要】用更平实、更具体的细节，避免抽象形容词和广播腔。',
        ];

        const prompt = `${timeGreeting}。${sceneDesc}。

【字数限制】40-90字，简短精炼。

【禁止】：
- 禁止"只有你"、禁止"——只有你"
- 禁止"不用想明天的事，不用管昨天的人"等套话
- 禁止喊口号、禁止"这半小时只属于你"
- 禁止广播腔："欢迎收听"、"为您带来"、"亲爱的听众"等
- 禁止套路开头："你知道吗"、"接下来"等
- 禁止空洞形容词："太美了"、"令人难忘"、"触动人心"等

要求：
- 直接开始说，不要自我介绍
- 口语化，有具体画面感
- 用真实细节营造氛围：比如"窗边透进来的光"、"街道安静下来"
- 结尾自然落下
${attemptHints[attempt] || ''}`;

        const result = await Promise.race([
          this.hermes.generateRadioScript(prompt, {
            type: 'welcome',
            context: { scene, timeGreeting }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 15000))
        ]);

        return result;
      },
      // Fallback函数
      () => this.getRandomFallbackWelcome(timeGreeting, sceneDesc),
      // 校验选项
      {
        scriptType: 'welcome',
        weatherContext: { condition: scene.weather, temperature: scene.temperature },
      },
      // 最大重试次数
      2
    );
  }

  /**
   * 获取默认场景描述（当天气API超时时使用）
   */
  getDefaultSceneDesc(hour) {
    if (hour >= 5 && hour < 9) return '清晨的阳光刚刚洒下';
    if (hour >= 9 && hour < 12) return '上午的时光正好';
    if (hour >= 12 && hour < 14) return '午后的慵懒时光';
    if (hour >= 14 && hour < 17) return '下午的温暖时刻';
    if (hour >= 17 && hour < 21) return '傍晚的宁静时光';
    return '夜深人静的时刻';
  }

  /**
   * Generate song introduction with rich context
   * 优先使用Hermes AI生成，失败时使用本地兜底
   * 【新增】集成质量校验器，自动重试
   */
  async generateSongIntro(song, scene, previousSong = null) {
    const sceneDesc = getSceneDescription(scene);

    // 判断是否纯音乐（简单判断：歌名包含"纯音乐"、"演奏"、"piano"、"instrumental"等，或歌手为"未知"）
    const isInstrumental = this.isInstrumentalSong(song);

    return this.generateWithValidation(
      // AI生成函数
      async (attempt) => {
        if (!this.hermes || !this.hermes.generateRadioScript) {
          return { success: false, script: '', error: 'Hermes not available' };
        }

        const previousInfo = previousSong ? `刚刚播放完${previousSong.artist}的《${previousSong.name}》，意犹未尽。` : '';

        // 不同重试次数用略有差异的prompt
        const attemptHints = [
          '',
          '【注意】换一个完全不同的切入角度，不要用常见的套路。',
          '【重要】用更具体的细节，避免抽象形容词和广播腔，开头要新颖。',
        ];

        const prompt = `${previousInfo}现在${sceneDesc}，${scene.mood}正浓。

即将播放${song.artist}的《${song.name}》。

【字数限制】50-100字，简短精炼。

【禁止】：
- 禁止"你知道吗"开头
- 禁止"闭上眼睛"命令式结尾
- 禁止用"那句..."后接空洞形容词
- 禁止"这首歌太美了"、"令人难忘"、"触动人心"、"太好听了"等空洞词
- 禁止重复上一首的句式和意象——每首歌必须用全新的切入角度
- 禁止广播腔："欢迎收听"、"为您带来"、"亲爱的听众"等
- 禁止书面语："氛围感"、"层次感"、"画面感"、"听感"等
${isInstrumental ? '- 【纯音乐】禁止提及"歌词"、"人声"、"声线"、"演唱"等' : ''}

要求：
- 直接开始说，不要自我介绍
- 引用歌词时，必须接具体画面或动作，不接空洞感受
- 口语化，有画面感
- 每首歌的切入点必须不同：可以是从歌词意象、从编曲乐器、从歌手声线、从个人记忆等不同角度切入
${attemptHints[attempt] || ''}`;

        const result = await Promise.race([
          this.hermes.generateRadioScript(prompt, {
            type: 'intro',
            context: { song, scene, previousSong }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 12000))
        ]);

        return result;
      },
      // Fallback函数
      () => this.getRandomFallbackIntro(song, scene),
      // 校验选项
      {
        scriptType: 'intro',
        isInstrumental,
        weatherContext: { condition: scene.weather, temperature: scene.temperature },
      },
      // 最大重试次数
      2
    );
  }

  /**
   * 判断是否纯音乐
   */
  isInstrumentalSong(song) {
    if (!song) return false;
    const name = (song.name || '').toLowerCase();
    const artist = (song.artist || '').toLowerCase();

    const instrumentalKeywords = [
      '纯音乐', '演奏', '钢琴曲', '钢琴', 'instrumental', 'piano',
      '伴奏', 'bgm', '背景音乐', '纯享', '轻音乐',
    ];

    return instrumentalKeywords.some(keyword =>
      name.includes(keyword) || artist.includes(keyword)
    );
  }

  /**
   * Generate diverse intro prompts
   */
  generateIntroPrompts(song, sceneDesc, context, hour) {
    const basePrompts = [
      `你是Hermudio的主持人Hermes。现在${sceneDesc}，即将播放歌曲《${song.name}》由${song.artist}演唱。

请用中文生成一段15-20秒的歌曲介绍，包含：
1. 歌曲名称和歌手的自然引入
2. 这首歌适合当前场景的原因
3. 简单描述歌曲风格或情感
4. 邀请听众欣赏

【重要】表达方式要求：
- 不要用"这首歌"开头，尝试用"接下来"、"下一曲"、"这段旋律"、"《${song.name}》"、"来自${song.artist}的"等多样化表达
- 像电台DJ一样自然、有感染力，不要机械地罗列信息`,

      `作为电台主持人Hermes，请为即将播放的《${song.name}》-${song.artist}生成一段简短的intro（中文）：
- 自然地提到歌名和歌手
- 为什么现在播放这首歌很合适（${sceneDesc}）
- 用一句话描述这首歌给人的感觉
- 引导听众进入音乐

【重要】表达多样化：可以用"接下来"、"下一曲"、"这段旋律"、"来自${song.artist}的"等，不要总是"这首歌"。`,

      `你是Hermes，正在主持Hermudio。下一首歌是${song.artist}的《${song.name}》。
请用温暖的中文生成一段歌曲介绍：
- 轻松自然地介绍这首歌
- 结合当前氛围（${context.timeOfDay}）
- 让听众对这首歌产生期待

【重要】表达多样化：可以用"接下来"、"下一曲"、"这段音乐"、"来自${song.artist}的"等，避免重复使用"这首歌"。`,

      // 更多样化的prompts
      `${sceneDesc}，${context.mood}正浓。接下来，${song.artist}的《${song.name}》即将响起...
请用诗意的语言介绍，让听众感受到音乐与时刻的完美契合。

【重要】表达多样化：可以用"这一曲"、"这段旋律"、"来自${song.artist}的"等。`,

      `刚刚${context.previousSong ? '那首歌唱完，意犹未尽' : '的氛围还萦绕在耳边'}。
现在，让${song.artist}的《${song.name}》带你进入下一个情绪...
请生成一段有衔接感的intro。

【重要】表达多样化：可以用"这一曲"、"这段音乐"、"来自${song.artist}的"等。`,

      `有时候，${context.timeOfDay}就需要这样一首歌。
${song.artist}的《${song.name}》即将响起...
请用个人化的语气，像分享心爱歌曲一样介绍这首歌。

【重要】表达多样化：可以用"这一曲"、"这段旋律"、"来自${song.artist}的"等。`,

      `下一首歌来自${song.artist}，《${song.name}》。
请用讲故事的方式介绍这首歌：它适合什么样的人？在什么情境下听最有感觉？

【重要】表达多样化：可以用"这一曲"、"这段音乐"等，不要总是"这首歌"。`,

      `${context.weather === '晴天' ? '阳光正好' : context.weather === '雨天' ? '雨声淅沥' : '此刻的氛围'}，
来听${song.artist}的《${song.name}》。
请生成一段能让听众立刻产生共鸣的intro。

【重要】表达多样化：可以用"这一曲"、"这段旋律"、"来自${song.artist}的"等。`,

      `推荐一首歌给你：${song.artist}的《${song.name}》。
请用朋友间分享音乐的口吻，说说为什么在这个${context.timeOfDay}推荐这首歌。

【重要】表达多样化：可以用"这一曲"、"这段音乐"等，避免重复使用"这首歌"。`,

      `音乐继续。接下来是${song.artist}的《${song.name}》。
请用简洁但有感染力的语言，让听众对接下来的旋律充满期待。

【重要】表达多样化：可以用"这一曲"、"这段旋律"等，不要总是"这首歌"。`
    ];

    return basePrompts;
  }

  /**
   * Generate outro after song finishes with rich context
   * 优先使用Hermes AI生成，失败时使用本地兜底
   * 【修改】合并上首总结和下首推荐，总字数不超过60字
   * 【重要】确保文案必须包含两首歌的名称
   * 【新增】集成质量校验器，自动重试
   */
  async generateSongOutro(song, nextSong = null, userReaction = null) {
    const isInstrumental = this.isInstrumentalSong(song);

    return this.generateWithValidation(
      // AI生成函数
      async (attempt) => {
        if (!this.hermes || !this.hermes.generateRadioScript) {
          return { success: false, script: '', error: 'Hermes not available' };
        }

        const nextInfo = nextSong ? `下一首：${nextSong.artist}《${nextSong.name}》` : '音乐继续';

        const attemptHints = [
          '',
          '【注意】确保提到两首歌的名字，换一种表达方式。',
          '【重要】更简短、更自然，不要用套路过渡词。',
        ];

        const prompt = `刚刚播放完${song.artist}的《${song.name}》，${nextInfo}。

【字数限制】30-80字，简短精炼。

【禁止】：
- 禁止"你知道吗"
- 禁止用"这首歌太美了"、"令人难忘"等空洞词
- 禁止说"让我们..."、"让XX把你带回..."
- 禁止广播腔："欢迎收听"、"为您带来"等
- 禁止套路过渡："好了"、"接下来"等开头
${isInstrumental ? '- 【纯音乐】禁止提及"歌词"、"人声"、"声线"等' : ''}

要求：
- 直接开始说，不要自我介绍
- 必须明确提到"${song.name}"或"${song.artist}"
- 如果有下一首歌，必须明确提到"${nextSong?.name || ''}"或"${nextSong?.artist || ''}"
- 说上一首歌时，引用一个具体细节
- 说下一首歌时，用简短具体的一句话带过
- 口语化，自然
${attemptHints[attempt] || ''}`;

        const result = await Promise.race([
          this.hermes.generateRadioScript(prompt, {
            type: 'outro',
            context: { song, nextSong }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 12000))
        ]);

        // 额外校验：必须包含歌名
        if (result.success && result.script) {
          const hasSongName = result.script.includes(song.name) || result.script.includes(song.artist);
          const hasNextSongName = !nextSong || result.script.includes(nextSong.name) || result.script.includes(nextSong.artist);

          if (!hasSongName || !hasNextSongName) {
            console.log('[RadioHost] ✗ Outro缺少歌名，标记为失败。hasSongName:', hasSongName, 'hasNextSongName:', hasNextSongName);
            return { success: false, script: '', error: 'missing song names' };
          }
        }

        return result;
      },
      // Fallback函数
      () => this.getRandomFallbackOutro(song, nextSong),
      // 校验选项
      {
        scriptType: 'outro',
        isInstrumental,
      },
      // 最大重试次数
      2
    );
  }

  /**
   * Generate diverse outro prompts
   */
  generateOutroPrompts(song, nextSong, userReaction) {
    const nextSongInfo = nextSong ? `接下来要播放${nextSong.artist}的《${nextSong.name}》` : '接下来还有更多音乐';
    
    const basePrompts = [
      `你是Hermudio的主持人Hermes。刚刚播放完${song.artist}的《${song.name}》。

请用中文生成一段简短的outro（10-15秒）：
1. 简单回应刚才这首歌
2. 如果听众喜欢，可以预告下一首风格相似的歌
3. 保持温暖、轻松的语气

【重要】表达方式要求：
- 开头多样化：不要用"这首歌"开头，尝试用"刚才"、"刚刚"、"这一曲"、"这段旋律"、"《${song.name}》"等
- 结尾过渡多样化：不要用"好了"开头，可以用"接下来"、"下面"、"下一曲"、"让"、"现在"等自然过渡
- 口语化，像真实电台DJ一样自然
- 直接开始说，不要自我介绍
- 不要说"刚才那首歌怎么样"这种套路的话`,

      `作为Hermes，请为刚刚播放完的《${song.name}》生成一段简短的结束语（中文）：
- 简单分享对这首歌的感受
- 自然过渡到下一首歌
- 保持轻松的氛围

【重要】
- 开头：不要用"这首歌"，可以用"刚才"、"这一曲"、"${song.artist}的这首"、"这段旋律"等
- 结尾过渡：不要用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `你是电台主持人Hermes。${song.artist}的《${song.name}》像一阵微风掠过心头。
请用温暖的声音说几句：
- 分享这首歌带给你的画面或感受
- 用诗意的方式预告下一首歌
- 让听众期待接下来的音乐

【重要】
- 开头：用"像一阵风"、"刚才那曲"、"这段旋律"等意象化表达
- 结尾：用"接下来"、"让"、"下面"等，营造期待感
- 避免："这首歌"、"好了"等平淡表达`,

      // 更多样化的outro prompts
      `${song.artist}的《${song.name}》刚刚结束，余音还在空气里。
${nextSongInfo}
请用有画面感的语言，让听众感受到音乐的流动。

【重要】
- 开头：用"余音还在"、"旋律散去"、"音符落下"等
- 结尾：用"接下来"、"让"、"即将"等，保持连贯
- 避免："这首歌"、"好了"、"结束了"等`,

      `刚才${song.artist}的《${song.name}》，是否触动了你的某个瞬间？
${nextSongInfo}
请用共情的语气，让听众觉得"音乐懂我"。

【重要】
- 开头：用问句或感受引入，"是否触动"、"像在说"、"让人想起"
- 结尾：用"接下来"、"让"、"下面"等自然过渡
- 避免："这首歌"、"好了"`,

      `${song.artist}用《${song.name}》讲述了一个故事。
${nextSongInfo}
请用讲故事的方式完成这段过渡。

【重要】
- 开头：用"讲述"、"描绘"、"带来"等动词
- 结尾：用"接下来"、"让"、"继续"等
- 避免："这首歌"、"好了"`,

      `音乐如流水，《${song.name}》这一段已经流过。
${nextSongInfo}
请用流畅自然的语言，让过渡像水一样顺滑。

【重要】
- 开头：用"如流水"、"像风"、"若光"等比喻
- 结尾：用"接下来"、"让"、"现在"等
- 避免："这首歌"、"好了"`,

      `刚才那曲《${song.name}》，是${song.artist}送给这个时刻的礼物。
${nextSongInfo}
请用温暖的语气，让听众感受到被音乐拥抱。

【重要】
- 开头：用"礼物"、"拥抱"、"陪伴"等温暖词汇
- 结尾：用"接下来"、"让"、"继续"等
- 避免："这首歌"、"好了"`,

      `有时候，旋律停止，但情绪还在蔓延。就像${song.artist}的《${song.name}》。
${nextSongInfo}
请用留有余韵的方式，让音乐在话语间延续。

【重要】
- 开头：用"情绪蔓延"、"余韵"、"回响"等
- 结尾：用"接下来"、"让"、"下面"等
- 避免："这首歌"、"好了"`,

      `${song.artist}的《${song.name}》画下了温柔的句点。
${nextSongInfo}
请用朋友间分享音乐的语气，自然真诚。

【重要】
- 开头：用"画下句点"、"写下"、"留下"等
- 结尾：用"接下来"、"让"、"继续"等
- 避免："这首歌"、"好了"`,

      // 新增：强调画面感和温度的prompts
      `${song.artist}的《${song.name}》像一幅画，刚刚收起。
${nextSongInfo}
请生成一段outro，要求：
- 开头用意象化表达："像一幅画"、"如一阵风"、"若一束光"
- 结尾用期待感："接下来"、"让"、"即将"等
- 避免："这首歌"、"好了"、"结束了"`,

      `《${song.name}》的旋律还在心里轻轻回荡。
${nextSongInfo}
请生成一段有温度的outro：
- 开头：用"还在心里"、"萦绕"、"回响"等感受性词汇
- 结尾过渡多样化：用"接下来"、"下面"、"让"、"现在"等，避免"好了"`,

      `一段旋律结束，${song.artist}的《${song.name}》。
${nextSongInfo}。
请用自然的方式完成这段过渡：
- 开头：用"刚才"、"这一曲"、"这段旋律"等，不要"这首歌"
- 结尾：用"接下来"、"下面"、"让"等过渡，不要"好了"`
    ];

    return basePrompts;
  }

  /**
   * Generate daily playlist introduction
   */
  async generatePlaylistIntro(songs, scene) {
    const songList = songs.slice(0, 5).map((s, i) => `${i + 1}. ${s.name} - ${s.artist}`).join('\n');
    const sceneDesc = getSceneDescription(scene);
    
    const prompts = [
      `你是Hermudio的主持人Hermes。现在${sceneDesc}，今天为你准备了以下歌单：

${songList}

请用中文生成一段30-40秒的playlist介绍：
1. 整体介绍今天歌单的主题和氛围（不要逐一介绍每首歌）
2. 只简单提及其中1-2首歌作为代表，点到为止
3. 邀请听众放松心情，享受这段音乐旅程

【重要限制】
- 总字数控制在150字以内
- 不要详细介绍每首歌，只给整体氛围
- 像电台DJ一样简洁有感染力，不要长篇大论`,

      `${sceneDesc}，我为你精心挑选了${songs.length}首歌。

歌单：${songList}

请用中文生成一段简短的playlist介绍（30-40秒）：
- 概括整体风格和情绪
- 只提1-2首代表性歌曲
- 让听众期待接下来的音乐

【重要】控制在150字以内，不要逐首介绍。`,

      `接下来的时间里，${songs.length}首歌会陪伴你度过${sceneDesc}。

歌单：${songList}

请生成一段简洁的playlist intro（中文）：
- 营造整体氛围
- 只简单提及1-2首歌
- 控制在150字以内
- 像电台DJ一样简洁有力`
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    try {
      // Use generateRadioScript instead of chat for playlist intro
      const result = await this.hermes.generateRadioScript(prompt, {
        type: 'playlist-intro',
        context: { songs, scene }
      });

      if (result.success && result.script && result.script.length > 20) {
        console.log('[RadioHost] ✓ Generated playlist intro using Hermes AI, length:', result.script.length);
        return result.script;
      } else {
        console.log('[RadioHost] ✗ Hermes AI returned invalid playlist intro, using fallback');
        return this.getRandomFallbackPlaylistIntro(songs, scene);
      }
    } catch (error) {
      console.error('[RadioHost] Failed to generate playlist intro:', error);
      return this.getRandomFallbackPlaylistIntro(songs, scene);
    }
  }

  /**
   * Generate transition between songs
   */
  async generateTransition(prevSong, nextSong, scene) {
    const transitions = [
      `刚刚是${prevSong.artist}的《${prevSong.name}》，现在来听${nextSong.artist}的《${nextSong.name}》。`,
      `从《${prevSong.name}》到《${nextSong.name}》，音乐继续。`,
      `${prevSong.artist}之后，是${nextSong.artist}的时间。`,
      `上一首歌还意犹未尽，下一首《${nextSong.name}》已经准备好了。`,
      `音乐不停，接下来是${nextSong.artist}的《${nextSong.name}》。`
    ];

    try {
      const prompt = `你是Hermudio的主持人Hermes。刚刚播放完${prevSong.artist}的《${prevSong.name}》，接下来要播放${nextSong.artist}的《${nextSong.name}》。

请用中文生成一段简短的过渡语（5-10秒）：
- 简单回应上一首歌
- 自然引入下一首歌
- 保持流畅的过渡

要求：简短、自然。`;

      const result = await this.hermes.generateRadioScript(prompt, {
        type: 'transition',
        context: { prevSong, nextSong }
      });

      if (result.success && result.script && result.script.length > 10) {
        console.log('[RadioHost] ✓ Generated transition using Hermes AI, length:', result.script.length);
        return result.script;
      } else {
        console.log('[RadioHost] ✗ Hermes AI returned invalid transition, using fallback');
        return transitions[Math.floor(Math.random() * transitions.length)];
      }
    } catch (error) {
      console.log('[RadioHost] ✗ Failed to generate transition, using fallback:', error.message);
      return transitions[Math.floor(Math.random() * transitions.length)];
    }
  }

  /**
   * Generate show closing message
   */
  async generateClosingMessage() {
    const hour = new Date().getHours();
    let closing = '';
    if (hour < 6) closing = '夜深了，记得早点休息';
    else if (hour < 12) closing = '祝你今天有个好心情';
    else if (hour < 18) closing = '下午继续加油';
    else closing = '祝你有个美好的夜晚';

    const prompts = [
      `你是Hermudio的主持人Hermes。今天的音乐时光即将结束。

请用中文生成一段简短的结束语（15-20秒）：
1. 感谢听众的陪伴
2. "${closing}"
3. 邀请听众下次再来
4. 温暖的道别

要求：真诚、温暖，像朋友一样道别。`,

      `音乐总有结束的时候。${closing}。
请用感性的语言，让听众觉得"这段时光很美好"，并期待下次再见。`,

      `感谢你今天选择Hermudio。${closing}。
请生成一段简短但让人印象深刻的结束语。`
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    try {
      const result = await this.hermes.generateRadioScript(prompt, {
        type: 'closing',
        context: { closing }
      });

      if (result.success && result.script && result.script.length > 15) {
        console.log('[RadioHost] ✓ Generated closing message using Hermes AI, length:', result.script.length);
        return result.script;
      } else {
        console.log('[RadioHost] ✗ Hermes AI returned invalid closing, using fallback');
        return this.getRandomFallbackClosing(closing);
      }
    } catch (error) {
      console.log('[RadioHost] ✗ Failed to generate closing, using fallback:', error.message);
      return this.getRandomFallbackClosing(closing);
    }
  }

  // ==================== Fallback Methods ====================

  getRandomFallbackWelcome(timeGreeting, sceneDesc) {
    // 【修改】所有兜底文案限制在100字以内
    const fallbacks = [
      `${timeGreeting}，欢迎来到Hermudio。我是Hermes。${sceneDesc}，为你准备了适合此刻的音乐，一起享受吧。`,
      `${timeGreeting}！我是Hermes。${sceneDesc}，正适合听些好音乐，让我为你挑选几首歌。`,
      `欢迎收听Hermudio，${timeGreeting}！我是Hermes。${sceneDesc}，希望今天的音乐能带给你特别的感受。`,
      `${timeGreeting}，很高兴遇见你。我是Hermes，${sceneDesc}，让我用音乐为你创造舒适的空间。`,
      `欢迎来到Hermudio！${timeGreeting}，我是Hermes。${sceneDesc}，接下来的音乐，希望能触动你。`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  getRandomFallbackIntro(song, scene) {
    const fallbacks = [
      `接下来这首歌是${song.artist}的《${song.name}》。在这个${scene.timeOfDay}，希望这首歌能带给你一些特别的感受。`,
      `下一首歌来自${song.artist}，《${song.name}》。让这首旋律陪伴你的${scene.timeOfDay}。`,
      `推荐一首好歌给你：${song.artist}的《${song.name}》。相信你会喜欢。`,
      `音乐继续。接下来是${song.artist}的《${song.name}》，一起来听。`,
      `下一首是${song.artist}的《${song.name}》，希望这首歌能让你的${scene.timeOfDay}更加美好。`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  getRandomFallbackOutro(song, nextSong) {
    // 【修改】所有兜底文案限制在60字以内，合并上首总结和下首推荐，更有温度和画面感
    const fallbacks = [
      `${song.artist}的《${song.name}》像一阵风掠过心头。${nextSong ? `接下来${nextSong.artist}的《${nextSong.name}》，带你进入另一种情绪。` : '让音乐继续陪伴你。'}`,
      `这一曲《${song.name}》刚刚散去，${nextSong ? `${nextSong.artist}的《${nextSong.name}》已经在路上。` : '好音乐还在路上。'}`,
      `刚才${song.artist}的《${song.name}》，是否触动了你的某个瞬间？${nextSong ? `下一首${nextSong.artist}的《${nextSong.name}》，继续这段音乐旅程。` : '音乐不会停止。'}`,
      `${song.name}的旋律还在空气里回荡。${nextSong ? `${nextSong.artist}的《${nextSong.name}》即将响起。` : '让这份感动延续。'}`,
      `${song.artist}用《${song.name}》讲述了一个故事。${nextSong ? `接下来${nextSong.artist}的《${nextSong.name}》，带你走进另一段旋律。` : '精彩还在继续。'}`,
      `音乐流淌，《${song.name}》已成为刚才。${nextSong ? `${nextSong.artist}的《${nextSong.name}》正在等待。` : '让心随音乐继续。'}`,
      `刚才那曲《${song.name}》，是${song.artist}送给你的礼物。${nextSong ? `下一首${nextSong.artist}的《${nextSong.name}》，请继续收听。` : '音乐时光继续。'}`,
      `${song.artist}的《${song.name}》画下了句点。${nextSong ? `${nextSong.artist}的《${nextSong.name}》即将为你展开。` : '好歌不断，别走开。'}`,
      `一段旋律结束，另一段即将开始。${nextSong ? `${nextSong.artist}的《${nextSong.name}》正在靠近。` : '让音乐继续流淌。'}`,
      `《${song.name}》的余韵还在，${nextSong ? `${nextSong.artist}的《${nextSong.name}》已经准备好了。` : '更多精彩等你发现。'}`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  getRandomFallbackPlaylistIntro(songs, scene) {
    const fallbacks = [
      `今天为你准备了${songs.length}首精选歌曲，希望这些音乐能陪伴你度过美好的${scene.timeOfDay}。让我们开始吧。`,
      `接下来的时间里，${songs.length}首好歌会陆续为你播放。${scene.timeOfDay}的音乐时光，从这里开始。`,
      `我为你挑选了${songs.length}首歌，适合这个${scene.timeOfDay}。放松心情，享受音乐吧。`,
      `今天的歌单有${songs.length}首精选，每一首都是用心挑选。希望你喜欢。`,
      `${songs.length}首歌，${songs.length}种心情。让音乐带你开启这段旅程。`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  getRandomFallbackClosing(closing) {
    const fallbacks = [
      `感谢你的陪伴，希望今天的音乐让你感到愉悦。${closing}，我们下次再见。`,
      `今天的音乐时光就到这里了。${closing}，期待下次与你相遇。`,
      `感谢收听Hermudio。${closing}，愿音乐永远陪伴你。`,
      `音乐暂歇，但美好继续。${closing}，下次见。`,
      `今天的最后一首歌结束了。${closing}，祝你好运。`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Clean up AI-generated script
   */
  cleanScript(text) {
    return text
      .replace(/^(主持人|Hermes|电台主持人)[:：]/g, '')
      .replace(/^[""'](.*)[""']$/g, '$1')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  /**
   * Set current playlist
   */
  setPlaylist(songs) {
    this.currentPlaylist = songs;
    this.currentSongIndex = 0;
  }

  /**
   * Get current song
   */
  getCurrentSong() {
    return this.currentPlaylist[this.currentSongIndex];
  }

  /**
   * Move to next song
   */
  nextSong() {
    this.currentSongIndex++;
    if (this.currentSongIndex >= this.currentPlaylist.length) {
      this.currentSongIndex = 0;
    }
    return this.getCurrentSong();
  }

  /**
   * Check if there are more songs
   */
  hasMoreSongs() {
    return this.currentSongIndex < this.currentPlaylist.length - 1;
  }
}

module.exports = { RadioHostService };
