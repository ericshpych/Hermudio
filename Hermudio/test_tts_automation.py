#!/usr/bin/env python3
"""
TTS 连续播放测试脚本
测试 TTS 是否能正常工作和回退到浏览器语音
"""
from playwright.sync_api import sync_playwright
import time

def test_tts():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 监听控制台日志
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        
        print("=" * 60)
        print("🎵 TTS 连续播放测试")
        print("=" * 60)
        
        # 访问测试页面
        print("\n1. 访问测试页面...")
        page.goto('http://localhost:8888/test-tts-retry.html')
        page.wait_for_load_state('networkidle')
        time.sleep(2)  # 等待服务状态检查完成
        
        # 获取服务状态
        server_status = page.locator('#serverStatus').text_content()
        tts_status = page.locator('#ttsStatus').text_content()
        print(f"   服务器状态: {server_status}")
        print(f"   TTS 状态: {tts_status}")
        
        # 测试1: 单条 TTS
        print("\n2. 测试单条 TTS...")
        page.click('button:has-text("测试单条 TTS")')
        time.sleep(8)  # 等待 TTS 完成
        
        # 获取日志
        page_logs = page.locator('#logs').text_content()
        if "TTS onEnd 回调触发" in page_logs:
            print("   ✅ 单条 TTS 测试通过")
        else:
            print("   ⚠️  单条 TTS 可能未完成，检查日志...")
        
        # 测试2: 连续播放
        print("\n3. 测试连续播放 3 条 TTS...")
        page.click('button:has-text("测试连续播放")')
        time.sleep(20)  # 等待 3 条 TTS 完成
        
        page_logs = page.locator('#logs').text_content()
        end_count = page_logs.count("onEnd")
        if end_count >= 4:  # 单条测试1个 + 连续3个
            print(f"   ✅ 连续播放测试通过 (检测到 {end_count} 个 onEnd 回调)")
        else:
            print(f"   ⚠️  连续播放可能未完成 (检测到 {end_count} 个 onEnd 回调)")
        
        # 测试3: API 回退
        print("\n4. 测试 API 失败时的回退机制...")
        page.click('button:has-text("测试 API 被阻止")')
        time.sleep(8)
        
        page_logs = page.locator('#logs').text_content()
        if "回退到浏览器 TTS" in page_logs:
            print("   ✅ API 回退机制正常工作")
        else:
            print("   ⚠️  未检测到回退，检查日志...")
        
        # 输出完整日志
        print("\n" + "=" * 60)
        print("📋 完整测试日志:")
        print("=" * 60)
        print(page_logs)
        
        # 输出浏览器控制台日志
        print("\n" + "=" * 60)
        print("🌐 浏览器控制台日志:")
        print("=" * 60)
        for log in logs[-20:]:  # 只显示最后20条
            print(log)
        
        browser.close()
        
        print("\n" + "=" * 60)
        print("✅ 测试完成")
        print("=" * 60)

if __name__ == "__main__":
    test_tts()
