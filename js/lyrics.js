/* Lyrics Reader View — full-screen overlay for reading song lyrics */
(function () {
  'use strict';

  /* ── state ─────────────────────────────────────────────────── */
  let songsData = null;
  let currentSong = null;
  let autoScrollSpeed = 0;          // 0 = off, 1 = slow, 2 = med, 3 = fast
  let scrollRAF = null;
  let fontStep = 0;                 // –3 … +5
  let readerMode = false;

  const SPEED_PX = [0, 0.4, 1.0, 2.2]; // px per frame at ~60 fps
  const SPEED_LABELS = ['Off', 'Slow', 'Med', 'Fast'];

  /* ── DOM refs (created once) ───────────────────────────────── */
  const overlay = document.getElementById('lyrics-overlay');
  const header  = overlay.querySelector('.lyrics-header');
  const titleEl = overlay.querySelector('.lyrics-title');
  const body    = overlay.querySelector('.lyrics-body');
  const content = overlay.querySelector('.lyrics-content');
  const controls = overlay.querySelector('.lyrics-controls');

  const btnBack     = overlay.querySelector('[data-action="back"]');
  const btnScroll   = overlay.querySelector('[data-action="scroll"]');
  const btnSizeUp   = overlay.querySelector('[data-action="size-up"]');
  const btnSizeDown = overlay.querySelector('[data-action="size-down"]');
  const btnReader   = overlay.querySelector('[data-action="reader"]');
  const fabReader   = overlay.querySelector('.lyrics-fab');

  /* ── data loading ──────────────────────────────────────────── */
  fetch('data/songs.json')
    .then(r => r.json())
    .then(d => { songsData = d; })
    .catch(e => console.error('Failed to load songs:', e));

  /* ── open / close ──────────────────────────────────────────── */
  window.addEventListener('open-song', (e) => {
    const id = e.detail && e.detail.songId;
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
    stopAutoScroll();
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

  /* ── auto-scroll ───────────────────────────────────────────── */
  function toggleAutoScroll() {
    autoScrollSpeed = (autoScrollSpeed + 1) % 4;
    btnScroll.textContent = '⏬ ' + SPEED_LABELS[autoScrollSpeed];
    if (autoScrollSpeed === 0) { stopAutoScroll(); return; }
    if (!scrollRAF) startAutoScroll();
  }

  function startAutoScroll() {
    function step() {
      if (autoScrollSpeed === 0) return;
      body.scrollTop += SPEED_PX[autoScrollSpeed];
      scrollRAF = requestAnimationFrame(step);
    }
    scrollRAF = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
    autoScrollSpeed = 0;
    btnScroll.textContent = '⏬ Off';
  }

  /* ── text size ─────────────────────────────────────────────── */
  function changeSize(delta) {
    fontStep = Math.max(-3, Math.min(5, fontStep + delta));
    content.style.fontSize = 'calc(var(--lyrics-base-size) + ' + (fontStep * 0.15) + 'rem)';
  }

  /* ── reader mode ───────────────────────────────────────────── */
  function toggleReader() {
    readerMode = !readerMode;
    overlay.classList.toggle('reader-mode', readerMode);
  }

  /* ── reset on open ─────────────────────────────────────────── */
  function resetControls() {
    autoScrollSpeed = 0; scrollRAF = null; fontStep = 0; readerMode = false;
    btnScroll.textContent = '⏬ Off';
    content.style.fontSize = '';
    overlay.classList.remove('reader-mode');
  }

  /* ── event wiring ──────────────────────────────────────────── */
  btnBack.addEventListener('click', closeLyrics);
  btnScroll.addEventListener('click', toggleAutoScroll);
  btnSizeUp.addEventListener('click', () => changeSize(1));
  btnSizeDown.addEventListener('click', () => changeSize(-1));
  btnReader.addEventListener('click', toggleReader);
  fabReader.addEventListener('click', toggleReader);
})();

