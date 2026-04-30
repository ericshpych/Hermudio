const fs = require('fs');
const path = require('path');
const os = require('os');

const sourceDir = path.join(os.homedir(), '.config', 'ncm-cli', 'cache');
const targetDir = path.join(__dirname, '.ncm-home', '.config', 'ncm-cli', 'cache');

if (fs.existsSync(sourceDir)) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceDir);
  files.forEach(file => {
    const src = path.join(sourceDir, file);
    const dst = path.join(targetDir, file);
    try {
      fs.copyFileSync(src, dst);
      console.log('复制:', file);
    } catch(e) {
      console.log('跳过:', file);
    }
  });
  console.log('cache 目录复制完成');
} else {
  console.log('源 cache 目录不存在');
}
