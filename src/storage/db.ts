import { createStore, del as d0, get as g0, getMany as gm, set as s0 } from 'idb-keyval';
import { EVENT } from '../event/flag';
import type { Owner, RamenRecord } from '../data/types';

export interface TeacherSettings { tinkerbell?: string; quality?: 'auto' | 'high' | 'mid' | 'low'; ai?: boolean; aiUrl?: string }

// 행사용은 같은 주소(doguri25.github.io)라도 따로 저장해요. 수업용 사장님·도감과 섞이지 않게
const store = EVENT ? createStore('ramen-event', 'kv') : undefined;
const get = <T>(k: string) => g0<T>(k, store);
const set = (k: string, v: unknown) => s0(k, v, store);
const del = (k: string) => d0(k, store);

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch (e) { console.warn('[db]', e); return fallback; } };

// 사장님 목록을 못 읽은 채로 덮어쓰면 반 전체 목록이 지워져요. 마지막 읽기가 실패했으면 쓰지 않아요
let ownersRead = true;

export const db = {
  async owners(): Promise<Owner[]> {
    try { const v = await get<Owner[]>('owners'); ownersRead = true; return v ?? []; } catch (e) { console.warn('[db]', e); ownersRead = false; return []; }
  },
  saveOwners: (o: Owner[]) => (ownersRead ? safe(set('owners', o).then(() => true), false) : (console.warn('[db] 목록을 못 읽어서 저장을 건너뛰어요'), Promise.resolve(false))),
  // 기록 불러오기용: 목록을 못 읽으면 조용히 빈 목록으로 넘어가지 않고 멈춰요
  async ownersOrThrow(): Promise<Owner[]> { const v = await get<Owner[]>('owners'); ownersRead = true; return v ?? []; },
  records: (ownerId: string) => safe(get<RamenRecord[]>('records:' + ownerId).then((v) => v ?? []), [] as RamenRecord[]),
  // 저장이 됐는지 알려 줘요 (공간이 모자라면 false)
  // 읽기가 한 번 실패해 빈 목록으로 시작했어도, 이미 저장된 그릇을 지우지 않게 합쳐서 저장해요
  saveRecords: (ownerId: string, r: RamenRecord[]) => safe((async () => {
    const cur = (await get<RamenRecord[]>('records:' + ownerId)) ?? [];
    const mine = new Set(r.map((x) => x.id));
    await set('records:' + ownerId, [...cur.filter((x) => !mine.has(x.id)), ...r]);
    return true;
  })(), false),
  photo: (key: string) => safe(get<Blob>('photo:' + key), undefined),
  savePhoto: (key: string, b: Blob) => safe(set('photo:' + key, b).then(() => true), false),
  photos: (keys: string[]) => safe(gm<Blob>(keys.map((k) => 'photo:' + k), store), [] as (Blob | undefined)[]),
  delPhoto: (key: string) => safe(del('photo:' + key), undefined),
  teacher: () => safe(get<TeacherSettings>('teacher').then((v) => v ?? {}), {} as TeacherSettings),
  saveTeacher: (t: TeacherSettings) => safe(set('teacher', t), undefined),
  async deleteOwner(id: string) {
    const treatKey = EVENT ? undefined : (await db.owners()).find((o) => o.id === id)?.treat?.photoKey;
    const recs = await db.records(id);
    for (const r of recs) await db.delPhoto(r.photoKey);
    await safe(del('records:' + id), undefined);
    const owners = (await db.owners()).filter((o) => o.id !== id);
    await db.saveOwners(owners);
    if (!EVENT) {
      // 수업용: 손님들이 끓여 준 라면 사진과 마음 골목 기록도 함께 지워요
      await db.delPhoto('treat-' + id);
      if (treatKey && treatKey !== 'treat-' + id) await db.delPhoto(treatKey); // 다른 태블릿에서 불러온 기록
      try { for (const k of ['folk', 'shop', 'quest', 'badge']) localStorage.removeItem(`ramen-alley-${k}:${id}`); } catch { /* 못 지워도 계속해요 */ }
    }
  },
};

export interface LocalSettings { sound: boolean; tts: boolean }
const LS = EVENT ? 'event-settings' : 'settings';
export const local = {
  get(): LocalSettings {
    try { return { sound: true, tts: false, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { sound: true, tts: false }; }
  },
  set(s: LocalSettings) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* 저장 못 해도 괜찮아요 */ } },
};
