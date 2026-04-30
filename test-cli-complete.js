#!/usr/bin/env node
/**
 * CLI 功能完整测试脚本
 * 测试所有 CLI 控制功能
 */

const API_BASE = 'http://localhost:6588';

async function testAPI(name, method, endpoint, body = null) {
  console.log(`\n[测试] ${name}`);
  console.log('─'.repeat(60));
  
  try {
    const options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    
    console.log('状态:', res.status);
    console.log('响应:', JSON.stringify(data, null, 2).substring(0, 300));
    
    if (data.success || data.code === 200) {
      console.log('✅ 通过');
      return { success: true, data };
    } else {
      console.log('❌ 失败:', data.message || '未知错误');
      return { success: false, error: data.message };
    }
  } catch (e) {
    console.log('❌ 失败:', e.message);
    return { success: false, error: e.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🎵 CLI 功能完整测试');
  console.log('='.repeat(60));
  
  const results = [];
  
  // 1. 检查登录状态
  results.push(await testAPI('检查登录状态', 'GET', '/api/cli/login/check'));
  
  // 2. 获取播放状态
  results.push(await testAPI('获取播放状态', 'GET', '/api/cli/status'));
  
  // 3. 搜索歌曲
  results.push(await testAPI('搜索歌曲', 'GET', '/api/cli/search?keyword=晴天&limit=3'));
  
  // 4. 播放歌曲
  results.push(await testAPI('播放歌曲', 'POST', '/api/cli/play', { 
    songName: '晴天', 
    artist: '周杰伦' 
  }));
  
  // 等待播放开始
  console.log('\n⏳ 等待 3 秒...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 5. 检查播放状态
  results.push(await testAPI('检查播放状态', 'GET', '/api/cli/status'));
  
  // 6. 暂停
  results.push(await testAPI('暂停播放', 'POST', '/api/cli/pause'));
  
  // 7. 恢复播放
  results.push(await testAPI('恢复播放', 'POST', '/api/cli/resume'));
  
  // 8. 下一首
  results.push(await testAPI('下一首', 'POST', '/api/cli/next'));
  
  // 9. 上一首
  results.push(await testAPI('上一首', 'POST', '/api/cli/prev'));
  
  // 10. 设置音量
  results.push(await testAPI('设置音量 80%', 'POST', '/api/cli/volume', { volume: 80 }));
  
  // 11. 停止播放
  results.push(await testAPI('停止播放', 'POST', '/api/cli/stop'));
  
  // 打印汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} 测试 ${index + 1}`);
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log('='.repeat(60));
  
  if (failed === 0) {
    console.log('\n🎉 所有 CLI 测试通过！');
  } else {
    console.log(`\n⚠️ 有 ${failed} 个测试失败`);
  }
}

runTests().catch(err => {
  console.error('测试运行出错:', err);
});
