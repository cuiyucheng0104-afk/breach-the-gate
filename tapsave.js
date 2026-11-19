// TapTap 云存档：在 TapTap 里玩时，把闯关进度、锦标赛、卡组、教学记录、每日挑战和积分同步到玩家的 TapTap 账号，换手机、清缓存不丢。
// 只在 TapTap 的容器里生效（有全局 tap 对象）；浏览器里打开什么都不做。接口说明：TapTap 小游戏文档「云存档接入指南」。
// 规则：本机存档每变一次记一个时间（本机记在 yibu-fanpan.cloud.v1，云上记在存档的 extra 里），两边谁新用谁。
//   开局：云上更新 → 写进本机再刷新一次页面（游戏模块是载入时读存档的）；本机更新 → 上传。
//   之后每分钟看一次本机有没有变，变了就上传（TapTap 限制一分钟最多传一次）；切到后台时也补传一次。
const KEYS = ['decks.v1', 'campaign.v1', 'cup.v1', 'tutorial.v1', 'diff.v1', 'daily.v1', 'rating.v1'].map(k => 'yibu-fanpan.' + k), STAMP = 'yibu-fanpan.cloud.v1', NAME = 'progress';
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const call = (o, m, a = {}) => new Promise((ok, no) => o[m]({ ...a, success: ok, fail: no })); // 回调风格包成 Promise：文件接口不一定支持 Promise 风格

export function start(tap, ls = localStorage, { now = () => Date.now(), reload = () => location.reload(), every = 61000, late = 30000 } = {}) {
  const cloud = tap.getCloudSaveManager(), fs = tap.getFileSystemManager(), file = `${tap.env.USER_DATA_PATH}/${NAME}.json`, t0 = now();
  const snap = () => JSON.stringify(Object.fromEntries(KEYS.map(k => [k, ls.getItem(k)])));
  const stamp = () => { try { return JSON.parse(ls.getItem(STAMP)) || null; } catch { return null; } }, setStamp = v => ls.setItem(STAMP, JSON.stringify(v));
  const mark = () => { const s = snap(), h = hash(s), st = stamp(); // 本机存档变了就记下变的时间；从来没存过东西的新机器记 0，让云上的赢
    if (!st || st.hash !== h) setStamp({ at: !st && KEYS.every(k => ls.getItem(k) === null) ? 0 : now(), hash: h, sent: st?.sent || 0 });
    return stamp(); };
  let uuid = null, last = 0, busy = Promise.resolve(); // busy：云存档接口不许并发，全部排队
  const queue = f => (busy = busy.then(f, f));
  const upload = () => queue(async () => { const st = mark(); if (st.at <= st.sent || now() - last < 60000) return false;
    last = now(); await call(fs, 'writeFile', { filePath: file, data: snap(), encoding: 'utf8' });
    const a = { archiveMetaData: { name: NAME, summary: '攻破城门的进度', extra: JSON.stringify({ at: st.at }), playtime: 0 }, archiveFilePath: file };
    uuid = (uuid ? await call(cloud, 'updateArchive', { ...a, archiveUUID: uuid }) : await call(cloud, 'createArchive', a)).uuid || uuid;
    setStamp({ ...stamp(), sent: st.at }); return true; }).catch(() => false); // 传失败（没网、超频）就等下一分钟再试
  const ready = queue(async () => { const st = mark(), res = await call(cloud, 'getArchiveList'), c = (res.saves || []).find(x => x.name === NAME);
    if (!c) return 'none'; uuid = c.uuid; const at = (() => { try { return JSON.parse(c.extra).at || 0; } catch { return 0; } })();
    if (at <= st.at) return 'local';
    if (now() - t0 > late) return 'late'; // shortcut: 网太慢、玩家已经开打了就不刷新页面打断他，下次打开再说；本机这期间存的东西会更新，反过来盖掉云上（换新机器时网特别慢才会遇到）
    const got = await call(cloud, 'getArchiveData', { archiveUUID: c.uuid, archiveFileId: c.fileId, targetFilePath: file });
    const data = JSON.parse((await call(fs, 'readFile', { filePath: got.filePath || file, encoding: 'utf8' })).data);
    for (const k of KEYS) data[k] == null ? ls.removeItem(k) : ls.setItem(k, data[k]);
    setStamp({ at, hash: hash(snap()), sent: at }); reload(); return 'cloud'; }).catch(() => 'error');
  ready.then(r => r !== 'cloud' && upload());
  const timer = setInterval(upload, every);
  const hide = () => { if (document.visibilityState === 'hidden') upload(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', hide);
  return { ready, upload, stop: () => { clearInterval(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', hide); } };
}

if (typeof tap !== 'undefined' && tap.getCloudSaveManager && tap.getFileSystemManager) try { start(tap); } catch { /* 云存档出错不影响玩 */ }
