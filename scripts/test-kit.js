/**
 * 极简测试 runner（零依赖），供 scripts/test-core.js 与 scripts/test-ai.js 共用。
 * 两个脚本各自一个 Node 进程，计数互不干扰；任一用例失败即置非零退出码。
 */
function createRunner() {
  let passed = 0;
  return {
    test(name, fn) {
      try {
        fn();
        passed++;
        console.log('  ✓ ' + name);
      } catch (err) {
        console.error('  ✗ ' + name);
        console.error('    ' + err.message);
        process.exitCode = 1;
      }
    },
    done(label) {
      console.log(`\n${label}：${passed} 项通过` + (process.exitCode ? '，存在失败项' : '，全部通过'));
    }
  };
}

module.exports = { createRunner };
