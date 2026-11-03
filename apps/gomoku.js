/** 五子棋插件：调用 wzq_move action，按 user_id 区分对局。 */
import plugin from '../../../lib/plugins/plugin.js';
import { post } from '../model/api.js';
import { imageSegment, render } from '../model/render.js';
import { getGame, setGame, getAssist, setAssist } from '../model/gomoku_store.js';
import { loadConfig } from '../model/config.js';
import Buttons from '../model/buttons.js';

const TAG = '五子棋';
const BOARD_TPL = 'Template/Gomoku/board';
const MENU_TPL = 'Template/Gomoku/menu';
const REQUEST_TIMEOUT_MS = 30_000;
const N = 15;

const DIFFICULTY = {
  简单: 'easy',
  普通: 'normal',
  困难: 'hard',
  easy: 'easy',
  normal: 'normal',
  hard: 'hard',
};

const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难' };

// 列字母 → 0 基列号（A=0 … O=14）
const LETTER_COL = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7, i: 8, j: 9, k: 10, l: 11, m: 12, n: 13, o: 14 };

const HELP_RE = '^#?五子棋(?:帮助|菜单|指令|说明|功能)$';
const RESET_RE = '^#?五子棋(?:重开|重制|重置|重新开始|再来一局)$';
const DIFF_RE = '^#?五子棋难度\\s*(简单|普通|困难|easy|normal|hard)$';
const SIDE_RE = '^#?五子棋(?:执黑|先手|执白|后手)$';
const ASSIST_RE = '^#?五子棋(开启|关闭)(?:推荐落子|推荐|辅助)$';
const PLACE_LETTER_RE = '^#?五子棋\\s+([a-oA-O])(1[0-5]|[1-9])\\s*$';
const PLACE_NUM_RE = '^#?五子棋\\s+([1-9]|1[0-5])[，,、\\s]+([1-9]|1[0-5])\\s*$';
const START_RE = '^#?五子棋(?:开始|新开|开局)(?:\\s*(简单|普通|困难|easy|normal|hard))?\\s*$';
const SHOW_RE = '^#?五子棋(?:\\s*(简单|普通|困难|easy|normal|hard))?\\s*$';

function blankBoard() {
  return Array.from({ length: N }, () => Array(N).fill(0));
}

function newGame(difficulty, me) {
  return {
    board: blankBoard(),
    me, // 1=玩家执黑(先手)，2=玩家执白(后手)
    turn: 1, // 黑先
    over: false,
    winner: 0, // 0 无 / 1 黑 / 2 白 / 3 和
    difficulty,
    lastMove: null, // { row, col, by: 'human'|'ai' }
    aiLast: null, // { row, col } AI 最近一手
    recommend: null, // { row, col } 最近一次推荐落点
    startedAt: Date.now(),
  };
}

function checkWin(board, r, c, p) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  return dirs.some(([dr, dc]) => {
    let n = 1;
    for (const s of [-1, 1]) {
      let rr = r + dr * s;
      let cc = c + dc * s;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr][cc] === p) {
        n++;
        rr += dr * s;
        cc += dc * s;
      }
    }
    return n >= 5;
  });
}

function isFull(board) {
  return board.every((row) => row.every((v) => v !== 0));
}

// 引擎坐标是 0 基 row/col；对外展示用 X=列、Y=行（1 基）
function coordName(row, col) {
  return `X=${col + 1}，Y=${row + 1}`;
}

function timeText() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 生成带 X/Y 坐标轴的棋盘 SVG —— 木质棋盘风格（同 /wzq 网页） */
function buildBoardSvg(game) {
  const CELL = 36;
  const PAD = 36;
  const GRID = CELL * (N - 1);
  const SIZE = PAD * 2 + GRID;
  const x = (col) => PAD + col * CELL;
  const y = (row) => PAD + row * CELL;
  const axisFont = "'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif";
  const wood = '#e3b877';
  const grid = '#6b4e2d';
  const axis = '#8a6a3f';

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push('<defs>');
  parts.push('<radialGradient id="sgB" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#4a4a4a"/><stop offset="100%" stop-color="#111111"/></radialGradient>');
  parts.push('<radialGradient id="sgW" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#dcdcdc"/></radialGradient>');
  parts.push('</defs>');

  // 木质棋盘底板
  parts.push(`<rect x="${x(0) - 9}" y="${y(0) - 9}" width="${GRID + 18}" height="${GRID + 18}" rx="12" fill="${wood}" stroke="#b08a52"/>`);

  // 网格线（深棕）
  for (let i = 0; i < N; i++) {
    parts.push(`<line x1="${x(0)}" y1="${y(i)}" x2="${x(N - 1)}" y2="${y(i)}" stroke="${grid}" stroke-width="1"/>`);
    parts.push(`<line x1="${x(i)}" y1="${y(0)}" x2="${x(i)}" y2="${y(N - 1)}" stroke="${grid}" stroke-width="1"/>`);
  }
  parts.push(`<rect x="${x(0)}" y="${y(0)}" width="${GRID}" height="${GRID}" fill="none" stroke="#5c4120" stroke-width="2"/>`);

  // 星位
  for (const [r, c] of [
    [3, 3],
    [3, 11],
    [11, 3],
    [11, 11],
    [7, 7],
  ]) {
    parts.push(`<circle cx="${x(c)}" cy="${y(r)}" r="3.8" fill="#5c4120"/>`);
  }

  // 棋子
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      const fill = p === 1 ? 'url(#sgB)' : 'url(#sgW)';
      const stroke = p === 1 ? 'rgba(0,0,0,0.55)' : '#b9b9b9';
      parts.push(`<circle cx="${x(c)}" cy="${y(r)}" r="15" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);
    }
  }

  // 最后一手标记：黑子用浅黄、白子用红
  if (game.lastMove) {
    const { row, col } = game.lastMove;
    const fill = game.board[row][col] === 1 ? '#f0c060' : '#d0432b';
    parts.push(`<circle cx="${x(col)}" cy="${y(row)}" r="4.6" fill="${fill}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>`);
  }

  // 坐标轴刻度（X 顶 / Y 左）
  for (let i = 0; i < N; i++) {
    parts.push(`<text x="${x(i)}" y="${PAD - 13}" text-anchor="middle" font-size="11" fill="${axis}" font-family="${axisFont}">${i + 1}</text>`);
    parts.push(`<text x="${PAD - 13}" y="${y(i) + 4}" text-anchor="end" font-size="11" fill="${axis}" font-family="${axisFont}">${i + 1}</text>`);
  }
  // 轴标题
  parts.push(`<text x="${SIZE / 2}" y="14" text-anchor="middle" font-size="13" font-weight="600" fill="#b3702f" font-family="${axisFont}">X</text>`);
  parts.push(`<text x="14" y="${SIZE / 2}" text-anchor="middle" font-size="13" font-weight="600" fill="#b3702f" font-family="${axisFont}" transform="rotate(-90 14 ${SIZE / 2})">Y</text>`);

  parts.push('</svg>');
  return parts.join('');
}

function buildParams(game) {
  const ai = 3 - game.me;
  let statusText;
  let statusTone = 'playing';
  if (game.over) {
    if (game.winner === game.me) {
      statusText = '你获胜了';
      statusTone = 'win';
    } else if (game.winner === ai) {
      statusText = 'AI 获胜';
      statusTone = 'lose';
    } else {
      statusText = '和棋';
      statusTone = 'draw';
    }
  } else {
    statusText = game.turn === game.me ? '轮到你落子' : 'AI 思考中…';
  }

  return {
    difficulty: DIFFICULTY_LABEL[game.difficulty] || '普通',
    meText: game.me === 1 ? '你执黑 · 先手' : '你执白 · 后手',
    statusText,
    statusTone,
    aiMoveVisible: Boolean(game.aiLast),
    aiMoveText: game.aiLast ? `AI 落子 ${coordName(game.aiLast.row, game.aiLast.col)}` : '',
    boardSvg: buildBoardSvg(game),
    hint: '#五子棋 H8 落子 · #五子棋重开 · #五子棋难度 困难',
    queryTime: timeText(),
  };
}

function buildMenuParams() {
  return {
    list: [
      { cmd: '#五子棋', desc: '开始 / 查看当前棋盘' },
      { cmd: '#五子棋开始 [难度]', desc: '新开一局（简单 / 普通 / 困难）' },
      { cmd: '#五子棋 H8', desc: '落子（列 A~O，行 1~15）' },
      { cmd: '#五子棋难度 困难', desc: '调整 AI 难度' },
      { cmd: '#五子棋执黑 / 执白', desc: '选择先后手' },
      { cmd: '#五子棋开启辅助 / 关闭辅助', desc: '开关推荐落子' },
      { cmd: '#五子棋重开', desc: '重开本局' },
    ],
    note: '坐标：X=列（1~15，左→右），Y=行（1~15，上→下）；列也可用字母 A~O（A=1，H=8，O=15）。',
    recommendNote: '推荐落子（辅助）：AI 落子后会自动附带「推荐」按钮，点一下即可按建议落子；可用 #五子棋开启辅助 / #五子棋关闭辅助 随时开关。',
    hint: '回复 #五子棋 开始对局',
  };
}

export class Gomoku extends plugin {
  constructor() {
    super({
      name: '五子棋',
      dsc: '调用 wzq_move 的五子棋对弈',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: HELP_RE, fnc: 'help' },
        { reg: RESET_RE, fnc: 'reset' },
        { reg: ASSIST_RE, fnc: 'toggleAssist' },
        { reg: DIFF_RE, fnc: 'setDifficulty' },
        { reg: SIDE_RE, fnc: 'setSide' },
        { reg: PLACE_LETTER_RE, fnc: 'placeLetter' },
        { reg: PLACE_NUM_RE, fnc: 'placeNum' },
        { reg: START_RE, fnc: 'start' },
        { reg: SHOW_RE, fnc: 'showOrStart' },
      ],
    });
  }

  async help(e) {
    const diff = this.currentDifficulty(e);
    try {
      const image = await render(e, MENU_TPL, buildMenuParams(), { retType: 'base64' });
      await e.reply([imageSegment(image), Buttons.gomokuHelp(diff)], true);
      return true;
    } catch (err) {
      logger.warn(`[${TAG}] 菜单图片渲染失败，回退文字：${err.message}`);
    }
    await e.reply([this.helpText(), Buttons.gomokuHelp(diff)], true);
    return true;
  }

  /** 当前难度（中文标签），无对局时默认「简单」 */
  currentDifficulty(e) {
    const game = getGame(String(e.user_id));
    return DIFFICULTY_LABEL[game?.difficulty] || '简单';
  }

  /** 该用户是否开启推荐落子（辅助）：按 user_id 存 Map，未设置时用配置默认值 */
  assistOn(userId) {
    const v = getAssist(userId);
    return v === undefined ? loadConfig().gomoku_recommend !== false : v;
  }

  helpText() {
    return [
      '【五子棋】',
      '#五子棋 —— 开始 / 查看当前棋盘',
      '#五子棋开始 [难度] —— 新开一局',
      '#五子棋 <坐标> —— 落子，如 #五子棋 H8 或 #五子棋 8 8',
      '#五子棋难度 简单|普通|困难 —— 调整难度',
      '#五子棋执黑 / #五子棋执白 —— 选择先后手',
      '#五子棋重开 —— 重开本局',
      '#五子棋开启辅助 / #五子棋关闭辅助 —— 开关推荐落子',
      '',
      '坐标：X=列（1~15，左→右），Y=行（1~15，上→下）',
      '列也可用字母 A~O（A=1，H=8，O=15）',
      '黑先，连续五子获胜（无禁手）',
    ].join('\n');
  }

  async showOrStart(e) {
    const m = e.msg.match(SHOW_RE);
    const diff = DIFFICULTY[m?.[1] || ''];
    const userId = String(e.user_id);
    if (diff) {
      await this.beginGame(e, diff, 1);
      return true;
    }
    const game = getGame(userId);
    if (game) {
      const aiRes = await this.advanceAi(game, userId); // 若轮到 AI（例如上次 AI 未响应），顺带推进
      await this.replyBoard(e, game, aiRes.ok ? '' : `⚠ AI 未响应：${aiRes.error}`);
      return true;
    }
    await this.beginGame(e, 'normal', 1);
    return true;
  }

  async start(e) {
    const m = e.msg.match(START_RE);
    const diff = DIFFICULTY[m?.[1] || ''] || 'normal';
    await this.beginGame(e, diff, 1);
    return true;
  }

  async reset(e) {
    const game = getGame(String(e.user_id));
    await this.beginGame(e, game ? game.difficulty : 'normal', game ? game.me : 1);
    return true;
  }

  async setDifficulty(e) {
    const m = e.msg.match(DIFF_RE);
    const diff = DIFFICULTY[m[1]];
    const userId = String(e.user_id);
    const game = getGame(userId);
    if (game) {
      game.difficulty = diff;
      await e.reply(`难度已改为「${DIFFICULTY_LABEL[diff]}」，AI 后续落子按此难度。`, true);
    } else {
      await this.beginGame(e, diff, 1);
    }
    return true;
  }

  async setSide(e) {
    const m = e.msg.match(SIDE_RE);
    const me = /黑|先手/.test(m[0]) ? 1 : 2;
    const game = getGame(String(e.user_id));
    await this.beginGame(e, game ? game.difficulty : 'normal', me);
    return true;
  }

  /** 开启/关闭推荐落子（辅助） */
  async toggleAssist(e) {
    const m = e.msg.match(ASSIST_RE);
    const enable = m[1] === '开启';
    const userId = String(e.user_id);
    setAssist(userId, enable);
    if (!enable) {
      const game = getGame(userId);
      if (game) game.recommend = null;
    }
    await e.reply(`推荐落子已${enable ? '开启' : '关闭'}。${enable ? 'AI 落子后会自动附带推荐按钮。' : ''}`, true);
    return true;
  }

  async placeLetter(e) {
    const m = e.msg.match(PLACE_LETTER_RE);
    const col = LETTER_COL[m[1].toLowerCase()];
    const row = parseInt(m[2], 10) - 1;
    return this.place(e, row, col);
  }

  async placeNum(e) {
    const m = e.msg.match(PLACE_NUM_RE);
    const col = parseInt(m[1], 10) - 1;
    const row = parseInt(m[2], 10) - 1;
    return this.place(e, row, col);
  }

  async beginGame(e, difficulty, me) {
    const game = newGame(difficulty, me);
    setGame(String(e.user_id), game);
    const aiRes = await this.advanceAi(game, String(e.user_id));
    await this.replyBoard(e, game, aiRes.ok ? '' : `⚠ AI 未响应：${aiRes.error}`);
    return true;
  }

  async place(e, row, col) {
    const userId = String(e.user_id);
    const game = getGame(userId);
    if (!game) {
      await e.reply(['你还没有开始对局，发送 #五子棋 开始。', Buttons.gomokuHelp('简单')], true);
      return true;
    }
    if (game.over) {
      await e.reply(['本局已结束，发送 #五子棋重开 再来一局。', Buttons.gomokuBoard(game, this.assistOn(userId))], true);
      return true;
    }
    if (game.turn !== game.me) {
      await e.reply('还没轮到你落子（AI 思考中…）。', true);
      return true;
    }
    if (game.board[row][col]) {
      await e.reply('该位置已有棋子，换个位置吧。', true);
      return true;
    }

    game.board[row][col] = game.me;
    game.recommend = null; // 已落子，清除推荐标记
    game.lastMove = { row, col, by: 'human' };
    if (checkWin(game.board, row, col, game.me)) {
      game.over = true;
      game.winner = game.me;
    } else if (isFull(game.board)) {
      game.over = true;
      game.winner = 3;
    } else {
      game.turn = 3 - game.me;
    }

    const aiRes = await this.advanceAi(game, userId);
    await this.replyBoard(e, game, aiRes.ok ? '' : `⚠ AI 未响应：${aiRes.error}`);
    return true;
  }

  /** 轮到 AI 时请求 wzq_move 并落子；返回 { ok, error? } */
  async advanceAi(game, userId) {
    const ai = 3 - game.me;
    if (game.over || game.turn !== ai) return { ok: true };

    let m;
    try {
      m = await post(
        'wzq_move',
        { board: game.board, difficulty: game.difficulty, aiColor: ai, turn: ai, recommend: this.assistOn(userId) },
        REQUEST_TIMEOUT_MS
      );
    } catch (err) {
      logger.warn(`[${TAG}] AI 请求失败：${err.message}`);
      // 保持 turn = ai，玩家再发 #五子棋 即可重试
      return { ok: false, error: err.message };
    }

    const row = Number(m.row);
    const col = Number(m.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= N || col < 0 || col >= N || game.board[row][col]) {
      return { ok: false, error: 'AI 返回非法坐标' };
    }

    game.board[row][col] = ai;
    game.lastMove = { row, col, by: 'ai' };
    game.aiLast = { row, col };

    // 推荐落子：服务端在 AI 落子后一并返回的对手下一步（普通强度）
    game.recommend = null;
    const rec = m.recommend;
    if (rec && Number.isInteger(Number(rec.row)) && Number.isInteger(Number(rec.col))) {
      game.recommend = { row: Number(rec.row), col: Number(rec.col) };
    }

    if (checkWin(game.board, row, col, ai)) {
      game.over = true;
      game.winner = ai;
      game.recommend = null;
    } else if (isFull(game.board)) {
      game.over = true;
      game.winner = 3;
      game.recommend = null;
    } else {
      game.turn = game.me;
    }
    return { ok: true };
  }

  async replyBoard(e, game, note = '') {
    const userId = String(e.user_id);
    const params = buildParams(game);
    if (note) params.noteText = note;
    try {
      const image = await render(e, BOARD_TPL, params, { retType: 'base64' });
      await e.reply([imageSegment(image), Buttons.gomokuBoard(game, this.assistOn(userId))], true);
      return true;
    } catch (err) {
      logger.warn(`[${TAG}] 棋盘渲染失败，回退文字：${err.message}`);
    }
    await e.reply([this.textBoard(game), Buttons.gomokuBoard(game, this.assistOn(userId))], true);
    return true;
  }

  textBoard(game) {
    const sym = ['·', '●', '○'];
    const head = [`【五子棋】${DIFFICULTY_LABEL[game.difficulty]} · ${game.me === 1 ? '你执黑' : '你执白'}`];
    if (game.aiLast) head.push(`AI 落子 ${coordName(game.aiLast.row, game.aiLast.col)}`);
    const rows = game.board.map((r, i) => `${String(i + 1).padStart(2)} ${r.map((v) => sym[v]).join('')}`);
    return [...head, ...rows, 'X → 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15', '发送 #五子棋 H8 落子 · #五子棋重开'].join('\n');
  }
}
