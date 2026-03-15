const appShell = document.querySelector('.app-shell');
const posterStage = document.querySelector('.poster-stage');

if (appShell && posterStage) {
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      appShell.classList.add('is-ready');
    }, 600);
  });

  posterStage.addEventListener('click', () => {
    if (appShell.dataset.state !== 'poster') return;
    appShell.classList.add('is-entered');
    appShell.dataset.state = 'content';
    initBrowseUI();
  });

  const searchBack = document.querySelector('.search-back');
  if (searchBack) {
    searchBack.addEventListener('click', (e) => {
      e.stopPropagation();

      // Step 1: Fade out the song list
      const contentOverlay = document.querySelector('.content-overlay');
      contentOverlay.style.transition = 'opacity 0.6s ease';
      contentOverlay.style.opacity = '0';
      contentOverlay.style.pointerEvents = 'none';

      // Also fade out corner art simultaneously
      document.querySelectorAll('.corner-art').forEach(art => {
        art.style.transition = 'opacity 0.6s ease';
        art.style.opacity = '0';
      });

      // Step 2: After fade-out completes, reset to landing page
      setTimeout(() => {
        appShell.classList.remove('is-entered');
        appShell.dataset.state = 'poster';

        // Reset the content overlay inline styles so CSS classes control it again
        contentOverlay.style.transition = '';
        contentOverlay.style.opacity = '';
        contentOverlay.style.pointerEvents = '';

        // Reset corner art inline styles so CSS classes control them again
        document.querySelectorAll('.corner-art').forEach(art => {
          art.style.transition = '';
          art.style.opacity = '';
        });

        // Re-trigger the continue text fade-in
        const posterStage = document.querySelector('.poster-stage');
        if (posterStage) {
          posterStage.classList.remove('is-ready');
          // Small delay then re-add is-ready to trigger the shimmer animation fresh
          setTimeout(() => {
            posterStage.classList.add('is-ready');
          }, 300);
        }
      }, 600); // Match the fade-out duration
    });
  }
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

  renderUnifiedList(setlistData, songsData);
  bindSearch();
}

/* ── Rendering ─────────────────────────────────── */

function createSongRow(song) {
  const row = document.createElement('button');
  row.className = 'song-row';
  row.type = 'button';
  row.setAttribute('role', 'listitem');
  row.dataset.songId = song.id;
  row.innerHTML =
    '<span class="song-row__title">' + escapeHtml(song.title) + '</span>' +
    '<span class="song-row__artist">' + escapeHtml(song.artist) + '</span>';

  row.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('open-song', { detail: { songId: song.id } }));
  });
  return row;
}

function renderUnifiedList(setlist, allSongs, filterQuery) {
  const container = document.getElementById('song-list');
  container.innerHTML = '';
  const songMap = Object.fromEntries(allSongs.map(s => [s.id, s]));

  if (filterQuery) {
    const query = filterQuery.toLowerCase();
    const filtered = allSongs.filter(song => {
      if (song.title.toLowerCase().includes(query)) return true;
      return song.lyrics.some(section =>
        section.lines.some(line => line.toLowerCase().includes(query))
      );
    });
    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No songs found.</p>';
      return;
    }
    filtered.forEach(song => container.appendChild(createSongRow(song)));
    return;
  }

  setlist.sections.forEach(section => {
    const header = document.createElement('h3');
    header.className = 'set-section-header';
    header.textContent = section.name;
    container.appendChild(header);

    section.songIds.forEach(id => {
      const song = songMap[id];
      if (song) {
        container.appendChild(createSongRow(song));
      }
    });
  });
}

/* ── Search ────────────────────────────────────── */

function bindSearch() {
  const input = document.querySelector('.search-input');
  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (!query) {
      renderUnifiedList(setlistData, songsData);
      return;
    }
    renderUnifiedList(setlistData, songsData, query);
  });
}

/* ── Helpers ───────────────────────────────────── */

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/* ── Custom scrollbar ─────────────────────────────── */

// Initialize custom scrollbar on the main content overlay
if (typeof OverlayScrollbarsGlobal !== 'undefined') {
  const { OverlayScrollbars } = OverlayScrollbarsGlobal;

  // Main song list scroll area
  const contentOverlay = document.querySelector('.content-shell');
  if (contentOverlay) {
    OverlayScrollbars(contentOverlay, {
      scrollbars: {
        theme: 'os-theme-gold',
        autoHide: 'scroll',
        autoHideDelay: 800,
      }
    });
  }
}