/** 交互按钮：callback/input 均复用现有指令，按钮不可用时仍可手动发送命令。 */
const STYLE = 4;

const callback = (text, command) => ({ text, callback: command, style: STYLE });
const input = (text, command) => ({ text, input: command, style: STYLE });

// 0 基坐标 → 五子棋指令坐标（两个数字：列,行，1 起）
const coordCmd = (row, col) => `${col + 1},${row + 1}`;

export default new (class Buttons {
  novelHelp() {
    return segment.button(
      [input('🔍 联合搜索', '#搜小说 '), input('🍅 番茄搜索', '#搜番茄 '), input('🐱 七猫搜索', '#搜七猫 ')],
      [input('📥 序号下载', '#小说下载 '), input('📖 起点下载', '#起点下载 '), input('📖 七猫下载', '#七猫下载 ')],
      [input('📖 番茄下载', '#番茄下载 '), callback('❓ 使用帮助', '#小说帮助')]
    );
  }

  novelSearch(total) {
    const count = Math.min(16, Math.max(0, Number(total) || 0));
    if (!count) return null;

    const items = Array.from({ length: count }, (_, index) => callback(`📥 ${index + 1}`, `#小说下载 ${index + 1}`));
    const rows = [];
    for (let index = 0; index < items.length; index += 4) rows.push(items.slice(index, index + 4));
    rows.push([callback('❓ 使用帮助', '#小说帮助')]);
    return segment.button(...rows);
  }

  kugouHelp() {
    return segment.button(
      [callback('🔐 扫码登录', '#酷狗登录'), callback('🔄 刷新登录', '#酷狗刷新'), callback('👤 我的酷狗', '#我的酷狗')],
      [input('🎵 提交刷歌', '#酷狗提交刷歌 '), callback('⏹ 停止刷歌', '#酷狗停止刷歌'), callback('↩️ 取消登录', '#酷狗取消登录')],
      [callback('❓ 使用帮助', '#酷狗帮助')]
    );
  }

  kugouLogin() {
    return segment.button([callback('↩️ 取消登录', '#酷狗取消登录'), callback('❓ 使用帮助', '#酷狗帮助')]);
  }

  kugouNoLogin() {
    return segment.button([callback('🔐 扫码登录', '#酷狗登录'), callback('❓ 使用帮助', '#酷狗帮助')]);
  }

  kugouAccount(running = false) {
    const taskButton = running ? callback('⏹ 停止刷歌', '#酷狗停止刷歌') : input('🎵 提交刷歌', '#酷狗提交刷歌 ');
    return segment.button(
      [taskButton, callback('🔄 刷新登录', '#酷狗刷新'), callback('👤 我的酷狗', '#我的酷狗')],
      [callback('❓ 使用帮助', '#酷狗帮助')]
    );
  }

  gomokuHelp(difficulty = '简单') {
    return segment.button(
      [callback('🎮 开始对局', `#五子棋开始 ${difficulty}`), callback('♟️ 执黑先手', '#五子棋执黑'), callback('⚪ 执白后手', '#五子棋执白')],
      [callback('😊 简单', '#五子棋难度 简单'), callback('🙂 普通', '#五子棋难度 普通'), callback('😈 困难', '#五子棋难度 困难')],
      [callback('💡 开启辅助', '#五子棋开启辅助'), callback('🔕 关闭辅助', '#五子棋关闭辅助')],
      [input('📍 输入坐标', '#五子棋 '), callback('🔄 重开', '#五子棋重开'), callback('❓ 使用帮助', '#五子棋帮助')]
    );
  }

  gomokuBoard(game, assistOn = true) {
    const active = Boolean(game && !game.over);
    const rows = [];
    if (active) {
      rows.push([input('📍 输入坐标', '#五子棋 '), callback('🔄 重开', '#五子棋重开'), callback('❓ 使用帮助', '#五子棋帮助')]);
      rows.push([callback('😊 简单', '#五子棋难度 简单'), callback('🙂 普通', '#五子棋难度 普通'), callback('😈 困难', '#五子棋难度 困难')]);
      rows.push([callback('♟️ 执黑先手', '#五子棋执黑'), callback('⚪ 执白后手', '#五子棋执白'), assistOn === false ? callback('💡 开启辅助', '#五子棋开启辅助') : callback('🔕 关闭辅助', '#五子棋关闭辅助')]);
      // 推荐落子：点按钮直接把坐标输入并落子
      if (game.recommend && game.turn === game.me) {
        const cmd = coordCmd(game.recommend.row, game.recommend.col);
        rows.push([callback(`💡 推荐 ${cmd}`, `#五子棋 ${cmd}`)]);
      }
    } else {
      rows.push([callback('🔄 再来一局', '#五子棋重开'), callback('🎮 新开一局', '#五子棋开始'), callback('❓ 使用帮助', '#五子棋帮助')]);
    }
    return segment.button(...rows);
  }
})();