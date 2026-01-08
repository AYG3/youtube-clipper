/**
 * Child process utilities
 */

/**
 * Kill a child process and its process group
 * @param {ChildProcess} childProc
 * @param {string} reason
 */
function killChildProcess(childProc, reason = 'unknown') {
  if (childProc && typeof childProc.pid === 'number') {
    try {
      // Negative pid kills the entire process group on POSIX
      process.kill(-childProc.pid, 'SIGINT');
    } catch (e) {
      try {
        childProc.kill('SIGINT');
      } catch (err) {
        console.warn('Failed to kill child process:', err && err.message);
      }
    }
  }
}

module.exports = {
  killChildProcess
};
