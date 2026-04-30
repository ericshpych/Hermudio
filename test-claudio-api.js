#!/usr/bin/env node
/**
 * Hermudio API 完整测试脚本
 * 测试所有后端 API 是否正常工作
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
    console.log('响应:', JSON.stringify(data, null, 2).substring(0, 500));
    
    if (data.success || data.code === 200) {
      console.log('✅ 通过');
      return { success: true, data };
    } else {
      console.log('⚠️ 返回错误:', data.message || '未知错误');
      return { success: false, error: data.message };
    }
  } catch (e) {
    console.log('❌ 失败:', e.message);
    return { success: false, error: e.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🎵 Hermudio API 完整测试');
  console.log('='.repeat(60));
  
  const results = [];
  
  // 1. 测试服务器状态
  results.push(await testAPI('获取服务器状态', 'GET', '/api/cli/status'));
  
  // 2. 测试登录状态检查
  results.push(await testAPI('检查登录状态', 'GET', '/api/cli/login/check'));
  
  // 3. 测试获取推荐歌曲
  results.push(await testAPI('获取推荐歌曲', 'GET', '/api/cli/recommend/songs'));
  
  // 4. 测试搜索功能
  results.push(await testAPI('搜索歌曲', 'GET', '/api/cli/search?keyword=周杰伦&limit=5'));
  
  // 5. 测试获取播放队列
  results.push(await testAPI('获取播放队列', 'GET', '/api/cli/playlist'));
  
  // 6. 测试播放歌曲
  results.push(await testAPI('播放歌曲', 'POST', '/api/cli/play', { 
    songId: '108242', 
    originalId: '108242', 
    songName: '晴天', 
    artist: '周杰伦' 
  }));
  
  // 等待播放开始
  console.log('\n⏳ 等待 2 秒...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 7. 测试暂停
  results.push(await testAPI('暂停播放', 'POST', '/api/cli/pause'));
  
  // 8. 测试恢复播放
  results.push(await testAPI('恢复播放', 'POST', '/api/cli/resume'));
  
  // 9. 测试下一首
  results.push(await testAPI('下一首', 'POST', '/api/cli/next'));
  
  // 10. 测试上一首
  results.push(await testAPI('上一首', 'POST', '/api/cli/prev'));
  
  // 11. 测试设置音量
  results.push(await testAPI('设置音量', 'POST', '/api/cli/volume', { volume: 50 }));
  
  // 12. 测试停止播放
  results.push(await testAPI('停止播放', 'POST', '/api/cli/stop'));
  
  // 13. 测试获取命令历史
  results.push(await testAPI('获取命令历史', 'GET', '/api/cli/history'));
  
  // 14. 测试 TTS 状态
  results.push(await testAPI('TTS 状态', 'GET', '/api/tts/status'));
  
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
    console.log('\n🎉 所有 API 测试通过！');
    process.exit(0);
  } else {
    console.log(`\n⚠️ 有 ${failed} 个测试失败`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试运行出错:', err);
  process.exit(1);
});
