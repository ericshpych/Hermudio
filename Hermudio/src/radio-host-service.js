/**
 * Radio Host Service for Hermudio
 * 
 * Generates AI-powered radio host narration scripts
 * Manages the flow: Welcome -> Song Intro -> Song Play -> Outro
 */

const { getCurrentScene, getSceneDescription } = require('./scene-analyzer');

class RadioHostService {
  constructor(db, hermesService) {
    this.db = db;
    this.hermes = hermesService;
    this.currentPlaylist = [];
    this.currentSongIndex = 0;
    this.isPlaying = false;
    this.usedIntros = new Set(); // 追踪已使用的intro，避免重复
    this.usedOutros = new Set(); // 追踪已使用的outro，避免重复
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

    // 首先尝试使用Hermes AI生成高质量文案（带超时）
    if (this.hermes && this.hermes.generateRadioScript) {
      try {
        const prompt = `${timeGreeting}。${sceneDesc}。

请用温暖、亲切的中文生成一段电台欢迎语。
不要自我介绍，直接开始说。
结合当前的时间和氛围，让听众感到"这就是为我说的"。
邀请听众放松心情，享受接下来的音乐时光。

【重要】字数限制：严格控制在100个汉字以内（包括标点），越短越好，要精炼有力。

要求：
- 口语化、自然、有感染力
- 像真实电台DJ一样，有画面感
- 不要机械地罗列信息
- 简短有力，控制在100字以内`;

        console.log('[RadioHost] Calling Hermes AI for welcome message...');
        
        // AI调用添加5秒超时
        const result = await Promise.race([
          this.hermes.generateRadioScript(prompt, {
            type: 'welcome',
            context: { scene, timeGreeting }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 5000))
        ]);

        console.log('[RadioHost] Hermes AI result:', { 
          success: result.success, 
          scriptLength: result.script?.length,
          hasScript: !!result.script
        });

        if (result.success && result.script && result.script.length > 10) {
          // 如果超过100字，截断
          let script = result.script;
          if (script.length > 100) {
            script = script.substring(0, 100);
            console.log('[RadioHost] Welcome message truncated to 100 chars');
          }
          console.log('[RadioHost] ✓ Generated welcome message using Hermes AI, length:', script.length);
          return script;
        } else {
          console.log('[RadioHost] ✗ Hermes AI returned invalid result, using fallback. Reason:', 
            !result.success ? 'API failed' : 
            !result.script ? 'no script' : 
            'script too short (' + result.script.length + ' chars)');
        }
      } catch (error) {
        console.log('[RadioHost] ✗ Hermes AI failed for welcome, using fallback:', error.message);
      }
    } else {
      console.log('[RadioHost] ✗ Hermes service not available, using fallback. hermes:', !!this.hermes, 'generateRadioScript:', !!this.hermes?.generateRadioScript);
    }

    // 兜底：使用本地模板（也限制在100字以内）
    return this.getRandomFallbackWelcome(timeGreeting, sceneDesc);
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
   */
  async generateSongIntro(song, scene, previousSong = null) {
    const sceneDesc = getSceneDescription(scene);
    const hour = new Date().getHours();
    
    // 构建丰富的上下文信息
    const context = {
      timeOfDay: scene.timeOfDay,
      weather: scene.weather,
      mood: scene.mood,
      previousSong: previousSong ? `${previousSong.artist}的《${previousSong.name}》` : null
    };

    // 首先尝试使用Hermes AI生成高质量文案
    if (this.hermes && this.hermes.generateRadioScript) {
      try {
        const previousInfo = previousSong ? `刚刚播放完${previousSong.artist}的《${previousSong.name}》，意犹未尽。` : '';
        
        const prompt = `${previousInfo}现在${sceneDesc}，${scene.mood}正浓。

即将播放${song.artist}的《${song.name}》。

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

        console.log('[RadioHost] Calling Hermes AI for song intro:', song.name);
        const result = await this.hermes.generateRadioScript(prompt, {
          type: 'intro',
          context: { song, scene, previousSong }
        });

        console.log('[RadioHost] Hermes AI intro result:', { 
          success: result.success, 
          scriptLength: result.script?.length,
          hasScript: !!result.script
        });

        if (result.success && result.script && result.script.length > 20) {
          console.log('[RadioHost] ✓ Generated song intro using Hermes AI, length:', result.script.length);
          return result.script;
        } else {
          console.log('[RadioHost] ✗ Hermes AI returned invalid intro, using fallback. Reason:', 
            !result.success ? 'API failed' : 
            !result.script ? 'no script' : 
            'script too short (' + result.script.length + ' chars)');
        }
      } catch (error) {
        console.log('[RadioHost] ✗ Hermes AI failed for intro, using fallback:', error.message);
      }
    } else {
      console.log('[RadioHost] ✗ Hermes service not available for intro, using fallback');
    }

    // 兜底：使用本地模板
    return this.getRandomFallbackIntro(song, scene);
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
   */
  async generateSongOutro(song, nextSong = null, userReaction = null) {
    // 首先尝试使用Hermes AI生成高质量文案
    if (this.hermes && this.hermes.generateRadioScript) {
      try {
        const nextInfo = nextSong ? `下一首：${nextSong.artist}《${nextSong.name}》` : '音乐继续';
        
        const prompt = `刚刚播放完${song.artist}的《${song.name}》，${nextInfo}。

请用中文生成一段简短的过渡文案：
- 简单回应刚才这首歌（一句话）
- 自然引入下一首歌（一句话）
- 保持温暖、轻松的语气

【重要】字数限制：总字数严格控制在60个汉字以内（包括标点），越短越好。

【重要】表达方式要求：
- 开头多样化：不要用"这首歌"开头，尝试用"刚才"、"刚刚"、"这一曲"等
- 结尾过渡多样化：不要用"好了"开头，可以用"接下来"、"下面"、"让"等
- 简短、自然，像真实的电台DJ
- 口语化，不要机械
- 直接开始说，不要自我介绍`;

        console.log('[RadioHost] Calling Hermes AI for song outro:', song.name);
        const result = await this.hermes.generateRadioScript(prompt, {
          type: 'outro',
          context: { song, nextSong }
        });

        console.log('[RadioHost] Hermes AI outro result:', { 
          success: result.success, 
          scriptLength: result.script?.length,
          hasScript: !!result.script
        });

        if (result.success && result.script && result.script.length > 5) {
          // 如果超过60字，截断
          let script = result.script;
          if (script.length > 60) {
            script = script.substring(0, 60);
            console.log('[RadioHost] Outro message truncated to 60 chars');
          }
          console.log('[RadioHost] ✓ Generated song outro using Hermes AI, length:', script.length);
          return script;
        } else {
          console.log('[RadioHost] ✗ Hermes AI returned invalid outro, using fallback. Reason:', 
            !result.success ? 'API failed' : 
            !result.script ? 'no script' : 
            'script too short (' + result.script.length + ' chars)');
        }
      } catch (error) {
        console.log('[RadioHost] ✗ Hermes AI failed for outro, using fallback:', error.message);
      }
    } else {
      console.log('[RadioHost] ✗ Hermes service not available for outro, using fallback');
    }

    // 兜底：使用本地模板（也限制在60字以内）
    return this.getRandomFallbackOutro(song, nextSong);
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

      `你是电台主持人Hermes。刚刚那首歌是${song.artist}的《${song.name}》。
请用中文说几句：
- 对这首歌的简单感受
- 预告接下来还有更多好音乐
- 保持听众的期待感

【重要】
- 开头多样化：避免用"这首歌"，可以用"刚才"、"这一曲"、"这段音乐"等
- 结尾过渡多样化：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      // 更多样化的outro prompts
      `《${song.name}》结束了。${nextSongInfo}。
请用简洁自然的方式，总结刚才的歌并预告下一首。

【重要】
- 开头：不要用"这首歌"，可以用"刚才"、"这一曲"、"这段旋律"等
- 结尾过渡：不要用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `刚才${song.artist}的《${song.name}》，听得怎么样？
${nextSongInfo}，请生成一段能让听众保持收听欲望的过渡语。

【重要】
- 开头：避免重复使用"这首歌"，可以用"这一曲"、"这段音乐"、"刚才的歌"等
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `一首歌的时间过得真快。${song.artist}的《${song.name}》还萦绕在耳边...
${nextSongInfo}。请用感性的语言完成这段过渡。

【重要】
- 开头：可以用"这一曲"、"这段旋律"、"刚才的音乐"等，不要总是"这首歌"
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `${song.artist}的《${song.name}》，是不是触动了你某个瞬间？
${nextSongInfo}。请用共情的语气，让听众觉得"这首歌懂我"。

【重要】
- 开头：可以用"这一曲"、"这段旋律"、"刚才的歌"等，避免每段都用"这首歌"
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `音乐继续流淌。${song.artist}的《${song.name}》刚刚结束，
${nextSongInfo}。
请生成一段简洁流畅的过渡。

【重要】
- 开头：可以用"这一曲"、"这段音乐"、"刚才的歌"等，不要总是"这首歌"
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `有时候，一首歌结束，但情绪还在。就像这首《${song.name}》。
${nextSongInfo}。
请用留有余韵的方式结束这段介绍。

【重要】
- 开头：可以用"这一曲"、"这段旋律"、"刚才的音乐"等
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      `感谢${song.artist}带来的《${song.name}》。
${nextSongInfo}。
请用朋友间聊天的自然语气完成这段过渡。

【重要】
- 开头：可以用"这一曲"、"这段音乐"、"刚才的歌"等，避免重复使用"这首歌"
- 结尾过渡：避免用"好了"，可以用"接下来"、"下面"、"让"、"现在"等`,

      // 新增：强调过渡多样性的prompts
      `刚刚${song.artist}的《${song.name}》唱完了。
${nextSongInfo}。
请生成一段outro，要求：
- 开头用"刚才"、"这一曲"、"这段旋律"等，不要用"这首歌"
- 结尾过渡到下一首时，用"接下来"、"下面"、"让"等，不要用"好了"`,

      `${song.artist}的《${song.name}》结束了。
${nextSongInfo}。
请生成一段自然的outro：
- 开头多样化：用"刚才"、"这一曲"、"这段音乐"等
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
    // 【修改】所有兜底文案限制在60字以内，合并上首总结和下首推荐
    const fallbacks = [
      `刚才${song.artist}的《${song.name}》很有感觉。${nextSong ? `接下来听${nextSong.artist}的《${nextSong.name}》。` : '音乐继续。'}`,
      `《${song.name}》结束了。${nextSong ? `下一首${nextSong.artist}《${nextSong.name}》。` : '好歌继续。'}`,
      `感谢${song.artist}的《${song.name}》。${nextSong ? `接下来${nextSong.artist}《${nextSong.name}》。` : '音乐不停。'}`,
      `刚才的旋律还在耳边。${nextSong ? `下一首${nextSong.artist}《${nextSong.name}》。` : '继续聆听。'}`,
      `${song.artist}的《${song.name}》很动人。${nextSong ? `接下来${nextSong.artist}《${nextSong.name}》。` : '精彩继续。'}`,
      `这一曲《${song.name}》结束了。${nextSong ? `下一首${nextSong.artist}《${nextSong.name}》。` : '音乐继续。'}`,
      `刚才的歌很有味道。${nextSong ? `接下来${nextSong.artist}《${nextSong.name}》。` : '继续收听。'}`,
      `这段音乐结束了。${nextSong ? `下一首${nextSong.artist}《${nextSong.name}》。` : '好歌不断。'}`,
      `《${song.name}》唱完了。${nextSong ? `接下来${nextSong.artist}《${nextSong.name}》。` : '别走开。'}`,
      `刚才那一曲很精彩。${nextSong ? `下一首${nextSong.artist}《${nextSong.name}》。` : '继续享受。'}`
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
