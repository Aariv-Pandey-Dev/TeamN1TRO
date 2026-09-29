/* N!TRO Activity Monitor — data layer
   Two interchangeable stores behind one interface:
   - FirebaseStore: shared, real-time, multi-user (Firestore + Auth)
   - LocalStore:    single-device demo, persisted in localStorage
*/
(() => {
  'use strict';

  const uid = () => ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);
  const AVATAR_COLOURS = ['#b7f1e6', '#f04f6a', '#fff6e1', '#ffcf6b', '#9ad0ff', '#c5b3ff', '#8ff0b4', '#ffb3c7'];
  const colourFor = (key) => AVATAR_COLOURS[[...String(key)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLOURS.length];
  const clean = (text, max) => String(text || '').trim().slice(0, max);
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  /* Every meter the HQ knows about, in display order: team meters first
     (anyone may update), then the portfolio sliders (owner only). */
  const meterDefinitions = (config) => [
    ...(config.meters || []).map((m, i) => ({ id: m.id, label: m.label, unit: m.unit || 'percent', kind: 'team', ownerName: '', order: i })),
    ...(config.portfolio || []).map((m, i) => ({ id: m.id, label: m.label, unit: 'percent', kind: 'portfolio', ownerName: m.owner || '', order: 100 + i }))
  ];

  const canUpdateMeter = () => true; /* every member may move every meter and portfolio slider */

  /* ====================================================================
     Local store (demo mode)
     ==================================================================== */
  class LocalStore {
    constructor(config) {
      this.mode = 'local';
      this.config = config;
      this.key = 'nitro-hq-local-v2';
      this.listeners = new Map();
      this.user = null;
      this.state = this.load();
    }

    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) return JSON.parse(raw);
      } catch (_) { /* fresh */ }
      return { profiles: {}, meters: {}, meterUpdates: [], conversations: {}, messages: {}, tasks: {}, events: {}, seeded: false };
    }

    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch (_) { /* quota */ }
    }

    emit(topic, payload) {
      (this.listeners.get(topic) || []).forEach((cb) => cb(payload));
    }

    listen(topic, cb, initial) {
      if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
      this.listeners.get(topic).add(cb);
      cb(initial());
      return () => this.listeners.get(topic)?.delete(cb);
    }

    async init() {
      if (!this.state.seeded) this.seed();
      meterDefinitions(this.config).forEach((m) => { if (!this.state.meters[m.id]) this.state.meters[m.id] = { ...m, value: 0, updatedBy: '', updatedByName: '', updatedAt: 0 }; });
      const savedUser = (() => { try { return JSON.parse(localStorage.getItem('nitro-hq-local-user') || 'null'); } catch (_) { return null; } })();
      this.user = savedUser;
    }

    seed() {
      /* Factory state: the roster and every meter at zero. No chats, tasks or events. */
      const s = this.state;
      meterDefinitions(this.config).forEach((m) => { s.meters[m.id] = { ...m, value: 0, updatedBy: '', updatedByName: '', updatedAt: 0 }; });
      s.conversations.team = { id: 'team', type: 'team', name: 'Team channel', members: [], createdAt: Date.now(), lastMessageAt: 0, lastMessageText: '' };
      s.messages.team = [];
      s.seeded = true;
      this.save();
    }

    /* Wipe this device's demo data completely. */
    reset() {
      try { localStorage.removeItem(this.key); localStorage.removeItem('nitro-hq-local-user'); } catch (_) { /* ignore */ }
      this.state = this.load();
      this.seed();
    }

    /* ---- auth ---- */
    onAuth(cb) { this.authCb = cb; cb(this.user); }
    currentUser() { return this.user; }

    async signIn({ name }) {
      const cleanName = clean(name, 40);
      if (cleanName.length < 2) throw new Error('Please enter your name.');
      const match = Object.values(this.state.profiles).find((p) => p.name.toLowerCase() === cleanName.toLowerCase());
      const id = match ? match.uid : `u_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const role = match?.role || (this.config.team || []).find((p) => sameName(p.name, cleanName))?.role || '';
      this.state.profiles[id] = { uid: id, name: match ? match.name : cleanName, role, colour: colourFor(cleanName), lastSeen: Date.now() };
      this.save();
      this.user = { uid: id, name: this.state.profiles[id].name };
      try { localStorage.setItem('nitro-hq-local-user', JSON.stringify(this.user)); } catch (_) { /* ignore */ }
      this.authCb?.(this.user);
      this.emit('profiles', this.profiles());
    }

    async register(args) { return this.signIn(args); }

    async signOut() {
      this.user = null;
      try { localStorage.removeItem('nitro-hq-local-user'); } catch (_) { /* ignore */ }
      this.authCb?.(null);
    }

    /* ---- profiles ---- */
    profiles() { return Object.values(this.state.profiles).sort((a, b) => a.name.localeCompare(b.name)); }
    onProfiles(cb) { return this.listen('profiles', cb, () => this.profiles()); }
    async heartbeat() {
      if (!this.user) return;
      this.state.profiles[this.user.uid].lastSeen = Date.now();
      this.save();
      this.emit('profiles', this.profiles());
    }

    /* ---- meters ---- */
    meters() { return Object.values(this.state.meters).sort((a, b) => a.order - b.order); }
    onMeters(cb) { return this.listen('meters', cb, () => this.meters()); }
    onMeterUpdates(cb) { return this.listen('meterUpdates', cb, () => [...this.state.meterUpdates].sort((a, b) => b.at - a.at).slice(0, 40)); }

    async updateMeter(id, { value, note, label }) {
      const meter = this.state.meters[id];
      if (!meter || !this.user) return;
      if (!canUpdateMeter(meter, this.user)) throw new Error(`Only ${meter.ownerName} can move this slider.`);
      meter.value = Math.max(0, Number(value) || 0);
      if (label && clean(label, 40)) meter.label = clean(label, 40);
      meter.updatedBy = this.user.uid;
      meter.updatedByName = this.user.name;
      meter.updatedAt = Date.now();
      this.state.meterUpdates.unshift({ id: uid(), meterId: id, label: meter.label, value: meter.value, unit: meter.unit, note: clean(note, 280), by: this.user.uid, byName: this.user.name, at: Date.now() });
      this.state.meterUpdates = this.state.meterUpdates.slice(0, 120);
      this.save();
      this.emit('meters', this.meters());
      this.emit('meterUpdates', [...this.state.meterUpdates]);
    }

    /* ---- conversations ---- */
    conversations() {
      const me = this.user?.uid;
      return Object.values(this.state.conversations)
        .filter((c) => c.type === 'team' || c.members.includes(me))
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    }
    onConversations(cb) { return this.listen('conversations', cb, () => this.conversations()); }

    async createGroup(name, memberUids) {
      const id = uid();
      const members = [...new Set([...memberUids, this.user.uid])];
      this.state.conversations[id] = { id, type: 'group', name: clean(name, 40) || 'Group', members, createdBy: this.user.uid, createdAt: Date.now(), lastMessageAt: Date.now(), lastMessageText: '' };
      this.state.messages[id] = [];
      this.save();
      this.emit('conversations', this.conversations());
      return id;
    }

    async openDm(otherUid) {
      const id = `dm_${[this.user.uid, otherUid].sort().join('_')}`;
      if (!this.state.conversations[id]) {
        this.state.conversations[id] = { id, type: 'dm', name: '', members: [this.user.uid, otherUid], createdBy: this.user.uid, createdAt: Date.now(), lastMessageAt: Date.now(), lastMessageText: '' };
        this.state.messages[id] = [];
        this.save();
        this.emit('conversations', this.conversations());
      }
      return id;
    }

    async renameConversation(convId, name) {
      const conv = this.state.conversations[convId];
      const cleanName = clean(name, 40);
      if (!conv || !cleanName) return;
      if (conv.type === 'dm') throw new Error('Direct messages take the other person\u2019s name.');
      if (conv.type === 'group' && !conv.members.includes(this.user.uid)) throw new Error('Only members can rename this group.');
      conv.name = cleanName;
      this.save();
      this.emit('conversations', this.conversations());
    }

    onMessages(convId, cb) { return this.listen(`messages:${convId}`, cb, () => [...(this.state.messages[convId] || [])]); }

    async sendMessage(convId, text) {
      const body = clean(text, 2000);
      if (!body || !this.user) return;
      const message = { id: uid(), text: body, by: this.user.uid, byName: this.user.name, at: Date.now() };
      (this.state.messages[convId] ||= []).push(message);
      const conv = this.state.conversations[convId];
      if (conv) { conv.lastMessageAt = message.at; conv.lastMessageText = body.slice(0, 80); }
      this.save();
      this.emit(`messages:${convId}`, [...this.state.messages[convId]]);
      this.emit('conversations', this.conversations());
    }

    async setTyping() { /* nobody else is here in local mode */ }
    onTyping(convId, cb) { cb([]); return () => {}; }

    /* ---- tasks ---- */
    tasks() { return Object.values(this.state.tasks); }
    onTasks(cb) { return this.listen('tasks', cb, () => this.tasks()); }

    async addTask(task) {
      const id = uid();
      const assignee = this.state.profiles[task.assignee];
      this.state.tasks[id] = {
        id, title: clean(task.title, 120), details: clean(task.details, 1000), assignee: task.assignee, assigneeName: assignee?.name || 'Member',
        assignedBy: this.user.uid, assignedByName: this.user.name, priority: task.priority, deadline: task.deadline, status: 'todo', createdAt: Date.now(), updatedAt: Date.now()
      };
      this.save();
      this.emit('tasks', this.tasks());
    }

    async updateTask(id, fields) {
      const t = this.state.tasks[id];
      if (!t || t.assignedBy !== this.user.uid) throw new Error('Only the person who assigned this task can edit it.');
      Object.assign(t, {
        title: clean(fields.title ?? t.title, 120), details: clean(fields.details ?? t.details, 1000),
        assignee: fields.assignee ?? t.assignee, assigneeName: this.state.profiles[fields.assignee ?? t.assignee]?.name || t.assigneeName,
        priority: fields.priority ?? t.priority, deadline: fields.deadline ?? t.deadline, updatedAt: Date.now()
      });
      this.save();
      this.emit('tasks', this.tasks());
    }

    async setTaskStatus(id, status) {
      const t = this.state.tasks[id];
      if (!t || t.assignee !== this.user.uid) throw new Error('Only the assignee can change the status of this task.');
      t.status = status;
      t.updatedAt = Date.now();
      this.save();
      this.emit('tasks', this.tasks());
    }

    async deleteTask(id) {
      const t = this.state.tasks[id];
      if (!t || t.assignedBy !== this.user.uid) throw new Error('Only the person who assigned this task can delete it.');
      delete this.state.tasks[id];
      this.save();
      this.emit('tasks', this.tasks());
    }

    /* ---- events ---- */
    events() { return Object.values(this.state.events); }
    onEvents(cb) { return this.listen('events', cb, () => this.events()); }

    async addEvent(ev) {
      const id = uid();
      this.state.events[id] = { id, title: clean(ev.title, 120), category: ev.category, date: ev.date, time: ev.time || '', notes: clean(ev.notes, 500), by: this.user.uid, byName: this.user.name, createdAt: Date.now() };
      this.save();
      this.emit('events', this.events());
    }

    async deleteEvent(id) {
      const e = this.state.events[id];
      if (!e || e.by !== this.user.uid) throw new Error('Only the person who added this event can remove it.');
      delete this.state.events[id];
      this.save();
      this.emit('events', this.events());
    }
  }

  /* ====================================================================
     Firebase store (live mode)
     ==================================================================== */
  /* Every Firebase call on the way in gets a time limit, so a stuck request
     shows a message instead of freezing the sign-in button. */
  const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { const e = new Error(message); e.code = 'nitro/timeout'; reject(e); }, ms);
    Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

  class FirebaseStore {
    constructor(config) {
      this.mode = 'live';
      this.config = config;
      this.user = null;
      this.profileName = '';
    }

    async init() {
      firebase.initializeApp(this.config.firebase);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      /* Long polling instead of streaming: works through school networks,
         content blockers and Safari quirks that silently stall Firestore. */
      try { this.db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (_) { /* already set */ }
      this.status = () => {};
      this.FieldValue = firebase.firestore.FieldValue;
      /* No offline cache: in Safari it can lock up when several HQ tabs are open.
         Meters and the team channel are created after sign-in (the rules need a user). */
    }

    ts(value) {
      if (!value) return Date.now();
      if (typeof value.toMillis === 'function') return value.toMillis();
      return Number(value) || Date.now();
    }

    doc(snapshot) { return { id: snapshot.id, ...snapshot.data() }; }

    /* ---- auth ---- */
    onAuth(cb) {
      this.auth.onAuthStateChanged(async (fbUser) => {
        if (!fbUser) { this.user = null; cb(null); return; }
        const profileRef = this.db.collection('profiles').doc(fbUser.uid);
        let name = this.profileName || fbUser.displayName || fbUser.email.split('@')[0];
        try {
          this.status('Signed in. Loading your profile\u2026');
          const snap = await withTimeout(profileRef.get(), 12000, 'The database did not answer (profile).');
          if (snap.exists && snap.data().name) name = snap.data().name;
          const role = (this.config.team || []).find((p) => sameName(p.name, name))?.role || '';
          await withTimeout(profileRef.set({ uid: fbUser.uid, name, role, colour: colourFor(name), lastSeen: this.FieldValue.serverTimestamp() }, { merge: true }), 12000, 'The database did not answer (saving profile).');
        } catch (error) { console.warn('[N!TRO HQ] profile', error); this.lastError = error; }
        this.user = { uid: fbUser.uid, name };
        this.status('Setting up the HQ\u2026');
        await withTimeout(Promise.all([this.ensureMeters(), this.ensureTeamChannel()]), 12000, 'setup').catch((error) => console.warn('[N!TRO HQ] setup', error));
        this.status('');
        cb(this.user);
      });
    }

    currentUser() { return this.user; }

    async signIn({ email, password }) {
      await withTimeout(this.auth.signInWithEmailAndPassword(email, password), 20000, 'Sign-in timed out: Firebase did not answer. Close other HQ tabs and try again.');
    }

    async register({ name, email, password }) {
      this.profileName = clean(name, 40);
      if (this.profileName.length < 2) throw new Error('Please enter your name.');
      const credential = await withTimeout(this.auth.createUserWithEmailAndPassword(email, password), 20000, 'Creating the account timed out: Firebase did not answer.');
      credential.user.updateProfile({ displayName: this.profileName }).catch(() => {});
    }

    async signOut() { await this.auth.signOut(); }

    /* ---- profiles ---- */
    onProfiles(cb) {
      return this.db.collection('profiles').onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const p = this.doc(d); return { ...p, lastSeen: this.ts(p.lastSeen) }; }).sort((a, b) => a.name.localeCompare(b.name)));
      });
    }

    async heartbeat() {
      if (!this.user) return;
      await this.db.collection('profiles').doc(this.user.uid).set({ lastSeen: this.FieldValue.serverTimestamp() }, { merge: true });
    }

    /* ---- meters ---- */
    async ensureMeters() {
      /* Create any meter from config that does not exist yet (never overwrites values). */
      const col = this.db.collection('meters');
      const existing = await col.get().catch(() => null);
      const have = new Set(existing ? existing.docs.map((d) => d.id) : []);
      const batch = this.db.batch();
      let pending = 0;
      meterDefinitions(this.config).forEach((m) => {
        if (have.has(m.id)) return;
        batch.set(col.doc(m.id), { ...m, value: 0, updatedBy: '', updatedByName: '', updatedAt: this.FieldValue.serverTimestamp() });
        pending += 1;
      });
      if (pending) await batch.commit().catch(() => {});
    }

    onMeters(cb) {
      return this.db.collection('meters').onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const m = this.doc(d); return { ...m, updatedAt: this.ts(m.updatedAt) }; }).sort((a, b) => a.order - b.order));
      });
    }

    onMeterUpdates(cb) {
      return this.db.collection('meterUpdates').orderBy('at', 'desc').limit(40).onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const u = this.doc(d); return { ...u, at: this.ts(u.at) }; }));
      });
    }

    async updateMeter(id, { value, note, label }) {
      const ref = this.db.collection('meters').doc(id);
      const snap = await ref.get();
      const meter = snap.data();
      if (!canUpdateMeter(meter, this.user)) throw new Error(`Only ${meter.ownerName} can move this slider.`);
      const fields = { value: Math.max(0, Number(value) || 0), updatedBy: this.user.uid, updatedByName: this.user.name, updatedAt: this.FieldValue.serverTimestamp() };
      if (label && clean(label, 40)) fields.label = clean(label, 40);
      await ref.set(fields, { merge: true });
      await this.db.collection('meterUpdates').add({ meterId: id, label: fields.label || meter.label, value: fields.value, unit: meter.unit, note: clean(note, 280), by: this.user.uid, byName: this.user.name, at: this.FieldValue.serverTimestamp() });
    }

    /* ---- conversations ---- */
    async ensureTeamChannel() {
      const ref = this.db.collection('conversations').doc('team');
      const snap = await ref.get().catch(() => null);
      if (snap && snap.exists) return;
      await ref.set({ type: 'team', name: 'Team channel', members: [], createdAt: this.FieldValue.serverTimestamp(), lastMessageAt: this.FieldValue.serverTimestamp(), lastMessageText: '' }).catch(() => {});
    }

    onConversations(cb) {
      let team = null;
      let mine = [];
      const push = () => cb([team, ...mine].filter(Boolean).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)));
      const unsubTeam = this.db.collection('conversations').doc('team').onSnapshot((d) => { if (d.exists) { const c = this.doc(d); team = { ...c, lastMessageAt: this.ts(c.lastMessageAt) }; push(); } });
      const unsubMine = this.db.collection('conversations').where('members', 'array-contains', this.user.uid).onSnapshot((qs) => {
        mine = qs.docs.map((d) => { const c = this.doc(d); return { ...c, lastMessageAt: this.ts(c.lastMessageAt) }; });
        push();
      });
      return () => { unsubTeam(); unsubMine(); };
    }

    async createGroup(name, memberUids) {
      const members = [...new Set([...memberUids, this.user.uid])];
      const ref = await this.db.collection('conversations').add({ type: 'group', name: clean(name, 40) || 'Group', members, createdBy: this.user.uid, createdAt: this.FieldValue.serverTimestamp(), lastMessageAt: this.FieldValue.serverTimestamp(), lastMessageText: '' });
      return ref.id;
    }

    async openDm(otherUid) {
      const id = `dm_${[this.user.uid, otherUid].sort().join('_')}`;
      const ref = this.db.collection('conversations').doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({ type: 'dm', name: '', members: [this.user.uid, otherUid], createdBy: this.user.uid, createdAt: this.FieldValue.serverTimestamp(), lastMessageAt: this.FieldValue.serverTimestamp(), lastMessageText: '' });
      }
      return id;
    }

    async renameConversation(convId, name) {
      const cleanName = clean(name, 40);
      if (!cleanName) return;
      await this.db.collection('conversations').doc(convId).update({ name: cleanName });
    }

    onMessages(convId, cb) {
      return this.db.collection('conversations').doc(convId).collection('messages').orderBy('at', 'asc').limitToLast(300).onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const m = this.doc(d); return { ...m, at: this.ts(m.at) }; }));
      });
    }

    async sendMessage(convId, text) {
      const body = clean(text, 2000);
      if (!body) return;
      const convRef = this.db.collection('conversations').doc(convId);
      await convRef.collection('messages').add({ text: body, by: this.user.uid, byName: this.user.name, at: this.FieldValue.serverTimestamp() });
      await convRef.set({ lastMessageAt: this.FieldValue.serverTimestamp(), lastMessageText: body.slice(0, 80) }, { merge: true });
      await this.setTyping(convId, false);
    }

    async setTyping(convId, isTyping) {
      const ref = this.db.collection('conversations').doc(convId).collection('typing').doc(this.user.uid);
      if (isTyping) await ref.set({ name: this.user.name, at: this.FieldValue.serverTimestamp() });
      else await ref.delete().catch(() => {});
    }

    onTyping(convId, cb) {
      return this.db.collection('conversations').doc(convId).collection('typing').onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const t = this.doc(d); return { uid: d.id, name: t.name, at: this.ts(t.at) }; }).filter((t) => t.uid !== this.user.uid));
      });
    }

    /* ---- tasks ---- */
    onTasks(cb) {
      return this.db.collection('tasks').onSnapshot((qs) => {
        cb(qs.docs.map((d) => { const t = this.doc(d); return { ...t, createdAt: this.ts(t.createdAt), updatedAt: this.ts(t.updatedAt) }; }));
      });
    }

    async addTask(task) {
      const assignee = await this.db.collection('profiles').doc(task.assignee).get();
      await this.db.collection('tasks').add({
        title: clean(task.title, 120), details: clean(task.details, 1000), assignee: task.assignee, assigneeName: assignee.exists ? assignee.data().name : 'Member',
        assignedBy: this.user.uid, assignedByName: this.user.name, priority: task.priority, deadline: task.deadline, status: 'todo',
        createdAt: this.FieldValue.serverTimestamp(), updatedAt: this.FieldValue.serverTimestamp()
      });
    }

    async updateTask(id, fields) {
      const update = { updatedAt: this.FieldValue.serverTimestamp() };
      if (fields.title !== undefined) update.title = clean(fields.title, 120);
      if (fields.details !== undefined) update.details = clean(fields.details, 1000);
      if (fields.priority !== undefined) update.priority = fields.priority;
      if (fields.deadline !== undefined) update.deadline = fields.deadline;
      if (fields.assignee !== undefined) {
        update.assignee = fields.assignee;
        const assignee = await this.db.collection('profiles').doc(fields.assignee).get();
        update.assigneeName = assignee.exists ? assignee.data().name : 'Member';
      }
      await this.db.collection('tasks').doc(id).update(update);
    }

    async setTaskStatus(id, status) {
      await this.db.collection('tasks').doc(id).update({ status, updatedAt: this.FieldValue.serverTimestamp() });
    }

    async deleteTask(id) { await this.db.collection('tasks').doc(id).delete(); }

    /* ---- events ---- */
    onEvents(cb) {
      return this.db.collection('events').onSnapshot((qs) => cb(qs.docs.map((d) => this.doc(d))));
    }

    async addEvent(ev) {
      await this.db.collection('events').add({ title: clean(ev.title, 120), category: ev.category, date: ev.date, time: ev.time || '', notes: clean(ev.notes, 500), by: this.user.uid, byName: this.user.name, createdAt: this.FieldValue.serverTimestamp() });
    }

    async deleteEvent(id) { await this.db.collection('events').doc(id).delete(); }
  }

  window.NitroStore = {
    canUpdateMeter,
    sameName,
    create(config) {
      const fb = config.firebase || {};
      const live = Boolean(fb.apiKey && fb.projectId) && typeof firebase !== 'undefined';
      const store = live ? new FirebaseStore(config) : new LocalStore(config);
      store.sdkMissing = Boolean(fb.apiKey && fb.projectId) && typeof firebase === 'undefined';
      return store;
    },
    colourFor
  };
})();
