import { del, get, set } from 'idb-keyval';
import type { Owner, RamenRecord } from '../data/types';

export interface TeacherSettings { tinkerbell?: string; quality?: 'auto' | 'high' | 'mid' | 'low' }

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch (e) { console.warn('[db]', e); return fallback; } };

export const db = {
  owners: () => safe(get<Owner[]>('owners').then((v) => v ?? []), [] as Owner[]),
  saveOwners: (o: Owner[]) => safe(set('owners', o), undefined),
  records: (ownerId: string) => safe(get<RamenRecord[]>('records:' + ownerId).then((v) => v ?? []), [] as RamenRecord[]),
  saveRecords: (ownerId: string, r: RamenRecord[]) => safe(set('records:' + ownerId, r), undefined),
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
export const local = {
  get(): LocalSettings {
    try { return { sound: true, tts: false, ...JSON.parse(localStorage.getItem('settings') || '{}') }; } catch { return { sound: true, tts: false }; }
  },
  set(s: LocalSettings) { try { localStorage.setItem('settings', JSON.stringify(s)); } catch { /* 저장 못 해도 괜찮아요 */ } },
};
