import { useState } from 'react';
import { api, useApi } from '../../lib/api';
import { Swatch } from '../../components/Swatch';
import { FINISHES } from '../../../shared/catalog.js';
import type { Film } from '../../lib/types';

const EMPTY: Partial<Film> = { brand: '', name: '', finish: 'gloss', hex: '#888888', hex2: '#ffffff', price: 300, in_stock: true, featured: false };

export default function Films() {
  // Not the cached public list: admin edits must show immediately.
  const { data: films, reload } = useApi<Film[]>('/films');
  const [edit, setEdit] = useState<Partial<Film> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    try {
      if (edit.id) await api(`/admin/films/${edit.id}`, { method: 'PUT', body: edit });
      else await api('/admin/films', { body: edit });
      setEdit(null);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function quick(f: Film, patch: Partial<Film>) {
    await api(`/admin/films/${f.id}`, { method: 'PUT', body: patch });
    reload();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono mute">{films ? `${films.length} films · ${films.filter((f) => f.in_stock).length} in stock` : 'Loading…'}</p>
          <h1>Film library</h1>
        </div>
        <button className="btn sm accent" onClick={() => setEdit({ ...EMPTY })}>
          + Add film
        </button>
      </header>
      <p className="hint">These power the Studio and homepage. Out-of-stock films show as "back soon". Price is KES per sq ft of film.</p>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>Film</th>
              <th>Finish</th>
              <th className="num">KES / sq ft</th>
              <th>In stock</th>
              <th>Featured</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {films?.map((f) => (
              <tr key={f.id}>
                <td>
                  <Swatch film={f} size={28} />
                </td>
                <td>
                  <strong>{f.name}</strong>
                  <div className="mono mute">{f.brand}</div>
                </td>
                <td>{FINISHES.find((x) => x.id === f.finish)?.label}</td>
                <td className="num">{f.price.toLocaleString('en-KE')}</td>
                <td>
                  <input type="checkbox" className="switch" checked={f.in_stock} onChange={(e) => quick(f, { in_stock: e.target.checked })} aria-label={`${f.name} in stock`} />
                </td>
                <td>
                  <input type="checkbox" className="switch" checked={f.featured} onChange={(e) => quick(f, { featured: e.target.checked })} aria-label={`${f.name} featured`} />
                </td>
                <td className="num">
                  <button className="btn ghost sm" onClick={() => setEdit({ ...f })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="drawer-bg" onClick={() => setEdit(null)}>
          <aside className="drawer narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit film">
            <button className="drawer-x" onClick={() => setEdit(null)} aria-label="Close">
              ×
            </button>
            <div className="film-preview">
              <Swatch film={edit as Film} size={120} />
            </div>
            <h2>{edit.id ? 'Edit film' : 'New film'}</h2>
            <div className="d-sec grid2">
              <label className="field">
                <span>Brand</span>
                <input className="input" value={edit.brand || ''} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
              </label>
              <label className="field">
                <span>Name</span>
                <input className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Finish</span>
                <select className="input" value={edit.finish} onChange={(e) => setEdit({ ...edit, finish: e.target.value as Film['finish'] })}>
                  {FINISHES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>KES per sq ft</span>
                <input className="input" inputMode="decimal" value={edit.price ?? ''} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) || 0 })} />
              </label>
              <label className="field">
                <span>Colour</span>
                <input className="input color" type="color" value={edit.hex} onChange={(e) => setEdit({ ...edit, hex: e.target.value })} />
              </label>
              {edit.finish === 'shift' && (
                <label className="field">
                  <span>Shifts to</span>
                  <input className="input color" type="color" value={edit.hex2 || '#ffffff'} onChange={(e) => setEdit({ ...edit, hex2: e.target.value })} />
                </label>
              )}
              <label className="toggle">
                <input type="checkbox" checked={!!edit.in_stock} onChange={(e) => setEdit({ ...edit, in_stock: e.target.checked })} />
                <span>In stock</span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={!!edit.featured} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} />
                <span>Featured</span>
              </label>
            </div>
            {err && <p className="adm-err">{err}</p>}
            <div className="row-btns">
              <button className="btn accent sm" disabled={busy || !edit.name} onClick={save}>
                {busy ? 'Saving…' : 'Save film'}
              </button>
              {edit.id && (
                <button
                  className="danger"
                  onClick={async () => {
                    if (!confirm(`Delete ${edit.name}? Existing builds that use it will show "Unknown film".`)) return;
                    await api(`/admin/films/${edit.id}`, { method: 'DELETE' });
                    setEdit(null);
                    reload();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
