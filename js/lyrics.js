/* Lyrics Reader View — full-screen overlay for reading song lyrics */
(function () {
  'use strict';

  /* ── state ─────────────────────────────────────────────────── */
  let songsData = null;
  let currentSong = null;
  let fontStep = 0;                 // –3 … +5
  let isTraditional = sessionStorage.getItem('charMode') === 'traditional';
  let converterToTraditional = null;
  let converterToSimplified = null;

  /* ── DOM refs (created once) ───────────────────────────────── */
  const overlay = document.getElementById('lyrics-overlay');
  const header  = overlay.querySelector('.lyrics-header');
  const titleEl = overlay.querySelector('.lyrics-title');
  const body    = overlay.querySelector('.lyrics-body');
  const content = overlay.querySelector('.lyrics-content');
  const controls = overlay.querySelector('.lyrics-controls');

  const btnBack     = overlay.querySelector('[data-action="back"]');
  const btnConvert  = overlay.querySelector('[data-action="convert"]');
  const btnSizeUp   = overlay.querySelector('[data-action="size-up"]');
  const btnSizeDown = overlay.querySelector('[data-action="size-down"]');

  /* ── data loading ──────────────────────────────────────────── */
  fetch('data/songs.json')
    .then(r => r.json())
    .then(d => { songsData = d; })
    .catch(e => console.error('Failed to load songs:', e));

  /* ── open / close ──────────────────────────────────────────── */
  window.addEventListener('open-song', (e) => {
    const id = e.detail && e.detail.songId;
    if (id) sessionStorage.setItem('lastSongId', id);
    if (!songsData || !id) return;
    currentSong = songsData.find(s => s.id === id);
    if (!currentSong) return;
    renderLyrics(currentSong);
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    body.scrollTop = 0;
    resetControls();
  });

  function closeLyrics() {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    currentSong = null;
    window.dispatchEvent(new CustomEvent('close-song'));
  }

  /* ── render ────────────────────────────────────────────────── */
  function renderLyrics(song) {
    titleEl.textContent = song.title;
    let html = '';
    song.lyrics.forEach(section => {
      html += '<div class="lyrics-section">';
      html += '<p class="lyrics-label">' + escHtml(section.label) + '</p>';
      section.lines.forEach(line => {
        html += '<p class="lyrics-line">' + escHtml(line) + '</p>';
      });
      html += '</div>';
    });
    content.innerHTML = html;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Chinese variant toggle (OpenCC-js) ────────────────────── */
  function initConverters() {
    if (typeof OpenCC !== 'undefined') {
      converterToTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
      converterToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
    }
  }

  initConverters();

  function toggleChineseVariant() {
    if (!converterToTraditional || !converterToSimplified) {
      initConverters();
      if (!converterToTraditional) return;
    }

    isTraditional = !isTraditional;
    sessionStorage.setItem('charMode', isTraditional ? 'traditional' : 'simplified');
    const converter = isTraditional ? converterToTraditional : converterToSimplified;

    const lines = content.querySelectorAll('.lyrics-line');
    lines.forEach(line => {
      line.textContent = converter(line.textContent);
    });

    const labels = content.querySelectorAll('.lyrics-label');
    labels.forEach(label => {
      label.textContent = converter(label.textContent);
    });

    btnConvert.textContent = isTraditional ? '繁→简' : '简→繁';
  }

  /* ── text size ─────────────────────────────────────────────── */
  function applyFontStep() {
    if (fontStep === 0) {
      content.style.fontSize = '';
    } else {
      content.style.fontSize = 'calc(var(--lyrics-base-size) + ' + (fontStep * 0.15) + 'rem)';
    }
  }

  function changeSize(delta) {
    fontStep = Math.max(-3, Math.min(5, fontStep + delta));
    applyFontStep();
    sessionStorage.setItem('fontSizeStep', String(fontStep));
  }

  /* ── reset on open ─────────────────────────────────────────── */
  function resetControls() {
    /* Restore saved font-size preference */
    var savedStep = sessionStorage.getItem('fontSizeStep');
    fontStep = savedStep !== null ? Math.max(-3, Math.min(5, parseInt(savedStep, 10) || 0)) : 0;
    applyFontStep();

    /* Restore saved character preference */
    isTraditional = sessionStorage.getItem('charMode') === 'traditional';
    if (isTraditional && converterToTraditional) {
      const lines = content.querySelectorAll('.lyrics-line');
      lines.forEach(line => {
        line.textContent = converterToTraditional(line.textContent);
      });
      const labels = content.querySelectorAll('.lyrics-label');
      labels.forEach(label => {
        label.textContent = converterToTraditional(label.textContent);
      });
    }
    if (btnConvert) btnConvert.textContent = isTraditional ? '繁→简' : '简→繁';
  }

  /* ── custom scrollbar for lyrics body ─────────────────────── */
  if (typeof OverlayScrollbarsGlobal !== 'undefined') {
    const { OverlayScrollbars } = OverlayScrollbarsGlobal;
    const lyricsBody = overlay.querySelector('.lyrics-body');
    if (lyricsBody) {
      OverlayScrollbars(lyricsBody, {
        scrollbars: {
          theme: 'os-theme-gold',
          autoHide: 'scroll',
          autoHideDelay: 800,
        }
      });
    }
  }

  /* ── event wiring ──────────────────────────────────────────── */
  btnBack.addEventListener('click', closeLyrics);
  btnConvert.addEventListener('click', toggleChineseVariant);
  btnSizeUp.addEventListener('click', () => changeSize(1));
  btnSizeDown.addEventListener('click', () => changeSize(-1));

  // Swipe right to go back to song list
  if (window.addSwipeBack) {
    window.addSwipeBack(overlay, closeLyrics);
  }

})();

