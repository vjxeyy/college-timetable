// Persistence layer: the only file that touches localStorage.
const TimetableStore = (() => {
  const KEY = 'college-timetable:v1';

  const empty = () => ({ subjects: [], slots: [], rooms: [], entries: {} });

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (!data || typeof data !== 'object') return empty();
      return {
        subjects: Array.isArray(data.subjects) ? data.subjects : [],
        slots: Array.isArray(data.slots) ? data.slots : [],
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        entries: data.entries && typeof data.entries === 'object' ? data.entries : {},
      };
    } catch {
      return empty();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked (e.g. private mode) — the app keeps working in memory.
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return { load, save, empty, uid };
})();
