(() => {
  'use strict';

  const DAYS = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
  ];
  // Soft tones that stay readable on the black theme.
  const PALETTE = ['#8b9cff', '#5cc8d8', '#6fcf97', '#e8b86a', '#f08bb0', '#b19cf5', '#f28b82', '#62d0b8', '#7fb2ff', '#c3d96b'];
  const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

  let state = TimetableStore.load();
  let activeCell = null; // { day, slotId } being edited in the dialog

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
  // Subjects saved without a colour fall back to a palette tone based on their position.
  const subjectColor = (s) => safeColor(s.color) || PALETTE[Math.max(0, state.subjects.indexOf(s)) % PALETTE.length];
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const findById = (list, id) => list.find((x) => x.id === id);
  const cellKey = (day, slotId) => `${day}|${slotId}`;
  const entriesWhere = (pred) => Object.entries(state.entries).filter(([key, e]) => pred(e, key));

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMinutes = (mins) => {
    const clamped = Math.min(mins, 23 * 60 + 59);
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  };
  const formatTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const slotRange = (s) => `${formatTime(s.start)} – ${formatTime(s.end)}`;
  const sortedSlots = () => [...state.slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const formValues = (form) =>
    Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

  function commit(message) {
    TimetableStore.save(state);
    render();
    if (message) toast(message);
  }

  let toastTimer;
  function toast(message, type = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const deleteButton = (id, name) =>
    `<button type="button" class="icon-btn" data-delete="${esc(id)}" aria-label="Delete ${esc(name)}" title="Delete">${TRASH_ICON}</button>`;
  const emptyItem = (text) => `<li class="list-empty">${text}</li>`;

  // ---------- Tabs ----------
  function showTab(name) {
    $$('.tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('.tab-panel').forEach((panel) => (panel.hidden = panel.id !== `panel-${name}`));
  }
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  // ---------- Add forms ----------
  $('#form-subject').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const { name, code, faculty, color } = formValues(form);
    if (state.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return toast('That subject already exists', 'error');
    }
    state.subjects.push({ id: TimetableStore.uid(), name, code, faculty, color: safeColor(color) || PALETTE[0] });
    form.reset();
    form.elements.color.value = PALETTE[state.subjects.length % PALETTE.length];
    form.elements.name.focus();
    commit('Subject added');
  });

  $('#form-slot').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const { start, end, label, isBreak } = formValues(form);
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) return toast('End time must be after start time', 'error');

    const clash = state.slots.find((s) => startMin < toMinutes(s.end) && toMinutes(s.start) < endMin);
    if (clash) return toast(`Overlaps with ${slotRange(clash)}`, 'error');

    state.slots.push({ id: TimetableStore.uid(), start, end, label, isBreak: Boolean(isBreak) });

    // Pre-fill the next slot so adding a full day is quick.
    form.reset();
    form.elements.start.value = end;
    form.elements.end.value = fromMinutes(endMin + (endMin - startMin));
    commit('Time slot added');
  });

  $('#form-room').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const { name, type, capacity } = formValues(form);
    if (state.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return toast('That room already exists', 'error');
    }
    state.rooms.push({ id: TimetableStore.uid(), name, type, capacity: capacity ? Number(capacity) : null });
    form.reset();
    form.elements.name.focus();
    commit('Room added');
  });

  // ---------- Delete (event delegation) ----------
  function onDelete(listSelector, handler) {
    $(listSelector).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete]');
      if (btn) handler(btn.dataset.delete);
    });
  }

  onDelete('#list-subjects', (id) => {
    const subject = findById(state.subjects, id);
    const used = entriesWhere((e) => e.subjectId === id);
    if (used.length && !confirm(`"${subject.name}" is scheduled in ${plural(used.length, 'class', 'classes')}. Delete it and remove those classes?`)) return;
    used.forEach(([key]) => delete state.entries[key]);
    state.subjects = state.subjects.filter((s) => s.id !== id);
    commit('Subject deleted');
  });

  onDelete('#list-slots', (id) => {
    const used = entriesWhere((_, key) => key.endsWith(`|${id}`));
    if (used.length && !confirm(`This slot has ${plural(used.length, 'class', 'classes')} scheduled. Delete it anyway?`)) return;
    used.forEach(([key]) => delete state.entries[key]);
    state.slots = state.slots.filter((s) => s.id !== id);
    commit('Time slot deleted');
  });

  onDelete('#list-rooms', (id) => {
    const room = findById(state.rooms, id);
    const used = entriesWhere((e) => e.roomId === id);
    if (used.length && !confirm(`"${room.name}" is used by ${plural(used.length, 'class', 'classes')}. Delete it? Those classes will keep their subject but lose the room.`)) return;
    used.forEach(([, entry]) => (entry.roomId = ''));
    state.rooms = state.rooms.filter((r) => r.id !== id);
    commit('Room deleted');
  });

  // ---------- Cell dialog ----------
  const dialog = $('#cell-dialog');
  const cellForm = $('#form-cell');

  function openCellDialog(day, slotId) {
    if (!state.subjects.length) {
      showTab('subjects');
      $('#form-subject').elements.name.focus();
      return toast('Add a subject first', 'error');
    }
    activeCell = { day, slotId };
    const slot = findById(state.slots, slotId);
    const entry = state.entries[cellKey(day, slotId)] || {};

    $('#cell-title').textContent = DAYS.find((d) => d.key === day).label;
    $('#cell-subtitle').textContent = slotRange(slot) + (slot.label ? ` · ${slot.label}` : '');

    cellForm.elements.subjectId.innerHTML =
      '<option value="">Select a subject…</option>' +
      state.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.code ? ` (${esc(s.code)})` : ''}</option>`).join('');
    cellForm.elements.roomId.innerHTML =
      '<option value="">No room</option>' +
      state.rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}${r.type ? ` · ${esc(r.type)}` : ''}</option>`).join('');

    cellForm.elements.subjectId.value = entry.subjectId || '';
    cellForm.elements.roomId.value = entry.roomId || '';
    $('#btn-cell-clear').hidden = !entry.subjectId;
    dialog.showModal();
  }

  cellForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { subjectId, roomId } = formValues(cellForm);
    state.entries[cellKey(activeCell.day, activeCell.slotId)] = { subjectId, roomId };
    dialog.close();
    commit('Class saved');
  });

  $('#btn-cell-clear').addEventListener('click', () => {
    delete state.entries[cellKey(activeCell.day, activeCell.slotId)];
    dialog.close();
    commit('Class removed');
  });

  $('#btn-cell-cancel').addEventListener('click', () => dialog.close());
  // Browsers close <dialog> on Escape natively; this covers embedded browsers that don't.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dialog.close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // click on backdrop
  });

  $('#timetable').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) openCellDialog(cell.dataset.day, cell.dataset.slot);
  });

  // ---------- Header actions ----------
  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Delete all subjects, time slots, rooms and classes? This cannot be undone.')) return;
    state = TimetableStore.empty();
    commit('Everything cleared');
  });

  $('#btn-sample').addEventListener('click', () => {
    const hasData = state.subjects.length || state.slots.length || state.rooms.length;
    if (hasData && !confirm('Replace your current timetable with sample data?')) return;
    state = sampleData();
    commit('Sample timetable loaded');
  });

  // ---------- Rendering ----------
  function render() {
    renderSubjects();
    renderSlots();
    renderRooms();
    renderTimetable();
    $('#count-subjects').textContent = state.subjects.length;
    $('#count-slots').textContent = state.slots.length;
    $('#count-rooms').textContent = state.rooms.length;
  }

  function renderSubjects() {
    $('#list-subjects').innerHTML = state.subjects.length
      ? state.subjects.map((s) => {
          const count = entriesWhere((e) => e.subjectId === s.id).length;
          const meta = [s.code, s.faculty, `${plural(count, 'class', 'classes')}/week`].filter(Boolean).join(' · ');
          return `<li class="item">
            <span class="swatch" style="--c:${subjectColor(s)}"></span>
            <div class="item-main">
              <div class="item-title">${esc(s.name)}</div>
              <div class="item-meta">${esc(meta)}</div>
            </div>
            ${deleteButton(s.id, s.name)}
          </li>`;
        }).join('')
      : emptyItem('No subjects yet. Add your first one above.');
  }

  function renderSlots() {
    $('#list-slots').innerHTML = state.slots.length
      ? sortedSlots().map((s) => {
          const minutes = toMinutes(s.end) - toMinutes(s.start);
          const meta = [s.label, `${minutes} min`].filter(Boolean).join(' · ');
          return `<li class="item">
            <div class="item-main">
              <div class="item-title">${slotRange(s)}${s.isBreak ? '<span class="badge">Break</span>' : ''}</div>
              <div class="item-meta">${esc(meta)}</div>
            </div>
            ${deleteButton(s.id, slotRange(s))}
          </li>`;
        }).join('')
      : emptyItem('No time slots yet. Add periods and breaks above.');
  }

  function renderRooms() {
    $('#list-rooms').innerHTML = state.rooms.length
      ? state.rooms.map((r) => {
          const count = entriesWhere((e) => e.roomId === r.id).length;
          const meta = [r.type, r.capacity ? `${r.capacity} seats` : '', `${plural(count, 'class', 'classes')}/week`].filter(Boolean).join(' · ');
          return `<li class="item">
            <div class="item-main">
              <div class="item-title">${esc(r.name)}</div>
              <div class="item-meta">${esc(meta)}</div>
            </div>
            ${deleteButton(r.id, r.name)}
          </li>`;
        }).join('')
      : emptyItem('No rooms yet. Add classrooms and labs above.');
  }

  function renderTimetable() {
    const slots = sortedSlots();
    const table = $('#timetable');
    $('#empty-state').hidden = slots.length > 0;
    $('.table-wrap').hidden = slots.length === 0;
    if (!slots.length) {
      table.innerHTML = '';
      return;
    }

    const todayKey = DAYS[(new Date().getDay() + 6) % 7]?.key; // Sunday → undefined
    const todayClass = (day) => (day.key === todayKey ? ' class="today"' : '');

    const head = `<thead><tr>
      <th scope="col" class="time-col">Time</th>
      ${DAYS.map((d) => `<th scope="col"${todayClass(d)}><span class="day-full">${d.label}</span><span class="day-short">${d.label.slice(0, 3)}</span></th>`).join('')}
    </tr></thead>`;

    const rows = slots.map((slot) => {
      const timeCell = `<th scope="row" class="time-col">
        <span class="t-start">${formatTime(slot.start)}</span>
        <span class="t-end">${formatTime(slot.end)}</span>
        ${slot.label && !slot.isBreak ? `<span class="t-label">${esc(slot.label)}</span>` : ''}
      </th>`;

      if (slot.isBreak) {
        return `<tr class="break-row">${timeCell}<td colspan="${DAYS.length}">${esc(slot.label || 'Break')}</td></tr>`;
      }

      const cells = DAYS.map((day) => {
        const entry = state.entries[cellKey(day.key, slot.id)];
        const subject = entry && findById(state.subjects, entry.subjectId);
        const where = `${day.label}, ${slotRange(slot)}`;
        const attrs = `type="button" data-day="${day.key}" data-slot="${esc(slot.id)}"`;

        if (!subject) {
          return `<td${todayClass(day)}><button ${attrs} class="cell" aria-label="Add class: ${where}"></button></td>`;
        }
        const room = findById(state.rooms, entry.roomId);
        const meta = [room ? room.name : 'No room', subject.faculty].filter(Boolean).join(' · ');
        return `<td${todayClass(day)}>
          <button ${attrs} class="cell filled" style="--c:${subjectColor(subject)}" aria-label="${esc(subject.name)}, ${esc(meta)}, ${where}. Edit">
            <span class="cell-subject">${esc(subject.name)}</span>
            ${subject.code ? `<span class="cell-code">${esc(subject.code)}</span>` : ''}
            <span class="cell-meta">${esc(meta)}</span>
          </button>
        </td>`;
      }).join('');

      return `<tr>${timeCell}${cells}</tr>`;
    }).join('');

    table.innerHTML = `${head}<tbody>${rows}</tbody>`;
  }

  // ---------- Sample data ----------
  function sampleData() {
    const subjects = [
      { name: 'Data Structures', code: 'CS201', faculty: 'Dr. Meera Iyer' },
      { name: 'Database Systems', code: 'CS202', faculty: 'Prof. Arjun Nair' },
      { name: 'Operating Systems', code: 'CS203', faculty: 'Dr. Kavya Rao' },
      { name: 'Discrete Mathematics', code: 'MA201', faculty: 'Prof. S. Kumar' },
      { name: 'Computer Networks', code: 'CS204', faculty: 'Dr. Rahul Menon' },
      { name: 'Data Structures Lab', code: 'CS251', faculty: 'Dr. Meera Iyer' },
    ].map((s, i) => ({ id: TimetableStore.uid(), ...s, color: PALETTE[i] }));

    const rooms = [
      { name: 'LH-101', type: 'Classroom', capacity: 60 },
      { name: 'LH-102', type: 'Classroom', capacity: 60 },
      { name: 'CS Lab 2', type: 'Lab', capacity: 40 },
      { name: 'Seminar Hall', type: 'Seminar hall', capacity: 120 },
    ].map((r) => ({ id: TimetableStore.uid(), ...r }));

    const slots = [
      ['09:00', '09:50', 'Period 1'],
      ['09:50', '10:40', 'Period 2'],
      ['10:40', '11:00', 'Short break', true],
      ['11:00', '11:50', 'Period 3'],
      ['11:50', '12:40', 'Period 4'],
      ['12:40', '13:30', 'Lunch', true],
      ['13:30', '14:20', 'Period 5'],
      ['14:20', '15:10', 'Period 6'],
    ].map(([start, end, label, isBreak = false]) => ({ id: TimetableStore.uid(), start, end, label, isBreak }));

    // Subject index per teaching period (-1 = free period).
    const plan = {
      mon: [0, 1, 3, 2, 5, 5],
      tue: [1, 0, 2, 4, 3, -1],
      wed: [3, 2, 0, 1, 4, -1],
      thu: [4, 3, 1, 0, 5, 5],
      fri: [2, 4, 3, 1, 0, -1],
      sat: [0, 3, -1, -1, -1, -1],
    };
    const roomFor = (subjectIndex, dayIndex) =>
      subjectIndex === 5 ? rooms[2] : subjectIndex === 4 ? rooms[3] : rooms[dayIndex % 2];

    const teaching = slots.filter((s) => !s.isBreak);
    const entries = {};
    DAYS.forEach((day, dayIndex) => {
      plan[day.key].forEach((subjectIndex, period) => {
        if (subjectIndex < 0) return;
        entries[cellKey(day.key, teaching[period].id)] = {
          subjectId: subjects[subjectIndex].id,
          roomId: roomFor(subjectIndex, dayIndex).id,
        };
      });
    });

    return { subjects, slots, rooms, entries };
  }

  $('#form-subject').elements.color.value = PALETTE[state.subjects.length % PALETTE.length];
  render();
})();
