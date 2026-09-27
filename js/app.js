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
  // Nine clearly different hues, given out in order so neighbouring subjects never look alike.
  const PALETTE = ['#5aa9ff', '#35c8d8', '#3fd18a', '#b8d94a', '#f0c04a', '#ff9052', '#ff6f8f', '#ef7bd6', '#a98bff'];
  // The colours the app handed out before; swapped for the new set on load.
  const OLD_PALETTE = ['#8b9cff', '#5cc8d8', '#6fcf97', '#e8b86a', '#f08bb0', '#b19cf5', '#f28b82', '#62d0b8', '#7fb2ff', '#c3d96b'];
  const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
  const PENCIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  let state = TimetableStore.load();
  const firstRun = !TimetableStore.hasSaved();
  let activeCell = null; // { day, slotId } being edited in the cell dialog
  let editingSubjectId = null;
  let editingSlotId = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
  // Subjects saved without a colour fall back to a palette tone based on their position.
  const subjectColor = (s) => safeColor(s.color) || PALETTE[Math.max(0, state.subjects.indexOf(s)) % PALETTE.length];
  const nextColor = () => PALETTE[state.subjects.length % PALETTE.length];
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

  const iconButton = (action, id, label, icon) =>
    `<button type="button" class="icon-btn" data-${action}="${esc(id)}" aria-label="${label}" title="${label}">${icon}</button>`;
  const editButton = (id, name) => iconButton('edit', id, `Edit ${esc(name)}`, PENCIL_ICON);
  const deleteButton = (id, name) => iconButton('delete', id, `Delete ${esc(name)}`, TRASH_ICON);
  const emptyItem = (text) => `<li class="list-empty">${text}</li>`;

  // Subjects coloured from the old palette move to the matching colour in the new one.
  function migrateColors() {
    let changed = false;
    state.subjects.forEach((s) => {
      const i = OLD_PALETTE.indexOf(String(s.color || '').toLowerCase());
      if (i >= 0) {
        s.color = PALETTE[i % PALETTE.length];
        changed = true;
      }
    });
    return changed;
  }

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

  // ---------- Subjects ----------
  const subjectForm = $('#form-subject');

  subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { name, code, faculty, color } = formValues(subjectForm);
    const clash = state.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== editingSubjectId);
    if (clash) return toast('That subject already exists', 'error');

    if (editingSubjectId) {
      const subject = findById(state.subjects, editingSubjectId);
      Object.assign(subject, { name, code, faculty, color: safeColor(color) || subject.color });
      setSubjectEdit(null);
      return commit('Subject updated');
    }

    state.subjects.push({ id: TimetableStore.uid(), name, code, faculty, color: safeColor(color) || nextColor() });
    subjectForm.reset();
    subjectForm.elements.color.value = nextColor();
    subjectForm.elements.name.focus();
    commit('Subject added');
  });

  // Passing a subject switches the form to editing it; null returns it to adding.
  function setSubjectEdit(subject) {
    editingSubjectId = subject ? subject.id : null;
    const f = subjectForm.elements;
    if (subject) {
      f.name.value = subject.name || '';
      f.code.value = subject.code || '';
      f.faculty.value = subject.faculty || '';
      f.color.value = subjectColor(subject);
      showTab('subjects');
      f.name.focus();
    } else {
      subjectForm.reset();
      f.color.value = nextColor();
    }
    $('#btn-subject-submit').textContent = subject ? 'Save changes' : 'Add subject';
    $('#btn-subject-cancel').hidden = !subject;
    renderSubjects();
  }

  $('#btn-subject-cancel').addEventListener('click', () => setSubjectEdit(null));

  // ---------- Time slots ----------
  const slotForm = $('#form-slot');

  slotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { start, end, label, isBreak } = formValues(slotForm);
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) return toast('End time must be after start time', 'error');

    const clash = state.slots.find((s) => s.id !== editingSlotId && startMin < toMinutes(s.end) && toMinutes(s.start) < endMin);
    if (clash) return toast(`Overlaps with ${slotRange(clash)}`, 'error');

    if (editingSlotId) {
      Object.assign(findById(state.slots, editingSlotId), { start, end, label, isBreak: Boolean(isBreak) });
      setSlotEdit(null);
      return commit('Time slot updated');
    }

    state.slots.push({ id: TimetableStore.uid(), start, end, label, isBreak: Boolean(isBreak) });

    // Pre-fill the next slot so adding a full day is quick.
    slotForm.reset();
    slotForm.elements.start.value = end;
    slotForm.elements.end.value = fromMinutes(endMin + (endMin - startMin));
    commit('Time slot added');
  });

  function setSlotEdit(slot) {
    editingSlotId = slot ? slot.id : null;
    const f = slotForm.elements;
    if (slot) {
      f.start.value = slot.start;
      f.end.value = slot.end;
      f.label.value = slot.label || '';
      f.isBreak.checked = Boolean(slot.isBreak);
      showTab('slots');
      f.start.focus();
    } else {
      slotForm.reset();
    }
    $('#btn-slot-submit').textContent = slot ? 'Save changes' : 'Add time slot';
    $('#btn-slot-cancel').hidden = !slot;
    renderSlots();
  }

  $('#btn-slot-cancel').addEventListener('click', () => setSlotEdit(null));

  // ---------- List buttons (event delegation) ----------
  function onList(listSelector, handlers) {
    $(listSelector).addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) return handlers.edit(edit.dataset.edit);
      const remove = e.target.closest('[data-delete]');
      if (remove) return handlers.remove(remove.dataset.delete);
    });
  }

  onList('#list-subjects', {
    edit: (id) => setSubjectEdit(findById(state.subjects, id)),
    remove: (id) => {
      const subject = findById(state.subjects, id);
      const used = entriesWhere((e) => e.subjectId === id);
      if (used.length && !confirm(`"${subject.name}" is scheduled in ${plural(used.length, 'class', 'classes')}. Delete it and remove those classes?`)) return;
      used.forEach(([key]) => delete state.entries[key]);
      state.subjects = state.subjects.filter((s) => s.id !== id);
      if (editingSubjectId === id) setSubjectEdit(null);
      commit('Subject deleted');
    },
  });

  onList('#list-slots', {
    edit: (id) => setSlotEdit(findById(state.slots, id)),
    remove: (id) => {
      const used = entriesWhere((_, key) => key.endsWith(`|${id}`));
      if (used.length && !confirm(`This slot has ${plural(used.length, 'class', 'classes')} scheduled. Delete it anyway?`)) return;
      used.forEach(([key]) => delete state.entries[key]);
      state.slots = state.slots.filter((s) => s.id !== id);
      if (editingSlotId === id) setSlotEdit(null);
      commit('Time slot deleted');
    },
  });

  // ---------- Class name ----------
  const classDialog = $('#class-dialog');
  const classForm = $('#form-class');

  function openClassDialog() {
    classForm.elements.name.value = state.className || '';
    classDialog.showModal();
    classForm.elements.name.focus();
  }

  $('#btn-class').addEventListener('click', openClassDialog);

  classForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.className = formValues(classForm).name;
    classDialog.close();
    commit(state.className ? `Class set to ${state.className}` : 'Class name cleared');
  });

  $('#btn-class-skip').addEventListener('click', () => {
    classDialog.close();
    commit();
  });

  // ---------- Cell dialog ----------
  const dialog = $('#cell-dialog');
  const cellForm = $('#form-cell');

  function openCellDialog(day, slotId) {
    if (!state.subjects.length) {
      showTab('subjects');
      subjectForm.elements.name.focus();
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
    cellForm.elements.subjectId.value = entry.subjectId || '';
    $('#btn-cell-clear').hidden = !entry.subjectId;
    dialog.showModal();
  }

  cellForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { subjectId } = formValues(cellForm);
    state.entries[cellKey(activeCell.day, activeCell.slotId)] = { subjectId };
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
  [dialog, classDialog].forEach((d) => {
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') d.close();
    });
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close(); // click on backdrop
    });
  });

  $('#timetable').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) openCellDialog(cell.dataset.day, cell.dataset.slot);
  });

  // ---------- Header actions ----------
  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Delete all subjects, time slots and classes? This cannot be undone.')) return;
    const keepClass = state.className;
    state = TimetableStore.empty();
    state.className = keepClass;
    setSubjectEdit(null);
    setSlotEdit(null);
    commit('Everything cleared');
  });

  $('#btn-sample').addEventListener('click', () => {
    const hasData = state.subjects.length || state.slots.length;
    if (hasData && !confirm('Replace your current timetable with sample data?')) return;
    const keepClass = state.className;
    state = sampleData();
    state.className = keepClass;
    setSubjectEdit(null);
    setSlotEdit(null);
    commit('Sample timetable loaded');
  });

  // ---------- Rendering ----------
  function render() {
    applyBrand();
    renderSubjects();
    renderSlots();
    renderTimetable();
    $('#count-subjects').textContent = state.subjects.length;
    $('#count-slots').textContent = state.slots.length;
  }

  function applyBrand() {
    const label = state.className ? `${state.className} Timetable` : 'College Timetable';
    $('#brand-title').textContent = label;
    document.title = label;
  }

  function renderSubjects() {
    $('#list-subjects').innerHTML = state.subjects.length
      ? state.subjects.map((s) => {
          const count = entriesWhere((e) => e.subjectId === s.id).length;
          const meta = [s.code, s.faculty, `${plural(count, 'class', 'classes')}/week`].filter(Boolean).join(' · ');
          return `<li class="item${s.id === editingSubjectId ? ' editing' : ''}">
            <span class="swatch" style="--c:${subjectColor(s)}"></span>
            <div class="item-main">
              <div class="item-title">${esc(s.name)}</div>
              <div class="item-meta">${esc(meta)}</div>
            </div>
            ${editButton(s.id, s.name)}
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
          return `<li class="item${s.id === editingSlotId ? ' editing' : ''}">
            <div class="item-main">
              <div class="item-title">${slotRange(s)}${s.isBreak ? '<span class="badge">Break</span>' : ''}</div>
              <div class="item-meta">${esc(meta)}</div>
            </div>
            ${editButton(s.id, slotRange(s))}
            ${deleteButton(s.id, slotRange(s))}
          </li>`;
        }).join('')
      : emptyItem('No time slots yet. Add periods and breaks above.');
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
        const staff = subject.faculty || '';
        return `<td${todayClass(day)}>
          <button ${attrs} class="cell filled" style="--c:${subjectColor(subject)}" aria-label="${esc(subject.name)}, ${esc(staff)}, ${where}. Edit">
            <span class="cell-subject">${esc(subject.name)}</span>
            ${subject.code ? `<span class="cell-code">${esc(subject.code)}</span>` : ''}
            ${staff ? `<span class="cell-meta">${esc(staff)}</span>` : ''}
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
      { name: 'Matrices and Calculus', code: 'MA25C01', faculty: 'Dr. G. Meena' },
      { name: 'Applied Physics', code: 'PH2506', faculty: 'Dr. M. Suresh' },
      { name: 'Fundamentals of IOT', code: 'EC25C01', faculty: 'Mr. S. S. Hari' },
      { name: 'Problem Solving and Programming', code: 'CS25C01', faculty: 'Ms. J. Asha' },
      { name: 'Artificial Intelligence and Machine Learning', code: 'CS25C03', faculty: 'Ms. M. Jeya' },
      { name: 'Professional English - 1', code: 'EN25C09', faculty: 'Mrs. Sathya' },
    ].map((s, i) => ({ id: TimetableStore.uid(), ...s, color: PALETTE[i] }));

    const slots = [
      ['08:00', '08:40', '1'],
      ['08:40', '09:20', '2'],
      ['09:20', '09:30', 'Break', true],
      ['09:30', '10:10', '3'],
      ['10:10', '10:50', '4'],
      ['10:50', '11:30', 'Lunch', true],
      ['11:30', '12:10', '5'],
      ['12:10', '12:50', '6'],
    ].map(([start, end, label, isBreak = false]) => ({ id: TimetableStore.uid(), start, end, label, isBreak }));

    // Subject index per teaching period (-1 = free period).
    const plan = {
      mon: [0, 2, 4, 5, 3, 3],
      tue: [1, 1, 2, 0, 0, 4],
      wed: [0, 2, 4, 1, 3, 3],
      thu: [1, 1, 1, 0, 4, 4],
      fri: [0, 1, 3, 0, 5, 2],
      sat: [0, 3, -1, -1, -1, -1],
    };

    const teaching = slots.filter((s) => !s.isBreak);
    const entries = {};
    DAYS.forEach((day) => {
      plan[day.key].forEach((subjectIndex, period) => {
        if (subjectIndex < 0) return;
        entries[cellKey(day.key, teaching[period].id)] = { subjectId: subjects[subjectIndex].id };
      });
    });

    return { className: '', subjects, slots, entries };
  }

  if (migrateColors()) TimetableStore.save(state);
  subjectForm.elements.color.value = nextColor();
  render();
  if (firstRun) openClassDialog();
})();
