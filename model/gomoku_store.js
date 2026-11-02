/** 五子棋对局状态存储。
 * 必须放在 plugin 类之外（模块级单例）—— 云崽每次消息都可能重新实例化插件类，
 * 若把 Map 放进 constructor 里，每条消息都会把对局状态重置掉。
 * 这里用模块级 Map，进程生命周期内持久，按 user_id 隔离。 */
const games = new Map();

function getGame(userId) {
  return games.get(String(userId));
}

function setGame(userId, game) {
  games.set(String(userId), game);
}

function deleteGame(userId) {
  games.delete(String(userId));
}

export { games, getGame, setGame, deleteGame };
