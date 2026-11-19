// 云存档自检：用假的 tap 对象和假的本机存储，跑「新机器拉云存档」「老玩家首次上传」「本机变了再上传」「一分钟限频」四种情况。
// 用法：node tools/tapsave_check.mjs
import { start } from '../tapsave.js';
const assert = (c, m) => { if (!c) throw new Error('云存档自检失败：' + m); };
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
function fakeTap(saves = []) { // 云上：saves 列表 + 文件内容；本机文件系统：一个 Map
  const files = new Map(), blobs = new Map(saves.map(s => [s.fileId, s.body])), log = [];
  const ok = (a, r) => setTimeout(() => a.success(r)); let n = 0;
  return { log, saves, env: { USER_DATA_PATH: 'tapfile://usr' },
    getFileSystemManager: () => ({ writeFile: a => { files.set(a.filePath, a.data); ok(a, {}); }, readFile: a => ok(a, { data: files.get(a.filePath) }) }),
    getCloudSaveManager: () => ({
      getArchiveList: a => ok(a, { saves: saves.map(({ body, ...s }) => s) }),
      getArchiveData: a => { files.set(a.targetFilePath, blobs.get(a.archiveFileId)); ok(a, { filePath: a.targetFilePath }); },
      createArchive: a => { log.push('create'); const s = { uuid: 'u1', fileId: 'f' + ++n, name: a.archiveMetaData.name, extra: a.archiveMetaData.extra }; saves.push(s); blobs.set(s.fileId, files.get(a.archiveFilePath)); ok(a, { uuid: 'u1', fileId: s.fileId }); },
      updateArchive: a => { log.push('update'); const s = saves.find(x => x.uuid === a.archiveUUID); s.fileId = 'f' + ++n; s.extra = a.archiveMetaData.extra; blobs.set(s.fileId, files.get(a.archiveFilePath)); ok(a, { uuid: s.uuid, fileId: s.fileId }); } }) };
}
const tick = () => new Promise(r => setTimeout(r, 5));
let clock = 1e12; const now = () => clock;

// 1. 老玩家（本机有进度、没有云存档）→ 上传一份
{ const ls = store({ 'yibu-fanpan.campaign.v1': '{"won":3}' }), tap = fakeTap(), s = start(tap, ls, { now, reload: () => assert(false, '不该刷新'), every: 1e9 });
  assert(await s.ready === 'none', '应当没有云存档'); await tick(); await tick();
  assert(tap.log.join() === 'create', '老玩家应当创建云存档：' + tap.log);
  // 2. 一分钟内本机又变了 → 不传；过了一分钟 → 更新
  ls.setItem('yibu-fanpan.campaign.v1', '{"won":4}'); clock += 1000; assert(await s.upload() === false, '一分钟内不该再传');
  clock += 60000; assert(await s.upload() === true, '过了一分钟应当上传'); assert(tap.log.join() === 'create,update', '应当更新：' + tap.log);
  assert(await s.upload() === false, '没变化不该再传'); s.stop();
  // 3. 换新机器（本机空）→ 拉下云存档、刷新一次
  const ls2 = store(); let reloaded = 0; clock += 1000;
  const s2 = start(fakeTap(tap.saves.map(x => ({ ...x, body: JSON.stringify({ 'yibu-fanpan.campaign.v1': '{"won":4}' }) }))), ls2, { now, reload: () => reloaded++, every: 1e9 });
  assert(await s2.ready === 'cloud' && reloaded === 1, '新机器应当拉云存档并刷新');
  assert(ls2.getItem('yibu-fanpan.campaign.v1') === '{"won":4}', '进度没写进本机'); s2.stop();
  // 4. 刷新之后再启动：两边一样，不再刷新、不再上传
  const tap3 = fakeTap(tap.saves.map(x => ({ ...x, body: '{}' }))), s3 = start(tap3, ls2, { now, reload: () => assert(false, '不该反复刷新'), every: 1e9 });
  assert(await s3.ready === 'local', '刷新后应当认本机'); await tick(); await tick(); assert(!tap3.log.length, '没变化不该上传：' + tap3.log); s3.stop(); }
console.log('云存档自检通过');
