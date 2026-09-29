/* N!TRO Activity Monitor — interface */
(() => {
  'use strict';

  const config = window.NITRO_HQ_CONFIG || {};
  const store = window.NitroStore.create(config);

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'vars') Object.entries(value).forEach(([name, v]) => node.style.setProperty(name, v));
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  };

  const CATEGORIES = {
    event: { label: 'Event', colour: 'var(--cat-event)' },
    meet: { label: 'Team Meet', colour: 'var(--cat-meet)' },
    misc: { label: 'Miscellaneous', colour: 'var(--cat-misc)' },
    deadline: { label: 'Deadline', colour: 'var(--cat-deadline)' },
    important: { label: 'Important Team Meet', colour: 'var(--cat-important)' }
  };
  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const VIEWS = {
    dashboard: ['Dashboard', 'Everything the team is moving this season.'],
    chat: ['Chat', 'Team channel, private groups and direct messages.'],
    tasks: ['Tasks', 'Assign work, track it, finish it. Cards turn red as deadlines close in.'],
    calendar: ['Calendar', 'Events, meets, deadlines and the things in between.']
  };

  /* ---------- date helpers ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseISODate = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const todayISO = () => toISODate(new Date());
  const addDays = (iso, days) => { const d = parseISODate(iso); d.setDate(d.getDate() + days); return toISODate(d); };
  const daysUntil = (iso) => Math.round((parseISODate(iso) - parseISODate(todayISO())) / 86400000);
  const fmtDay = (iso) => parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtLongDay = (iso) => parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtStamp = (ms) => `${new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${fmtTime(ms)}`;
  const relTime = (ms) => {
    const diff = Date.now() - ms;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} h ago`;
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} d ago`;
    return fmtStamp(ms);
  };
  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const fmtINR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

  /* ---------- task urgency (0 = calm, 1 = red) ---------- */

  const urgency = (task) => {
    if (task.status === 'done') return 0;
    const days = daysUntil(task.deadline);
    if (days < 0) return 1;
    if (days >= 14) return 0;
    return Math.pow(1 - days / 14, 1.35);
  };

  const deadlineInfo = (task) => {
    const days = daysUntil(task.deadline);
    if (task.status === 'done') return { text: `Done · was due ${fmtDay(task.deadline)}`, colour: 'var(--mint)' };
    if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, colour: 'var(--red)' };
    if (days === 0) return { text: 'Due today', colour: 'var(--red)' };
    if (days === 1) return { text: 'Due tomorrow', colour: 'var(--red)' };
    if (days <= 7) return { text: `Due in ${days} days`, colour: 'var(--pink)' };
    if (days <= 14) return { text: `Due ${fmtDay(task.deadline)}`, colour: 'var(--vanilla)' };
    return { text: `Due ${fmtDay(task.deadline)}`, colour: 'var(--mint)' };
  };

  /* ---------- state ---------- */

  const state = {
    user: null, profiles: [], meters: [], updates: [], tasks: [], events: [], conversations: [],
    activeConv: null, messages: [], typers: [], view: 'dashboard', taskFilter: 'all',
    calMonth: null, selectedDay: todayISO(), editingTask: null, unsubs: [], convUnsubs: [], lastRead: {}
  };

  const profileOf = (id) => state.profiles.find((p) => p.uid === id);
  const nameOf = (id) => profileOf(id)?.name || 'Member';
  const isOnline = (p) => (p.lastSeen > 0 && Date.now() - p.lastSeen < 120000) || p.uid === state.user?.uid;

  const avatar = (nameOrProfile, small = false) => {
    const name = typeof nameOrProfile === 'string' ? nameOrProfile : nameOrProfile?.name;
    return el('span', { class: `avatar${small ? ' avatar--sm' : ''}`, 'aria-hidden': 'true', vars: { '--av': window.NitroStore.colourFor(name || '?') }, text: initials(name) });
  };

  /* ---------- toast & modals ---------- */

  let toastTimer = 0;
  const toast = (message, isError = false) => {
    const node = $('#toast');
    node.textContent = message;
    node.classList.toggle('is-error', isError);
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
  };

  const openModal = (id) => {
    const modal = $(id);
    modal.hidden = false;
    const first = $('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select', modal);
    setTimeout(() => first?.focus(), 30);
  };
  const closeModal = (modal) => { if (modal) modal.hidden = true; };

  $$('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(modal); });
    $$('[data-close]', modal).forEach((button) => button.addEventListener('click', () => closeModal(modal)));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $$('.modal:not([hidden])').forEach(closeModal);
  });

  const friendlyError = (error) => {
    const code = error?.code || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password did not match.';
    if (code.includes('email-already-in-use')) return 'That email already has an account. Sign in instead.';
    if (code.includes('weak-password')) return 'Use a password of at least 6 characters.';
    if (code.includes('invalid-email')) return 'That email address does not look right.';
    if (code.includes('permission-denied')) return 'You do not have permission to do that.';
    if (code.includes('network')) return 'Network problem. Check your connection and try again.';
    return error?.message || 'Something went wrong.';
  };

  /* ---------- countdown ---------- */

  const countdownTarget = new Date(config.countdown?.target || '2027-07-28T00:00:00+05:30').getTime();
  const cdCells = Object.fromEntries($$('[data-cd]').map((node) => [node.dataset.cd, node]));
  $('#countdown-target-label').textContent = config.countdown?.label || '28 July 2027';
  $('#countdown-sub').textContent = config.countdown?.sub || '';

  const tickCountdown = () => {
    const diff = countdownTarget - Date.now();
    if (diff <= 0) {
      Object.values(cdCells).forEach((cell) => { cell.textContent = '00'; });
      $('#countdown-sub').textContent = 'Race day is here.';
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    cdCells.days.textContent = String(days);
    cdCells.hours.textContent = pad(hours);
    cdCells.minutes.textContent = pad(minutes);
    cdCells.seconds.textContent = pad(seconds);
    if (state.user) document.title = `N!TRO HQ · ${days}d to go`;
  };
  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* ---------- views ---------- */

  const showView = (name) => {
    if (!VIEWS[name]) name = 'dashboard';
    state.view = name;
    $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === name));
    $$('[data-view]').forEach((button) => {
      if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $('#view-title').textContent = VIEWS[name][0];
    $('#view-sub').textContent = VIEWS[name][1];
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    if (name === 'chat' && window.innerWidth > 960) $('#compose-input')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  $$('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-goto]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.goto)));

  /* ---------- gate ---------- */

  const gate = $('#gate');
  const app = $('#app');
  const gateForm = $('#gate-form');
  const gateError = $('#gate-error');
  const gateRegister = $('#gate-register');
  let registering = false;

  const fieldName = $('#field-name');
  const fieldEmail = $('#field-email');
  const fieldPassword = $('#field-password');
  const gateReset = $('#gate-reset');

  const layoutGate = () => {
    const live = store.mode === 'live';
    fieldName.hidden = live && !registering;
    fieldEmail.hidden = !live;
    fieldPassword.hidden = !live;
    $('#gate-name').required = !live || registering;
    $('#gate-email').required = live;
    $('#gate-password').required = live;
    $('#gate-password').autocomplete = registering ? 'new-password' : 'current-password';
    $('#gate-submit').textContent = registering ? 'Create account' : 'Sign in';
    gateRegister.textContent = registering ? 'I already have an account' : 'Create account';
  };

  const setupGate = () => {
    const mode = $('#gate-mode');
    const note = $('#gate-note');
    if (store.mode === 'live') {
      mode.textContent = 'Live team HQ \u00b7 synced for everyone';
      mode.classList.add('is-live');
      gateRegister.hidden = false;
      note.textContent = 'First time here? Press "Create account", enter your name exactly as the team knows you, your email and a password.';
    } else {
      mode.textContent = store.sdkMissing ? 'Firebase could not load \u00b7 running on this device only' : 'Local demo mode \u00b7 nothing is shared yet';
      note.textContent = 'Everything works on this device only. Add your Firebase config in js/config.js to switch on live sync for the whole team (see DEPLOY.md).';
      gateReset.hidden = false;
    }
    layoutGate();
  };

  gateRegister.addEventListener('click', () => {
    registering = !registering;
    layoutGate();
    (registering ? $('#gate-name') : $('#gate-email')).focus();
  });

  gateReset.addEventListener('click', () => {
    if (!confirm('Wipe every chat, task, event and meter stored on this device?')) return;
    store.reset?.();
    toast('Demo data reset. Fresh start.');
  });

  gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    gateError.textContent = '';
    const payload = { name: $('#gate-name').value, email: $('#gate-email').value.trim(), password: $('#gate-password').value };
    const submit = $('#gate-submit');
    submit.disabled = true;
    try {
      if (store.mode === 'live' && registering) await store.register(payload);
      else await store.signIn(payload);
    } catch (error) {
      gateError.textContent = friendlyError(error);
    } finally {
      submit.disabled = false;
    }
  });

  /* ---------- presence & me ---------- */

  const renderPresence = () => {
    const list = $('#presence-list');
    const others = state.profiles.filter((p) => p.uid !== state.user?.uid);
    list.replaceChildren(...others.map((p) => el('li', {},
      el('button', { type: 'button', title: `Message ${p.name}`, onclick: () => openDm(p.uid) },
        avatar(p, true), el('span', { class: 'presence__name', title: p.role || '' }, p.name), el('i', { class: `dot${isOnline(p) ? ' is-online' : ''}`, 'aria-label': isOnline(p) ? 'online' : 'offline' }))
    )));
    if (!others.length) list.append(el('li', { class: 'empty', text: 'No other members yet.' }));
  };

  const renderMe = () => {
    $('#me-name').textContent = state.user.name;
    $('#me-mode').textContent = store.mode === 'live' ? 'Live · synced' : 'Local demo';
    const av = $('#me-avatar');
    av.textContent = initials(state.user.name);
    av.style.setProperty('--av', window.NitroStore.colourFor(state.user.name));
  };

  /* ---------- meters ---------- */

  let activeMeter = null;

  const meterPercent = (meter) => {
    const max = meter.unit === 'inr' ? (config.moneyTarget || 300000) : 100;
    return Math.max(0, Math.min(100, (Number(meter.value) || 0) / max * 100));
  };
  const meterDisplay = (meter) => (meter.unit === 'inr' ? fmtINR(meter.value) : `${Math.round(Number(meter.value) || 0)}%`);

  const RING = 2 * Math.PI * 52;

  const renderPortfolio = () => {
    const rows = state.meters.filter((m) => m.kind === 'portfolio');
    const list = $('#portfolio-rows');
    const average = rows.length ? rows.reduce((sum, m) => sum + (Number(m.value) || 0), 0) / rows.length : 0;
    $('#portfolio-total').textContent = `${Math.round(average)}%`;
    $('#portfolio-ring').setAttribute('aria-label', `Total portfolio progress ${Math.round(average)} percent`);
    setTimeout(() => { $('#portfolio-ring-fill').style.strokeDashoffset = String(RING * (1 - average / 100)); }, 30);

    list.replaceChildren(...rows.map((meter) => {
      const mine = window.NitroStore.canUpdateMeter(meter, state.user);
      const value = Math.max(0, Math.min(100, Math.round(Number(meter.value) || 0)));
      const valueNode = el('span', { class: 'pf__value', text: `${value}%` });
      let control;
      if (mine) {
        control = el('input', { class: 'pf__slider', type: 'range', min: '0', max: '100', step: '1', value: String(value), 'aria-label': `${meter.label}: ${value} percent. Drag to update` });
        control.addEventListener('input', () => { valueNode.textContent = `${control.value}%`; });
        control.addEventListener('change', async () => {
          try { await store.updateMeter(meter.id, { value: Number(control.value), note: '' }); toast(`${meter.label} set to ${control.value}%.`); }
          catch (error) { toast(friendlyError(error), true); control.value = String(value); valueNode.textContent = `${value}%`; }
        });
      } else {
        control = el('div', { class: 'pf__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(value), 'aria-label': meter.label }, el('span'));
        setTimeout(() => { control.firstChild.style.width = `${value}%`; }, 30);
      }
      const label = mine
        ? el('span', { class: 'pf__label' }, el('button', { type: 'button', title: 'Update with a note', onclick: () => openMeterModal(meter) }, meter.label))
        : el('span', { class: 'pf__label', text: meter.label });
      return el('li', { class: `pf${mine ? ' pf--mine' : ''}` },
        el('div', { class: 'pf__head' }, label, el('span', { class: 'pf__owner' }, mine ? null : el('i', { class: 'lock', 'aria-hidden': 'true' }), avatar(meter.ownerName, true), mine ? 'Yours to move' : `Only ${meter.ownerName} can move this`)),
        valueNode,
        control,
        el('div', { class: 'pf__meta' }, meter.updatedByName ? [el('b', { text: meter.updatedByName }), ` \u00b7 ${relTime(meter.updatedAt || Date.now())}`] : 'Not moved yet'));
    }));
    if (!rows.length) list.append(el('li', { class: 'empty', text: 'Portfolio sliders are being set up\u2026' }));
  };

  const renderMeters = () => {
    renderPortfolio();
    const wrap = $('#meters');
    wrap.replaceChildren(...state.meters.filter((m) => m.kind !== 'portfolio').map((meter) => {
      const pct = meterPercent(meter);
      const isMoney = meter.unit === 'inr';
      const button = el('button', { class: `meter${isMoney ? ' meter--money' : ''}`, type: 'button', 'aria-label': `${meter.label}: ${meterDisplay(meter)}. Update`, onclick: () => openMeterModal(meter) },
        el('div', { class: 'meter__top' }, el('span', { class: 'meter__label', text: meter.label }), el('span', { class: 'meter__value', text: meterDisplay(meter) })),
        el('div', { class: 'meter__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) }, el('span')),
        el('div', { class: 'meter__meta' },
          el('span', {}, isMoney ? `${Math.round(pct)}% of ${fmtINR(config.moneyTarget || 300000)}` : `${Math.round(pct)}% complete`),
          el('span', {}, meter.updatedByName ? [el('b', { text: meter.updatedByName }), ` · ${relTime(meter.updatedAt || Date.now())}`] : 'No updates yet'))
      );
      setTimeout(() => { $('.meter__bar span', button).style.width = `${pct}%`; }, 30);
      return button;
    }));
    if (!wrap.children.length) wrap.append(el('p', { class: 'empty', text: 'Meters are being set up\u2026' }));
  };

  const openMeterModal = (meter) => {
    if (!window.NitroStore.canUpdateMeter(meter, state.user)) { toast(`Only ${meter.ownerName} can move this slider.`, true); return; }
    activeMeter = meter;
    const isMoney = meter.unit === 'inr';
    const max = isMoney ? (config.moneyTarget || 300000) : 100;
    $('#modal-meter-title').textContent = meter.label;
    $('#modal-meter-sub').textContent = isMoney ? `Currently ${fmtINR(meter.value)} of ${fmtINR(max)}` : `Currently ${Math.round(meter.value)}% complete`;
    const range = $('#meter-value');
    range.max = String(max);
    range.step = isMoney ? '1000' : '1';
    range.value = String(Math.min(max, Number(meter.value) || 0));
    $('#meter-value-label').textContent = isMoney ? 'Amount raised' : 'Progress';
    const exact = $('#meter-exact');
    exact.max = String(max);
    exact.value = String(Math.round(Number(meter.value) || 0));
    $('#meter-output').textContent = isMoney ? fmtINR(range.value) : `${range.value}%`;
    $('#meter-note').value = '';
    $('#meter-label').value = meter.label;
    openModal('#modal-meter');
  };

  $('#meter-value').addEventListener('input', (event) => {
    $('#meter-exact').value = event.target.value;
    $('#meter-output').textContent = activeMeter?.unit === 'inr' ? fmtINR(event.target.value) : `${event.target.value}%`;
  });
  $('#meter-exact').addEventListener('input', (event) => {
    const max = Number($('#meter-value').max);
    const value = Math.max(0, Math.min(max, Number(event.target.value) || 0));
    $('#meter-value').value = String(value);
    $('#meter-output').textContent = activeMeter?.unit === 'inr' ? fmtINR(value) : `${Math.round(value)}%`;
  });

  $('#form-meter').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeMeter) return;
    try {
      await store.updateMeter(activeMeter.id, { value: Number($('#meter-exact').value || $('#meter-value').value), note: $('#meter-note').value, label: $('#meter-label').value });
      closeModal($('#modal-meter'));
      toast('Update posted for everyone.');
    } catch (error) { toast(friendlyError(error), true); }
  });

  const renderUpdates = () => {
    const list = $('#updates-list');
    list.replaceChildren(...state.updates.slice(0, 12).map((u) => el('li', {},
      avatar(u.byName, true),
      el('div', {},
        el('p', { class: 'u-head' }, el('b', { text: u.byName }), `moved ${u.label} to ${u.unit === 'inr' ? fmtINR(u.value) : `${Math.round(u.value)}%`}`, el('time', { text: relTime(u.at) })),
        u.note ? el('p', { class: 'u-note', text: u.note }) : null)
    )));
    if (!state.updates.length) list.append(el('li', { class: 'empty', text: 'No updates yet. Tap a meter or move your portfolio slider to post the first one.' }));
  };

  /* ---------- dashboard lists ---------- */

  const sortOpenTasks = (a, b) => (a.deadline > b.deadline ? 1 : a.deadline < b.deadline ? -1 : PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const upcomingEvents = () => state.events.filter((e) => e.date >= todayISO()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const renderDashboardLists = () => {
    const mine = state.tasks.filter((t) => t.assignee === state.user.uid && t.status !== 'done').sort(sortOpenTasks).slice(0, 5);
    const taskList = $('#dash-tasks');
    taskList.replaceChildren(...mine.map((t) => { const info = deadlineInfo(t); return el('li', {}, el('i', { vars: { '--c': info.colour } }), el('span', { text: t.title }), el('small', { text: info.text })); }));
    if (!mine.length) taskList.append(el('li', { class: 'empty', text: 'Nothing assigned to you right now.' }));

    const eventList = $('#dash-events');
    const coming = upcomingEvents().slice(0, 5);
    eventList.replaceChildren(...coming.map((e) => el('li', {}, el('i', { vars: { '--c': CATEGORIES[e.category]?.colour } }), el('span', { text: e.title }), el('small', { text: `${fmtDay(e.date)}${e.time ? ` · ${e.time}` : ''}` }))));
    if (!coming.length) eventList.append(el('li', { class: 'empty', text: 'Nothing on the calendar yet.' }));

    const open = state.tasks.filter((t) => t.assignee === state.user.uid && t.status !== 'done').length;
    const badge = $('#tasks-mine');
    badge.textContent = String(open);
    badge.hidden = open === 0;
  };

  /* ---------- chat ---------- */

  const readKey = () => `nitro-hq-read-${state.user?.uid || 'anon'}`;
  const loadRead = () => { try { state.lastRead = JSON.parse(localStorage.getItem(readKey()) || '{}'); } catch (_) { state.lastRead = {}; } };
  const markRead = (convId) => {
    state.lastRead[convId] = Date.now();
    try { localStorage.setItem(readKey(), JSON.stringify(state.lastRead)); } catch (_) { /* ignore */ }
    renderConversations();
  };
  const hasUnread = (conv) => conv.id !== state.activeConv && (conv.lastMessageAt || 0) > (state.lastRead[conv.id] || 0) && Boolean(conv.lastMessageText);

  const convTitle = (conv) => {
    if (conv.type === 'team') return conv.name || 'Team channel';
    if (conv.type === 'group') return conv.name || 'Group';
    const other = conv.members.find((m) => m !== state.user.uid);
    return nameOf(other);
  };
  const convMembersLine = (conv) => {
    if (conv.type === 'team') return 'Everyone on Team N!TRO';
    return conv.members.map((m) => (m === state.user.uid ? 'You' : nameOf(m))).join(', ');
  };

  const renderConversations = () => {
    const groups = $('#conv-groups');
    const dms = $('#conv-dms');
    const item = (conv) => {
      const icon = conv.type === 'team' ? el('span', { class: 'conv-icon conv-icon--team', text: '#' })
        : conv.type === 'group' ? el('span', { class: 'conv-icon conv-icon--group', text: String(conv.members.length) })
          : avatar(convTitle(conv), true);
      return el('li', {}, el('button', { type: 'button', class: conv.id === state.activeConv ? 'is-active' : '', onclick: () => openConversation(conv.id) },
        icon,
        el('span', {}, el('strong', { text: convTitle(conv) }), el('small', { text: conv.lastMessageText || (conv.type === 'dm' ? 'Say hello' : convMembersLine(conv)) })),
        hasUnread(conv) ? el('span', { class: 'unread', text: 'new' }) : el('span')));
    };
    groups.replaceChildren(...state.conversations.filter((c) => c.type !== 'dm').map(item));
    dms.replaceChildren(...state.conversations.filter((c) => c.type === 'dm').map(item));
    if (!dms.children.length) dms.append(el('li', { class: 'empty', text: 'Tap a teammate in the sidebar to start a private chat.' }));
    const unread = state.conversations.filter(hasUnread).length;
    const badge = $('#chat-unread');
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  };

  const renderMessages = () => {
    const box = $('#messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const nodes = [];
    let lastDay = '';
    let last = null;
    state.messages.forEach((m) => {
      const day = toISODate(new Date(m.at));
      if (day !== lastDay) { nodes.push(el('div', { class: 'msg__day', text: day === todayISO() ? 'Today' : fmtDay(day) })); lastDay = day; last = null; }
      const mine = m.by === state.user.uid;
      const cont = last && last.by === m.by && m.at - last.at < 300000;
      nodes.push(el('div', { class: `msg${mine ? ' msg--mine' : ''}${cont ? ' msg--cont' : ''}` },
        mine ? null : avatar(m.byName, true),
        el('div', {},
          cont ? null : el('p', { class: 'msg__meta' }, mine ? null : el('b', { text: m.byName }), el('span', { text: fmtTime(m.at) })),
          el('div', { class: 'msg__bubble', text: m.text }))));
      last = m;
    });
    box.replaceChildren(...nodes);
    if (!state.messages.length) box.append(el('p', { class: 'empty', text: 'No messages yet. Start the conversation.' }));
    if (nearBottom || box.dataset.fresh === '1') { box.scrollTop = box.scrollHeight; box.dataset.fresh = '0'; }
  };

  let typingTimer = 0;
  const renderTyping = () => {
    const wrap = $('#typing');
    const live = state.typers.filter((t) => Date.now() - t.at < 6000);
    if (!live.length) { wrap.hidden = true; wrap.replaceChildren(); return; }
    const names = live.map((t) => t.name);
    const text = names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : `${names[0]} and ${names.length - 1} others are typing`;
    wrap.replaceChildren(el('span', { class: 'typing-bubble', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), el('span', { text: text }));
    wrap.hidden = false;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(renderTyping, 1000);
  };

  const openConversation = (convId) => {
    state.convUnsubs.forEach((fn) => fn());
    state.convUnsubs = [];
    state.activeConv = convId;
    state.messages = [];
    state.typers = [];
    const conv = state.conversations.find((c) => c.id === convId);
    $('#room-title').textContent = conv ? convTitle(conv) : 'Conversation';
    $('#room-members').textContent = conv ? convMembersLine(conv) : '';
    $('#rename-conv').hidden = !conv || conv.type === 'dm';
    $('#messages').dataset.fresh = '1';
    state.convUnsubs.push(store.onMessages(convId, (messages) => { state.messages = messages; renderMessages(); markRead(convId); }));
    state.convUnsubs.push(store.onTyping(convId, (typers) => { state.typers = typers; renderTyping(); }));
    markRead(convId);
    $('.chat').classList.add('is-room');
    if (state.view !== 'chat') showView('chat');
  };

  const openDm = async (otherUid) => {
    try {
      const id = await store.openDm(otherUid);
      openConversation(id);
    } catch (error) { toast(friendlyError(error), true); }
  };

  $('#chat-back').addEventListener('click', () => $('.chat').classList.remove('is-room'));

  $('#rename-conv').addEventListener('click', () => {
    const conv = state.conversations.find((c) => c.id === state.activeConv);
    if (!conv || conv.type === 'dm') return;
    $('#rename-input').value = convTitle(conv);
    openModal('#modal-rename');
  });

  $('#form-rename').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('#rename-input').value.trim();
    if (!name || !state.activeConv) return;
    try {
      await store.renameConversation(state.activeConv, name);
      closeModal($('#modal-rename'));
      toast('Chat renamed.');
    } catch (error) { toast(friendlyError(error), true); }
  });

  const composeInput = $('#compose-input');
  let typingSentAt = 0;
  let typingStop = 0;

  const stopTyping = () => { clearTimeout(typingStop); typingSentAt = 0; if (state.activeConv) store.setTyping(state.activeConv, false); };

  composeInput.addEventListener('input', () => {
    composeInput.style.height = 'auto';
    composeInput.style.height = `${Math.min(composeInput.scrollHeight, 140)}px`;
    if (!state.activeConv || !composeInput.value.trim()) { stopTyping(); return; }
    if (Date.now() - typingSentAt > 2000) { typingSentAt = Date.now(); store.setTyping(state.activeConv, true); }
    clearTimeout(typingStop);
    typingStop = setTimeout(stopTyping, 2600);
  });

  composeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#compose').requestSubmit ? $('#compose').requestSubmit() : $('#compose').dispatchEvent(new Event('submit', { cancelable: true })); }
  });

  $('#compose').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = composeInput.value.trim();
    if (!text || !state.activeConv) return;
    composeInput.value = '';
    composeInput.style.height = 'auto';
    clearTimeout(typingStop);
    typingSentAt = 0;
    try { await store.sendMessage(state.activeConv, text); } catch (error) { toast(friendlyError(error), true); composeInput.value = text; }
  });

  $('#new-group').addEventListener('click', () => {
    const wrap = $('#group-members');
    const others = state.profiles.filter((p) => p.uid !== state.user.uid);
    wrap.replaceChildren(...others.map((p) => el('label', {}, el('input', { type: 'checkbox', name: 'member', value: p.uid }), avatar(p, true), el('span', { text: p.name }))));
    if (!others.length) wrap.append(el('p', { class: 'empty', text: 'No other members have joined yet.' }));
    $('#group-name').value = '';
    openModal('#modal-group');
  });

  $('#form-group').addEventListener('submit', async (event) => {
    event.preventDefault();
    const members = $$('#group-members input:checked').map((input) => input.value);
    if (!members.length) { toast('Pick at least one member.', true); return; }
    try {
      const id = await store.createGroup($('#group-name').value, members);
      closeModal($('#modal-group'));
      openConversation(id);
      toast('Group created.');
    } catch (error) { toast(friendlyError(error), true); }
  });

  /* ---------- tasks ---------- */

  const renderTasks = () => {
    const me = state.user.uid;
    const filtered = state.tasks.filter((t) => state.taskFilter === 'all' || (state.taskFilter === 'mine' ? t.assignee === me : t.assignedBy === me));
    ['todo', 'progress', 'done'].forEach((status) => {
      const col = $(`.board__col[data-status="${status}"] ul`);
      const items = filtered.filter((t) => t.status === status).sort(status === 'done' ? (a, b) => b.updatedAt - a.updatedAt : sortOpenTasks);
      $(`[data-count="${status}"]`).textContent = String(items.length);
      col.replaceChildren(...items.map(taskCard));
      if (!items.length) col.append(el('li', { class: 'empty', text: status === 'todo' ? 'Nothing waiting.' : status === 'progress' ? 'Nothing in progress.' : 'Nothing finished yet.' }));
    });
    renderDashboardLists();
  };

  const taskCard = (task) => {
    const me = state.user.uid;
    const u = urgency(task);
    const info = deadlineInfo(task);
    const actions = [];
    const move = (status, label, cls = '') => el('button', { class: `btn ${cls}`, type: 'button', onclick: async () => { try { await store.setTaskStatus(task.id, status); } catch (error) { toast(friendlyError(error), true); } } }, label);
    if (task.assignee === me) {
      if (task.status === 'todo') actions.push(move('progress', 'Start', 'btn--pink'), move('done', 'Mark finished', 'btn--primary'));
      if (task.status === 'progress') actions.push(move('todo', 'Back to To do'), move('done', 'Mark finished', 'btn--primary'));
      if (task.status === 'done') actions.push(move('progress', 'Reopen'));
    }
    if (task.assignedBy === me) {
      actions.push(el('button', { class: 'btn', type: 'button', onclick: () => openTaskModal(task) }, 'Edit'));
      actions.push(el('button', { class: 'btn btn--danger', type: 'button', onclick: async () => { if (confirm(`Delete "${task.title}"?`)) { try { await store.deleteTask(task.id); } catch (error) { toast(friendlyError(error), true); } } } }, 'Delete'));
    }
    return el('li', { class: `task${task.status === 'done' ? ' task--done' : ''}`, vars: { '--u': u.toFixed(3) } },
      el('div', { class: 'task__row' }, el('span', { class: `pill pill--${task.priority}`, text: task.priority }), el('span', { class: 'pill pill--deadline', vars: { '--dl': info.colour }, text: info.text })),
      el('div', { class: 'task__title', text: task.title }),
      task.details ? el('p', { class: 'task__details', text: task.details }) : null,
      el('div', { class: 'task__people' }, avatar(task.assigneeName, true), el('span', {}, el('b', { text: task.assignee === me ? 'You' : task.assigneeName }), ` · assigned by ${task.assignedBy === me ? 'you' : task.assignedByName}`)),
      actions.length ? el('div', { class: 'task__actions' }, ...actions) : el('p', { class: 'task__lock', text: `Only ${task.assigneeName} can update this task.` }));
  };

  $$('[data-task-filter]').forEach((button) => button.addEventListener('click', () => {
    state.taskFilter = button.dataset.taskFilter;
    $$('[data-task-filter]').forEach((b) => { const active = b === button; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active)); });
    renderTasks();
  }));

  const fillAssignees = (selected) => {
    const select = $('#task-assignee');
    select.replaceChildren(...state.profiles.map((p) => el('option', { value: p.uid, text: p.uid === state.user.uid ? `${p.name} (you)` : p.name })));
    select.value = selected && state.profiles.some((p) => p.uid === selected) ? selected : state.user.uid;
  };

  const openTaskModal = (task = null) => {
    state.editingTask = task;
    $('#modal-task-title').textContent = task ? 'Edit task' : 'Assign a task';
    $('#task-submit').textContent = task ? 'Save changes' : 'Assign task';
    $('#task-title').value = task?.title || '';
    $('#task-details').value = task?.details || '';
    $('#task-priority').value = task?.priority || 'medium';
    $('#task-deadline').value = task?.deadline || addDays(todayISO(), 7);
    $('#task-deadline').min = task ? '' : todayISO();
    fillAssignees(task?.assignee);
    openModal('#modal-task');
  };

  $('#new-task').addEventListener('click', () => openTaskModal());

  $('#form-task').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = { title: $('#task-title').value.trim(), details: $('#task-details').value.trim(), assignee: $('#task-assignee').value, priority: $('#task-priority').value, deadline: $('#task-deadline').value };
    if (!fields.title || !fields.deadline || !fields.assignee) { toast('Add a title, an assignee and a deadline.', true); return; }
    try {
      if (state.editingTask) await store.updateTask(state.editingTask.id, fields);
      else await store.addTask(fields);
      closeModal($('#modal-task'));
      toast(state.editingTask ? 'Task updated.' : `Task assigned to ${nameOf(fields.assignee)}.`);
    } catch (error) { toast(friendlyError(error), true); }
  });

  /* ---------- calendar ---------- */

  const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
  state.calMonth = monthStart(new Date());

  const eventsOn = (iso) => state.events.filter((e) => e.date === iso).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const renderCalendar = () => {
    const first = state.calMonth;
    $('#cal-title').textContent = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    const grid = $('#cal-grid');
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = toISODate(date);
      const dayEvents = eventsOn(iso);
      const classes = ['day'];
      if (date.getMonth() !== first.getMonth()) classes.push('day--out');
      if (iso === todayISO()) classes.push('day--today');
      if (iso === state.selectedDay) classes.push('day--selected');
      cells.push(el('button', { type: 'button', class: classes.join(' '), role: 'gridcell', 'aria-label': `${fmtLongDay(iso)}${dayEvents.length ? `, ${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}` : ''}`, 'aria-pressed': String(iso === state.selectedDay), onclick: () => { state.selectedDay = iso; renderCalendar(); } },
        el('span', { class: 'day__num', text: String(date.getDate()) }),
        dayEvents.length ? el('span', { class: 'day__dots' }, ...dayEvents.slice(0, 5).map((e) => el('i', { class: e.category === 'important' ? 'dot--important' : '', vars: { '--c': CATEGORIES[e.category]?.colour } }))) : null,
        dayEvents.length ? el('span', { class: 'day__label', text: dayEvents[0].title }) : null));
    }
    grid.replaceChildren(...cells);
    renderDayEvents();
  };

  const eventRow = (e, showDate = false) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.misc;
    return el('li', { class: `event${e.category === 'important' ? ' event--important' : ''}` },
      el('i', { vars: { '--c': cat.colour } }),
      el('div', {},
        el('strong', { text: e.title }),
        el('small', { text: [showDate ? fmtDay(e.date) : null, e.time || null, cat.label, `added by ${e.by === state.user.uid ? 'you' : e.byName}`].filter(Boolean).join(' · ') }),
        e.notes ? el('p', { text: e.notes }) : null),
      e.by === state.user.uid ? el('button', { class: 'btn btn--tiny btn--danger', type: 'button', 'aria-label': `Remove ${e.title}`, onclick: async () => { if (confirm(`Remove "${e.title}"?`)) { try { await store.deleteEvent(e.id); } catch (error) { toast(friendlyError(error), true); } } } }, '✕') : el('span'));
  };

  const renderDayEvents = () => {
    const list = $('#day-events');
    const items = eventsOn(state.selectedDay);
    $('#day-title').textContent = state.selectedDay === todayISO() ? `Today · ${fmtDay(state.selectedDay)}` : fmtLongDay(state.selectedDay);
    list.replaceChildren(...items.map((e) => eventRow(e)));
    if (!items.length) list.append(el('li', { class: 'empty', text: 'Nothing on this day. Add something.' }));
    const upcoming = $('#upcoming-events');
    const coming = upcomingEvents().slice(0, 8);
    upcoming.replaceChildren(...coming.map((e) => el('li', {}, el('i', { vars: { '--c': CATEGORIES[e.category]?.colour } }), el('span', { text: e.title }), el('small', { text: `${fmtDay(e.date)}${e.time ? ` · ${e.time}` : ''}` }))));
    if (!coming.length) upcoming.append(el('li', { class: 'empty', text: 'No upcoming items.' }));
  };

  $('#cal-prev').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#cal-today').addEventListener('click', () => { state.calMonth = monthStart(new Date()); state.selectedDay = todayISO(); renderCalendar(); });

  $('#add-event').addEventListener('click', () => {
    $('#form-event').reset();
    $('#event-date').value = state.selectedDay;
    openModal('#modal-event');
  });

  $('#form-event').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = $('#form-event');
    const payload = { title: $('#event-title').value.trim(), date: $('#event-date').value, time: $('#event-time').value, category: ($('input[name="category"]:checked', form)?.value || 'event'), notes: $('#event-notes').value.trim() };
    if (!payload.title || !payload.date) { toast('Add a title and a date.', true); return; }
    try {
      state.selectedDay = payload.date;
      state.calMonth = monthStart(parseISODate(payload.date));
      await store.addEvent(payload);
      renderCalendar();
      closeModal($('#modal-event'));
      toast('Added to the team calendar.');
    } catch (error) { toast(friendlyError(error), true); }
  });

  /* ---------- session ---------- */

  let heartbeatTimer = 0;

  const enterApp = (user) => {
    state.user = user;
    loadRead();
    gate.hidden = true;
    app.hidden = false;
    renderMe();
    state.unsubs.push(store.onProfiles((profiles) => { state.profiles = profiles; renderPresence(); renderConversations(); renderTasks(); }));
    state.unsubs.push(store.onMeters((meters) => { state.meters = meters; renderMeters(); }));
    state.unsubs.push(store.onMeterUpdates((updates) => { state.updates = updates; renderUpdates(); }));
    state.unsubs.push(store.onTasks((tasks) => { state.tasks = tasks; renderTasks(); }));
    state.unsubs.push(store.onEvents((events) => { state.events = events; renderCalendar(); renderDashboardLists(); }));
    state.unsubs.push(store.onConversations((conversations) => {
      state.conversations = conversations;
      renderConversations();
      if (!state.activeConv && conversations.some((c) => c.id === 'team')) { openConversation('team'); $('.chat').classList.remove('is-room'); showView(location.hash.replace('#', '') || 'dashboard'); }
      else if (state.activeConv) { const conv = conversations.find((c) => c.id === state.activeConv); if (conv) { $('#room-title').textContent = convTitle(conv); $('#room-members').textContent = convMembersLine(conv); $('#rename-conv').hidden = conv.type === 'dm'; } }
    }));
    store.heartbeat();
    heartbeatTimer = setInterval(() => { if (!document.hidden) store.heartbeat(); }, 45000);
    showView(location.hash.replace('#', '') || 'dashboard');
    tickCountdown();
  };

  const leaveApp = () => {
    state.unsubs.forEach((fn) => fn());
    state.convUnsubs.forEach((fn) => fn());
    state.unsubs = [];
    state.convUnsubs = [];
    clearInterval(heartbeatTimer);
    Object.assign(state, { user: null, profiles: [], meters: [], updates: [], tasks: [], events: [], conversations: [], activeConv: null, messages: [], typers: [] });
    app.hidden = true;
    gate.hidden = false;
    document.title = 'N!TRO Activity Monitor';
    $('#gate-password').value = '';
  };

  $('#sign-out').addEventListener('click', async () => {
    stopTyping();
    await store.signOut();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTyping();
    else if (state.user) { store.heartbeat(); renderPresence(); }
  });
  window.addEventListener('pagehide', stopTyping);
  window.addEventListener('hashchange', () => { if (state.user) showView(location.hash.replace('#', '')); });
  setInterval(() => { if (state.user) renderPresence(); }, 30000);

  /* ---------- boot ---------- */

  (async () => {
    if (config.siteUrl) $('.side__brand').href = config.siteUrl;
    setupGate();
    try {
      await store.init();
    } catch (error) {
      $('#gate-mode').textContent = 'Could not reach Firebase · check js/config.js';
      gateError.textContent = friendlyError(error);
    }
    store.onAuth((user) => { if (user) enterApp(user); else leaveApp(); });
  })();
})();
