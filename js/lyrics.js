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

  /* ── audio state ────────────────────────────────────────────── */
  let audio = null;
  let isPlaying = false;
  let userScrolling = false;
  let scrollTimeout = null;
  let scrollAnimationId = null;
  let timestampMap = [];             // [{lineEl, time}] sorted by time
  let previewSectionEl = null;

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

  /* audio player DOM */
  const playerBar     = document.getElementById('audio-player');
  const progressFill  = document.getElementById('audio-progress-fill');
  const progressWrap  = playerBar ? playerBar.querySelector('.audio-progress-wrap') : null;
  const timeCurrent   = document.getElementById('audio-time-current');
  const timeTotal     = document.getElementById('audio-time-total');
  const playBtn       = document.getElementById('audio-play-btn');
  const iconPlay      = playBtn ? playBtn.querySelector('.audio-icon-play') : null;
  const iconPause     = playBtn ? playBtn.querySelector('.audio-icon-pause') : null;
  const previewInput  = document.getElementById('preview-toggle-input');

  /* ── data loading ──────────────────────────────────────────── */
  fetch('data/songs.json')
    .then(r => r.json())
    .then(d => { songsData = d; })
    .catch(e => console.error('Failed to load songs:', e));

  /* ── preview mode (sessionStorage, default ON) ─────────────── */
  function isPreviewOn() {
    var v = sessionStorage.getItem('previewMode');
    return v === null ? true : v === 'on';
  }

  function setPreviewMode(on) {
    sessionStorage.setItem('previewMode', on ? 'on' : 'off');
  }

  // Init toggle state
  if (previewInput) {
    previewInput.checked = isPreviewOn();
    previewInput.addEventListener('change', function () {
      setPreviewMode(previewInput.checked);
      // Just save the preference. Don't start/stop audio.
    });
  }

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
    userScrolling = false;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    lastHighlightIndex = -1;
    scrollBody(0);
    resetControls();

    // Audio preview — always init player for songs with preview audio
    if (currentSong.previewAudio) {
      initAudio(currentSong, isPreviewOn()); // pass whether to auto-play
    } else {
      hidePlayer();
    }
  });

  function closeLyrics() {
    stopAudio();
    overlay.classList.remove('is-visible', 'is-syncing');
    overlay.setAttribute('aria-hidden', 'true');
    currentSong = null;
    window.dispatchEvent(new CustomEvent('close-song'));
  }

  /* ── render ────────────────────────────────────────────────── */
  function renderLyrics(song) {
    titleEl.textContent = song.title;
    timestampMap = [];
    previewSectionEl = null;

    // Build a lookup: which section label(s) are the preview section?
    // Support both string and array previewSection
    var previewLabels = song.previewSection || null;
    if (typeof previewLabels === 'string') previewLabels = [previewLabels];

    // Build timestamp lookup keyed by "sectionLabel:lineIndex"
    var tsLookup = {};
    if (song.previewTimestamps) {
      song.previewTimestamps.forEach(function (t) {
        if (t.section) {
          // New format: {section, line, time}
          tsLookup[t.section + ':' + t.line] = t.time;
        } else {
          // Legacy format: {line, time} — uses first preview section
          var legacySection = previewLabels ? previewLabels[0] : '';
          tsLookup[legacySection + ':' + t.line] = t.time;
        }
      });
    }

    var html = '';
    song.lyrics.forEach(function (section) {
      var isPreview = previewLabels && previewLabels.indexOf(section.label) !== -1;
      html += '<div class="lyrics-section"' + (isPreview ? ' data-preview-section="1"' : '') + '>';
      html += '<p class="lyrics-label">' + escHtml(section.label) + '</p>';
      section.lines.forEach(function (line, li) {
        var timeAttr = '';
        if (isPreview && tsLookup[section.label + ':' + li] !== undefined) {
          timeAttr = ' data-time="' + tsLookup[section.label + ':' + li] + '"';
        }
        html += '<p class="lyrics-line"' + timeAttr + '>' + escHtml(line) + '</p>';
      });
      html += '</div>';
    });
    content.innerHTML = html;

    // Collect timestamped line elements
    var tsLines = content.querySelectorAll('.lyrics-line[data-time]');
    tsLines.forEach(function (el) {
      timestampMap.push({ lineEl: el, time: parseFloat(el.dataset.time) });
    });
    timestampMap.sort(function (a, b) { return a.time - b.time; });

    // Add line play buttons to timestamped lines
    tsLines.forEach(function (el) {
      var btn = document.createElement('button');
      btn.className = 'line-play-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Play from here');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (audio) {
          audio.currentTime = parseFloat(el.dataset.time);
          if (!isPlaying) playAudio();
        }
      });
      el.appendChild(btn);
    });

    // Store preview section element
    previewSectionEl = content.querySelector('[data-preview-section]');
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Audio engine ──────────────────────────────────────────── */
  function initAudio(song, autoPlay) {
    stopAudio();
    if (!song.previewAudio) return;

    audio = new Audio(song.previewAudio);
    audio.preload = 'auto';

    // Show player bar (ALWAYS, regardless of autoPlay)
    if (playerBar) playerBar.removeAttribute('hidden');

    // Duration
    audio.addEventListener('loadedmetadata', function () {
      if (timeTotal) timeTotal.textContent = formatTime(audio.duration);
    });

    // Timeupdate — progress + sync
    audio.addEventListener('timeupdate', function () {
      if (!audio) return;
      var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      if (progressFill) progressFill.style.width = pct + '%';
      if (timeCurrent) timeCurrent.textContent = formatTime(audio.currentTime);
      updateSyncedLyrics(audio.currentTime);
    });

    // Audio ended — just stop, no reset
    audio.addEventListener('ended', function () {
      isPlaying = false;
      overlay.classList.remove('is-playing');
      showPlayIcon();
    });

    audio.addEventListener('error', function () {
      console.warn('Audio failed to load:', song.previewAudio);
      hidePlayer();
    });

    // Only auto-scroll and auto-play if autoPlay is true
    overlay.classList.add('is-syncing');
    if (autoPlay) {
      if (previewSectionEl) {
        setTimeout(function () {
          scrollToElement(previewSectionEl);
          setTimeout(function () { playAudio(); }, 400);
        }, 300);
      } else {
        playAudio();
      }
    }
    // If not autoPlay, just show the player bar — user can hit play manually
  }

  function playAudio() {
    if (!audio) return;
    audio.play().then(function () {
      isPlaying = true;
      overlay.classList.add('is-playing');
      showPauseIcon();
    }).catch(function (err) {
      console.warn('Playback blocked:', err);
    });
  }

  function pauseAudio() {
    if (!audio) return;
    audio.pause();
    isPlaying = false;
    overlay.classList.remove('is-playing');
    showPlayIcon();
  }

  function stopAudio() {
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
    if (audio) {
      audio.pause();
      audio = null;
    }
    isPlaying = false;
    userScrolling = false;
    overlay.classList.remove('is-playing');
    if (scrollTimeout) clearTimeout(scrollTimeout);
    showPlayIcon();
    if (playerBar) playerBar.setAttribute('hidden', '');
    resetPlayerUI();
  }

  function hidePlayer() {
    if (playerBar) playerBar.setAttribute('hidden', '');
    overlay.classList.remove('is-syncing');
    overlay.classList.remove('is-playing');
  }

  function resetPlayerUI() {
    if (progressFill) progressFill.style.width = '0%';
    if (timeCurrent) timeCurrent.textContent = '0:00';
    if (timeTotal) timeTotal.textContent = '0:00';
  }

  function showPlayIcon() {
    if (iconPlay) iconPlay.style.display = '';
    if (iconPause) iconPause.style.display = 'none';
  }

  function showPauseIcon() {
    if (iconPlay) iconPlay.style.display = 'none';
    if (iconPause) iconPause.style.display = '';
  }

  function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* ── Play/pause button ─────────────────────────────────────── */
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      if (!audio) return;
      if (isPlaying) { pauseAudio(); } else { playAudio(); }
    });
  }

  /* ── Progress bar seeking + drag/swipe ─────────────────────── */
  if (progressWrap) {
    var isDragging = false;

    function seekToPosition(clientX) {
      if (!audio || !audio.duration) return;
      var rect = progressWrap.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    }

    function updateFillFromClientX(clientX) {
      if (!audio || !audio.duration) return;
      var rect = progressWrap.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (progressFill) progressFill.style.width = (pct * 100) + '%';
      audio.currentTime = pct * audio.duration;
    }

    function startDrag() {
      isDragging = true;
      progressWrap.classList.add('dragging');
    }

    function stopDrag() {
      if (!isDragging) return;
      isDragging = false;
      progressWrap.classList.remove('dragging');
    }

    /* — Click (unchanged) — */
    progressWrap.addEventListener('click', function (e) {
      seekToPosition(e.clientX);
    });

    /* — Mouse drag — */
    progressWrap.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startDrag();
      updateFillFromClientX(e.clientX);
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      e.preventDefault();
      updateFillFromClientX(e.clientX);
    });

    document.addEventListener('mouseup', function () {
      stopDrag();
    });

    /* — Touch drag — */
    progressWrap.addEventListener('touchstart', function (e) {
      if (e.touches.length > 0) {
        e.preventDefault();
        startDrag();
        updateFillFromClientX(e.touches[0].clientX);
      }
    }, { passive: false });

    progressWrap.addEventListener('touchmove', function (e) {
      if (!isDragging || e.touches.length === 0) return;
      e.preventDefault();
      updateFillFromClientX(e.touches[0].clientX);
    }, { passive: false });

    document.addEventListener('touchend', function () {
      stopDrag();
    });

    document.addEventListener('touchcancel', function () {
      stopDrag();
    });
  }

  /* ── Synced lyrics highlighting ────────────────────────────── */
  var lastHighlightIndex = -1;

  function updateSyncedLyrics(currentTime) {
    if (!timestampMap.length) return;

    // Find current line index
    var idx = -1;
    for (var i = timestampMap.length - 1; i >= 0; i--) {
      if (currentTime >= timestampMap[i].time) {
        idx = i;
        break;
      }
    }

    if (idx === lastHighlightIndex) return;
    lastHighlightIndex = idx;

    // Remove old highlights
    var allLines = content.querySelectorAll('.lyrics-line');
    allLines.forEach(function (el) {
      el.classList.remove('current', 'near-current');
    });

    if (idx >= 0) {
      timestampMap[idx].lineEl.classList.add('current');
      // Mark nearby lines for play button visibility
      if (idx > 0) timestampMap[idx - 1].lineEl.classList.add('near-current');
      if (idx < timestampMap.length - 1) timestampMap[idx + 1].lineEl.classList.add('near-current');

      // Auto-scroll to current line
      if (!userScrolling) {
        scrollToElement(timestampMap[idx].lineEl);
      }
    }
  }

  /* ── Scroll helpers ────────────────────────────────────────── */
  function getScrollContainer() {
    // OverlayScrollbars wraps the content — find the actual scrollable viewport
    var osViewport = body.querySelector('.os-viewport');
    return osViewport || body;
  }

  function scrollToElement(el) {
    // Cancel any ongoing scroll animation
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function scrollBody(top) {
    var container = getScrollContainer();
    container.scrollTop = top;
  }

  /* ── User scroll detection (pause auto-scroll) ─────────────── */
  function attachScrollDetection(target) {
    target.addEventListener('touchstart', function () {
      userScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (scrollAnimationId) { cancelAnimationFrame(scrollAnimationId); scrollAnimationId = null; }
    }, { passive: true });

    target.addEventListener('touchend', function () {
      scrollTimeout = setTimeout(function () { userScrolling = false; }, 2000);
    }, { passive: true });

    target.addEventListener('touchcancel', function () {
      scrollTimeout = setTimeout(function () { userScrolling = false; }, 2000);
    }, { passive: true });

    target.addEventListener('mousedown', function () {
      userScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (scrollAnimationId) { cancelAnimationFrame(scrollAnimationId); scrollAnimationId = null; }
    }, { passive: true });

    target.addEventListener('mouseup', function () {
      scrollTimeout = setTimeout(function () { userScrolling = false; }, 2000);
    }, { passive: true });

    target.addEventListener('mouseleave', function () {
      if (userScrolling) {
        scrollTimeout = setTimeout(function () { userScrolling = false; }, 2000);
      }
    }, { passive: true });

    target.addEventListener('wheel', function () {
      userScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (scrollAnimationId) { cancelAnimationFrame(scrollAnimationId); scrollAnimationId = null; }
      scrollTimeout = setTimeout(function () { userScrolling = false; }, 2000);
    }, { passive: true });
  }

  // Attach to body as fallback
  attachScrollDetection(body);

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
    var converter = isTraditional ? converterToTraditional : converterToSimplified;

    // Convert line text but preserve child elements (play buttons)
    var lines = content.querySelectorAll('.lyrics-line');
    lines.forEach(function (line) {
      // Only convert the first text node (the lyric text), not the button
      var textNode = line.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = converter(textNode.textContent);
      }
    });

    var labels = content.querySelectorAll('.lyrics-label');
    labels.forEach(function (label) {
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
      var lines = content.querySelectorAll('.lyrics-line');
      lines.forEach(function (line) {
        var textNode = line.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          textNode.textContent = converterToTraditional(textNode.textContent);
        }
      });
      var labels = content.querySelectorAll('.lyrics-label');
      labels.forEach(function (label) {
        label.textContent = converterToTraditional(label.textContent);
      });
    }
    if (btnConvert) btnConvert.textContent = isTraditional ? '繁→简' : '简→繁';

    /* Restore preview toggle state */
    if (previewInput) previewInput.checked = isPreviewOn();
  }

  /* ── custom scrollbar for lyrics body ─────────────────────── */
  if (typeof OverlayScrollbarsGlobal !== 'undefined') {
    var OsGlobal = OverlayScrollbarsGlobal;
    var lyricsBody = overlay.querySelector('.lyrics-body');
    if (lyricsBody) {
      OsGlobal.OverlayScrollbars(lyricsBody, {
        scrollbars: {
          theme: 'os-theme-gold',
          autoHide: 'scroll',
          autoHideDelay: 800,
        }
      });

      // Attach scroll detection to the OverlayScrollbars viewport
      var osViewport = lyricsBody.querySelector('.os-viewport');
      if (osViewport) {
        attachScrollDetection(osViewport);
      }
    }
  }

  /* ── event wiring ──────────────────────────────────────────── */
  btnBack.addEventListener('click', closeLyrics);
  btnConvert.addEventListener('click', toggleChineseVariant);
  btnSizeUp.addEventListener('click', function () { changeSize(1); });
  btnSizeDown.addEventListener('click', function () { changeSize(-1); });

  // Swipe right to go back to song list
  if (window.addSwipeBack) {
    window.addSwipeBack(overlay, closeLyrics);
  }

})();

