import { Novel } from './apps/novel.js';
import { Kugou } from './apps/kugou.js';
import { Gomoku } from './apps/gomoku.js';
import { loadConfig } from './model/config.js';
// 启动时立即生成配置（若 config/novel.yaml 不存在），避免只在首次调用功能时才生成
loadConfig();
logger.mark(`===============`);
logger.mark(`${logger.blue('[书音插件]')} author Senior Horikawa ！！！`);
logger.mark(`${logger.blue('[书音插件]')} version 0.0.1`);
logger.mark(`${logger.blue(`[书音插件]`)} repository https://github.com/SeniorHorikawa/Shuyin-Plugin`);
logger.mark(`===============`);
let apps = {};
apps[Novel.name] = Novel;
apps[Kugou.name] = Kugou;
apps[Gomoku.name] = Gomoku;
export { apps };
