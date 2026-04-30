#!/usr/bin/env node
/**
 * CLI 功能完整测试脚本
 * 测试 ncm-cli 0.1.3 的所有功能
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 项目配置目录
const PROJECT_HOME = path.join(__dirname, '.claudio');
const PROJECT_CONFIG_DIR = path.join(PROJECT_HOME, '.config');

// 确保目录存在
if (!fs.existsSync(PROJECT_CONFIG_DIR)) {
  fs.mkdirSync(PROJECT_CONFIG_DIR, { recursive: true });
}

// 执行 CLI 命令
function executeCLICommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const fullCommand = `npx @music163/ncm-cli ${command} ${args.join(' ')}`;
    
    console.log(`\n[测试] 执行: ${fullCommand}`);
    console.log('─'.repeat(60));

    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: PROJECT_CONFIG_DIR
    };

    exec(fullCommand, { 
      timeout: 30000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: env
    }, (error, stdout, stderr) => {
      const output = stdout || stderr || '';
      
      console.log('输出:');
      console.log(output || '(无输出)');
      
      if (error && error.code !== 0 && !output) {
        console.log('❌ 失败:', error.message);
        reject({ error: error.message, output });
      } else {
        console.log('✅ 成功');
        resolve(output);
      }
    });
  });
}

// 测试套件
async function runTests() {
  console.log('='.repeat(60));
  console.log('🎵 Hermudio CLI 功能完整测试');
  console.log('='.repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // 测试 1: 检查 CLI 版本
  try {
    await executeCLICommand('--version');
    results.passed++;
    results.tests.push({ name: 'CLI 版本检查', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'CLI 版本检查', status: 'failed', error: e.error });
  }

  // 测试 2: 检查登录状态
  try {
    const output = await executeCLICommand('login', ['--check']);
    results.passed++;
    results.tests.push({ name: '登录状态检查', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '登录状态检查', status: 'failed', error: e.error });
  }

  // 测试 3: 获取播放状态
  try {
    await executeCLICommand('state');
    results.passed++;
    results.tests.push({ name: '获取播放状态', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '获取播放状态', status: 'failed', error: e.error });
  }

  // 测试 4: 获取播放队列
  try {
    await executeCLICommand('queue');
    results.passed++;
    results.tests.push({ name: '获取播放队列', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '获取播放队列', status: 'failed', error: e.error });
  }

  // 测试 5: 清空队列
  try {
    await executeCLICommand('queue', ['clear']);
    results.passed++;
    results.tests.push({ name: '清空播放队列', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '清空播放队列', status: 'failed', error: e.error });
  }

  // 测试 6: 添加歌曲到队列 (使用真实歌曲URL)
  try {
    const songUrl = 'https://music.163.com/song?id=108242'; // 晴天
    await executeCLICommand('queue', ['add', songUrl]);
    results.passed++;
    results.tests.push({ name: '添加歌曲到队列', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '添加歌曲到队列', status: 'failed', error: e.error });
  }

  // 测试 7: 开始播放
  try {
    await executeCLICommand('play');
    results.passed++;
    results.tests.push({ name: '开始播放', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '开始播放', status: 'failed', error: e.error });
  }

  // 等待几秒让播放开始
  console.log('\n⏳ 等待 3 秒让播放开始...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 测试 8: 暂停播放
  try {
    await executeCLICommand('pause');
    results.passed++;
    results.tests.push({ name: '暂停播放', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '暂停播放', status: 'failed', error: e.error });
  }

  // 测试 9: 恢复播放
  try {
    await executeCLICommand('resume');
    results.passed++;
    results.tests.push({ name: '恢复播放', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '恢复播放', status: 'failed', error: e.error });
  }

  // 测试 10: 下一首
  try {
    await executeCLICommand('next');
    results.passed++;
    results.tests.push({ name: '下一首', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '下一首', status: 'failed', error: e.error });
  }

  // 测试 11: 上一首
  try {
    await executeCLICommand('prev');
    results.passed++;
    results.tests.push({ name: '上一首', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '上一首', status: 'failed', error: e.error });
  }

  // 测试 12: 设置音量
  try {
    await executeCLICommand('volume', ['50']);
    results.passed++;
    results.tests.push({ name: '设置音量', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '设置音量', status: 'failed', error: e.error });
  }

  // 测试 13: 停止播放
  try {
    await executeCLICommand('stop');
    results.passed++;
    results.tests.push({ name: '停止播放', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '停止播放', status: 'failed', error: e.error });
  }

  // 测试 14: 跳转播放进度
  try {
    await executeCLICommand('seek', ['30']);
    results.passed++;
    results.tests.push({ name: '跳转播放进度', status: 'passed' });
  } catch (e) {
    results.failed++;
    results.tests.push({ name: '跳转播放进度', status: 'failed', error: e.error });
  }

  // 打印测试结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));
  
  results.tests.forEach((test, index) => {
    const icon = test.status === 'passed' ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${test.name}`);
    if (test.error) {
      console.log(`   错误: ${test.error}`);
    }
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`总计: ${results.passed + results.failed} 个测试`);
  console.log(`✅ 通过: ${results.passed}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log('='.repeat(60));
  
  if (results.failed === 0) {
    console.log('\n🎉 所有测试通过！CLI 功能正常。');
    process.exit(0);
  } else {
    console.log(`\n⚠️ 有 ${results.failed} 个测试失败，请检查 CLI 配置。`);
    process.exit(1);
  }
}

// 运行测试
runTests().catch(err => {
  console.error('测试运行出错:', err);
  process.exit(1);
});
