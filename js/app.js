const appShell = document.querySelector('.app-shell');
const continueButton = document.querySelector('.continue-button');

if (appShell && continueButton) {
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      appShell.classList.add('is-ready');
    }, 2400);
  });

  continueButton.addEventListener('click', () => {
    appShell.classList.add('is-entered');
    appShell.dataset.state = 'content';
    initBrowseUI();
  });
}

/* ── Browse UI ─────────────────────────────────── */

let songsData = [];
let setlistData = null;
let browseInitialised = false;

async function initBrowseUI() {
  if (browseInitialised) return;
  browseInitialised = true;

  const [songs, setlist] = await Promise.all([
    fetch('data/songs.json').then(r => r.json()),
    fetch('data/setlist.json').then(r => r.json()),
  ]);

  songsData = songs;
  setlistData = setlist;

  renderSongList(songsData);
  renderSetList(setlistData, songsData);
  bindTabs();
  bindSearch();
}

/* ── Rendering ─────────────────────────────────── */

function createSongCard(song, index) {
  const card = document.createElement('button');
  card.className = 'song-card';
  card.type = 'button';
  card.setAttribute('role', 'listitem');
  card.dataset.songId = song.id;
  card.innerHTML =
    '<span class="song-card__number">' + (index + 1) + '</span>' +
    '<span class="song-card__info">' +
      '<span class="song-card__title">' + escapeHtml(song.title) + '</span>' +
      '<span class="song-card__artist">' + escapeHtml(song.artist) + '</span>' +
    '</span>' +
    '<span class="song-card__arrow" aria-hidden="true">›</span>';

  card.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('open-song', { detail: { songId: song.id } }));
  });
  return card;
}

function renderSongList(songs) {
  const container = document.getElementById('view-songs');
  container.innerHTML = '';
  if (songs.length === 0) {
    container.innerHTML = '<p class="empty-state">No songs found.</p>';
    return;
  }
  songs.forEach((song, i) => container.appendChild(createSongCard(song, i)));
}

function renderSetList(setlist, allSongs) {
  const container = document.getElementById('view-setlist');
  container.innerHTML = '';
  const songMap = Object.fromEntries(allSongs.map(s => [s.id, s]));
  let globalIndex = 0;

  setlist.sections.forEach(section => {
    const group = document.createElement('div');
    group.className = 'setlist-section';
    group.innerHTML = '<h3 class="setlist-section__heading">' + escapeHtml(section.name) + '</h3>';

    const list = document.createElement('div');
    list.setAttribute('role', 'list');

    section.songIds.forEach(id => {
      const song = songMap[id];
      if (song) {
        list.appendChild(createSongCard(song, globalIndex));
        globalIndex++;
      }
    });

    group.appendChild(list);
    container.appendChild(group);
  });
}

/* ── Tabs ──────────────────────────────────────── */

function bindTabs() {
  const tabs = document.querySelectorAll('.view-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');

      const target = tab.dataset.view;
      document.querySelectorAll('.view-panel').forEach(panel => {
        panel.hidden = panel.id !== 'view-' + target;
      });
    });
  });
}

/* ── Search ────────────────────────────────────── */

function bindSearch() {
  const input = document.querySelector('.search-input');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      renderSongList(songsData);
      return;
    }
    const filtered = songsData.filter(song => {
      if (song.title.toLowerCase().includes(query)) return true;
      return song.lyrics.some(section =>
        section.lines.some(line => line.toLowerCase().includes(query))
      );
    });
    renderSongList(filtered);

    // Switch to All Songs view when searching
    const songsTab = document.querySelector('[data-view="songs"]');
    if (songsTab && !songsTab.classList.contains('is-active')) {
      songsTab.click();
    }
  });
}

/* ── Helpers ───────────────────────────────────── */

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}