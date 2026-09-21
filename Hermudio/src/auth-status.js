function parseCliLoginStatus(cliOutput = '') {
  let isLoggedIn = false;
  try {
    const jsonOutput = JSON.parse(cliOutput);
    isLoggedIn = jsonOutput.success === true;
  } catch (error) {
    isLoggedIn = cliOutput.includes('"success": true') || cliOutput.includes('logged in');
  }
  return isLoggedIn;
}

function resolveAuthStatus({ loginSession = {}, cliOutput = '' }) {
  const isLoggedIn = parseCliLoginStatus(cliOutput);
  return {
    success: true,
    isLoggedIn,
    message: isLoggedIn ? '已登录' : '未登录'
  };
}

module.exports = {
  parseCliLoginStatus,
  resolveAuthStatus
};
