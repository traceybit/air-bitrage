/* air-bitrage frontend — hash-routed SPA, no dependencies.
   Routes:  #/            home / flight finder
            #/f/UA1492/2026-07-15   flight board
            #/l/3         listing detail                       */

const $app = document.getElementById('app');

const CATEGORIES = [
  ['seat-swap', 'seat swaps', 'trade seats so families sit together — or you finally get that window'],
  ['recline', 'recline agreements', 'pay (or get paid) to keep the seat in front of you upright'],
  ['rebooking', 'voluntary rebooking', 'take a later flight in exchange for compensation'],
  ['lounge', 'lounge access', 'day passes resold peer-to-peer at a discount'],
  ['upgrade', 'upgrades', 'miles and confirmed upgrades, brokered between passengers'],
  ['other', 'everything else', 'the gate and beyond'],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(([k, label]) => [k, label]));

// ---------- utilities ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(n) {
  if (n == null) return '';
  return '$' + (Number.isInteger(n) ? n : n.toFixed(2));
}

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

async function api(path, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

function kindBadge(l) {
  return l.kind === 'offer'
    ? '<span class="badge offer">offering</span>'
    : '<span class="badge request">seeking</span>';
}

function statusBadge(l) {
  if (l.status === 'deal') return '<span class="badge deal">deal made</span>';
  if (l.status === 'closed') return '<span class="badge closed">closed</span>';
  return '';
}

function showError(err) {
  const box = document.getElementById('error-box');
  if (box) { box.textContent = err.message; box.hidden = false; }
  else alert(err.message);
}

// ---------- router ----------

window.addEventListener('hashchange', route);
route();

function route() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 'f' && parts[1] && parts[2]) return renderBoard(parts[1], parts[2]);
  if (parts[0] === 'l' && parts[1]) return renderListing(parts[1]);
  renderHome();
}

// ---------- views ----------

async function renderHome() {
  const today = new Date().toISOString().slice(0, 10);
  $app.innerHTML = `
    <section class="hero">
      <h1>Your flight is full of deals waiting to happen.</h1>
      <p>The person in 14B would take a later flight for $150. The family in row 20 wants
      to sit together. 9C would pay real money for four hours of upright seatback.
      Post it, price it, make the deal at the gate.</p>
    </section>

    <form id="finder" class="finder card">
      <label>flight <input name="flight" placeholder="UA1492" required autocomplete="off"></label>
      <label>date <input name="date" type="date" value="${today}" required></label>
      <button type="submit">go to your flight board →</button>
    </form>

    <section id="boards"><p class="muted">loading active boards…</p></section>

    <section class="cats card">
      <h2>what trades here</h2>
      <ul>
        ${CATEGORIES.map(([, label, blurb]) => `<li><strong>${esc(label)}</strong> — ${esc(blurb)}</li>`).join('')}
      </ul>
    </section>`;

  document.getElementById('finder').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const flight = String(f.get('flight')).toUpperCase().replace(/\s+/g, '');
    location.hash = `#/f/${flight}/${f.get('date')}`;
  });

  try {
    const flights = await api('/api/flights');
    const boards = document.getElementById('boards');
    const real = flights.filter(b => !b.demo);
    const demo = flights.filter(b => b.demo);

    const boardLine = b => `
      <li><a href="#/f/${esc(b.flight)}/${esc(b.date)}">${esc(b.flight)} · ${esc(fmtDate(b.date))}</a>
      <span class="muted">— ${b.open} open listing${b.open === 1 ? '' : 's'}${b.deals ? `, ${b.deals} deal${b.deals === 1 ? '' : 's'} made` : ''}</span></li>`;

    boards.innerHTML = `
      <h2>boards with action right now</h2>
      ${real.length
        ? `<ul class="board-list">${real.map(boardLine).join('')}</ul>`
        : '<p class="muted">no boards yet — enter your flight above and post the first listing to start one.</p>'}
      ${demo.length ? `
        <div class="demo-card">
          <p><span class="badge demo">example</span> <strong>Not sure how this works?</strong>
          Poke around the example board below — it's fake data on a fake flight, kept separate
          from real boards.</p>
          <ul class="board-list">${demo.map(boardLine).join('')}</ul>
        </div>` : ''}`;
  } catch (err) { showError(err); }
}

async function renderBoard(flight, date) {
  $app.innerHTML = '<p class="muted">loading board…</p>';
  let listings;
  try {
    listings = await api(`/api/listings?flight=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}`);
  } catch (err) {
    $app.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return;
  }

  const active = listings.filter(l => l.status !== 'closed');
  const byCat = {};
  for (const l of active) (byCat[l.category] ||= []).push(l);
  const isDemo = active.length > 0 && active.every(l => l.demo);

  $app.innerHTML = `
    <p><a href="#/">← all flights</a></p>
    <div class="board-head">
      <h1>${esc(flight)} <span class="muted">· ${esc(fmtDate(date))}</span>
        ${isDemo ? '<span class="badge demo">example board</span>' : ''}</h1>
      <button id="toggle-post">+ post a listing</button>
    </div>
    ${isDemo ? `
      <div class="demo-card"><span class="badge demo">example</span>
      This is a demo board with made-up listings on a made-up flight, here to show how
      air-bitrage works. <a href="#/">Find your real flight</a> to start a real board.</div>` : ''}
    <div id="error-box" class="error" hidden></div>

    <form id="post-form" class="card" hidden>
      <h2>post to this board</h2>
      <div class="row">
        <label>I am <select name="kind">
          <option value="offer">offering</option>
          <option value="request">seeking</option>
        </select></label>
        <label>category <select name="category">
          ${CATEGORIES.map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('')}
        </select></label>
        <label>price (optional) <input name="price" placeholder="$25" inputmode="decimal"></label>
      </div>
      <label>title <input name="title" required maxlength="120" placeholder="Will pay you $15 to keep seat 8C upright"></label>
      <label>details <textarea name="details" rows="3" placeholder="terms, seat numbers, where to meet…"></textarea></label>
      <div class="row">
        <label>your name <input name="name" required></label>
        <label>your seat <input name="seat" placeholder="14B"></label>
      </div>
      <button type="submit">post listing</button>
    </form>

    ${active.length === 0 ? '<p class="muted">nothing posted for this flight yet — be the first.</p>' : ''}
    ${CATEGORIES.filter(([k]) => byCat[k]).map(([k, label]) => `
      <section class="cat-group">
        <h2>${esc(label)}</h2>
        <ul class="listing-list">
          ${byCat[k].map(l => `
            <li class="${l.status !== 'open' ? 'inactive' : ''}">
              ${kindBadge(l)} <a href="#/l/${l.id}">${esc(l.title)}</a>
              ${l.price != null ? `<strong class="price">${money(l.price)}</strong>` : ''}
              <span class="muted">— ${esc(l.name)}${l.seat ? `, seat ${esc(l.seat)}` : ''}
                · ${l.replies.length} repl${l.replies.length === 1 ? 'y' : 'ies'}</span>
              ${statusBadge(l)}
            </li>`).join('')}
        </ul>
      </section>`).join('')}`;

  const form = document.getElementById('post-form');
  document.getElementById('toggle-post').addEventListener('click', () => { form.hidden = !form.hidden; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      await api('/api/listings', { ...f, flight, date });
      renderBoard(flight, date);
    } catch (err) { showError(err); }
  });
}

async function renderListing(id) {
  $app.innerHTML = '<p class="muted">loading listing…</p>';
  let l;
  try {
    l = await api(`/api/listings/${encodeURIComponent(id)}`);
  } catch (err) {
    $app.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return;
  }

  const dealBox = l.status === 'deal' ? `
    <div class="deal-box">
      🤝 <strong>Deal made</strong> between ${esc(l.name)} and ${esc(l.deal.with)}
      ${l.deal.price != null
        ? `for <strong>${money(l.deal.price)}</strong>`
        : '— no money changed hands'}
    </div>` : '';

  $app.innerHTML = `
    <p><a href="#/f/${esc(l.flight)}/${esc(l.date)}">← back to ${esc(l.flight)} board</a></p>
    <article class="card listing-detail">
      <p class="crumbs">${kindBadge(l)} <span class="muted">${esc(CAT_LABEL[l.category] || l.category)}
        · ${esc(l.flight)} · ${esc(fmtDate(l.date))}</span> ${statusBadge(l)}
        ${l.demo ? '<span class="badge demo">example</span>' : ''}</p>
      <h1>${esc(l.title)} ${l.price != null ? `<span class="price">${money(l.price)}</span>` : ''}</h1>
      <p class="muted">posted by ${esc(l.name)}${l.seat ? `, seat ${esc(l.seat)}` : ''}</p>
      ${l.details ? `<p class="details">${esc(l.details)}</p>` : ''}
      ${dealBox}
      ${l.status === 'open' ? `<p><button id="close-btn" class="linkish">close this listing</button></p>` : ''}
    </article>

    <div id="error-box" class="error" hidden></div>

    <section class="replies">
      <h2>${l.replies.length} repl${l.replies.length === 1 ? 'y' : 'ies'}</h2>
      ${l.replies.map(r => `
        <div class="card reply ${l.acceptedReplyId === r.id ? 'accepted' : ''}">
          <p><strong>${esc(r.name)}</strong>${r.seat ? `, seat ${esc(r.seat)}` : ''}
            ${r.price != null ? ` — counter-offer <strong>${money(r.price)}</strong>` : ''}
            ${l.acceptedReplyId === r.id ? '<span class="badge deal">accepted</span>' : ''}</p>
          <p>${esc(r.message)}</p>
          ${l.status === 'open' ? `<button data-accept="${r.id}">accept this deal</button>` : ''}
        </div>`).join('') || '<p class="muted">no replies yet.</p>'}
    </section>

    ${l.status === 'open' ? `
    <form id="reply-form" class="card">
      <h2>reply / make a counter-offer</h2>
      <div class="row">
        <label>your name <input name="name" required></label>
        <label>your seat <input name="seat" placeholder="21B"></label>
        <label>counter-offer (optional) <input name="price" placeholder="$40" inputmode="decimal"></label>
      </div>
      <label>message <textarea name="message" rows="3" required></textarea></label>
      <button type="submit">send reply</button>
    </form>` : ''}`;

  document.querySelectorAll('[data-accept]').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Accept this reply and close the deal?')) return;
      try {
        await api(`/api/listings/${l.id}/accept`, { replyId: Number(btn.dataset.accept) });
        renderListing(id);
      } catch (err) { showError(err); }
    }));

  document.getElementById('close-btn')?.addEventListener('click', async () => {
    if (!confirm('Close this listing without a deal?')) return;
    try {
      await api(`/api/listings/${l.id}/close`, {});
      location.hash = `#/f/${l.flight}/${l.date}`;
    } catch (err) { showError(err); }
  });

  document.getElementById('reply-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/api/listings/${l.id}/replies`, f);
      renderListing(id);
    } catch (err) { showError(err); }
  });
}
