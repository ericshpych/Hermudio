const fs = require('fs');
const path = require('path');
const os = require('os');

const sourceDir = path.join(os.homedir(), '.config', 'ncm-cli');
const targetDir = path.join(__dirname, '.ncm-home', '.config', 'ncm-cli');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 需要复制的文件
const filesToCopy = [
  'config.json',
  'credentials.enc.json',
  'tokens.enc.json',
  'user-prefs.json',
  'update-check.json'
];

console.log('开始复制配置文件...');
console.log(`源目录: ${sourceDir}`);
console.log(`目标目录: ${targetDir}`);

filesToCopy.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  
  if (fs.existsSync(sourcePath)) {
    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ 已复制: ${file}`);
    } catch (err) {
      console.error(`❌ 复制失败: ${file} - ${err.message}`);
    }
  } else {
    console.log(`⚠️  跳过: ${file} (不存在)`);
  }
});

console.log('\n复制完成！');
