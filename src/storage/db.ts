import { createStore, del as d0, get as g0, set as s0 } from 'idb-keyval';
import { EVENT } from '../event/flag';
import type { Owner, RamenRecord } from '../data/types';

export interface TeacherSettings { tinkerbell?: string; quality?: 'auto' | 'high' | 'mid' | 'low'; ai?: boolean; aiUrl?: string }

// 행사용은 같은 주소(doguri25.github.io)라도 따로 저장해요. 수업용 사장님·도감과 섞이지 않게
const store = EVENT ? createStore('ramen-event', 'kv') : undefined;
const get = <T>(k: string) => g0<T>(k, store);
const set = (k: string, v: unknown) => s0(k, v, store);
const del = (k: string) => d0(k, store);

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch (e) { console.warn('[db]', e); return fallback; } };

export const db = {
  owners: () => safe(get<Owner[]>('owners').then((v) => v ?? []), [] as Owner[]),
  saveOwners: (o: Owner[]) => safe(set('owners', o), undefined),
  records: (ownerId: string) => safe(get<RamenRecord[]>('records:' + ownerId).then((v) => v ?? []), [] as RamenRecord[]),
  // 저장이 됐는지 알려 줘요 (공간이 모자라면 false)
  saveRecords: (ownerId: string, r: RamenRecord[]) => safe(set('records:' + ownerId, r).then(() => true), false),
  photo: (key: string) => safe(get<Blob>('photo:' + key), undefined),
  savePhoto: (key: string, b: Blob) => safe(set('photo:' + key, b), undefined),
  delPhoto: (key: string) => safe(del('photo:' + key), undefined),
  teacher: () => safe(get<TeacherSettings>('teacher').then((v) => v ?? {}), {} as TeacherSettings),
  saveTeacher: (t: TeacherSettings) => safe(set('teacher', t), undefined),
  async deleteOwner(id: string) {
    const recs = await db.records(id);
    for (const r of recs) await db.delPhoto(r.photoKey);
    await safe(del('records:' + id), undefined);
    const owners = (await db.owners()).filter((o) => o.id !== id);
    await db.saveOwners(owners);
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
