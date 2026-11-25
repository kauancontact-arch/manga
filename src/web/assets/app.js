/* MangaLoop — melhorias progressivas. Nada aqui e essencial para ler ou operar. */
(() => {
  'use strict';

  /* Navegacao mobile */
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  /* Copiar para a area de transferencia */
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-copy]');
    if (!btn) return;
    const sel = btn.getAttribute('data-copy');
    const node = sel.startsWith('#') ? document.querySelector(sel) : null;
    const text = node ? (node.value !== undefined ? node.value : node.textContent) : sel;
    try {
      await navigator.clipboard.writeText(text);
      flash(btn, 'Copiado!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); flash(btn, 'Copiado!'); } catch { flash(btn, 'Copie manualmente'); }
      ta.remove();
    }
  });

  function flash(btn, msg) {
    const original = btn.getAttribute('data-original') || btn.textContent;
    btn.setAttribute('data-original', original);
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = original; }, 1800);
  }

  /* Compartilhamento nativo com fallback */
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-share]');
    if (!btn) return;
    const url = btn.getAttribute('data-share-url') || location.href;
    const title = btn.getAttribute('data-share-title') || document.title;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* usuario cancelou */ }
    }
    try { await navigator.clipboard.writeText(url); flash(btn, 'Link copiado!'); }
    catch { flash(btn, url); }
  });

  /* Confirmacao explicita de acoes sensiveis */
  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    const msg = form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) ev.preventDefault();
  });

  /* Contadores de caracteres e palavras */
  document.querySelectorAll('[data-counter-for]').forEach((out) => {
    const input = document.getElementById(out.getAttribute('data-counter-for'));
    if (!input) return;
    const max = Number(out.getAttribute('data-counter-max') || 0);
    const update = () => {
      const n = input.value.length;
      out.textContent = max ? `${n} / ${max} caracteres` : `${n} caracteres`;
      out.classList.toggle('counter--warn', !!max && n > max);
    };
    input.addEventListener('input', update); update();
  });

  /* Gerador social: duracao estimada ao vivo */
  const scriptBox = document.querySelector('[data-script-box]');
  if (scriptBox) {
    const wpmInput = document.querySelector('[data-wpm]');
    const out = document.querySelector('[data-duration-out]');
    const recalc = () => {
      const words = scriptBox.textContent.trim().split(/\s+/).filter(Boolean).length;
      const wpm = Number(wpmInput?.value || 150);
      const sec = (words / wpm) * 60;
      if (out) {
        out.textContent = `${words} palavras · ${sec.toFixed(1)}s estimados a ${wpm} ppm`;
        out.classList.toggle('counter--warn', sec > 60);
      }
      const warn = document.querySelector('[data-duration-warning]');
      if (warn) warn.hidden = sec <= 60;
    };
    wpmInput?.addEventListener('change', recalc);
    recalc();
  }

  /* Leitor: progresso, teclado, modo pagina a pagina */
  const reader = document.querySelector('[data-reader]');
  if (reader) initReader(reader);

  function initReader(root) {
    const slug = root.getAttribute('data-slug');
    const pages = Array.from(root.querySelectorAll('[data-page]'));
    const bar = document.querySelector('[data-progress] span');
    const label = document.querySelector('[data-page-label]');
    const key = `ml:progress:${slug}`;
    let mode = localStorage.getItem('ml:reader-mode') || 'vertical';
    let index = 0;

    const setMode = (next) => {
      mode = next;
      localStorage.setItem('ml:reader-mode', mode);
      root.classList.toggle('reader--paged', mode === 'paged');
      document.querySelectorAll('[data-mode-btn]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-mode-btn') === mode));
      });
      if (mode === 'paged') show(index); else updateVertical();
    };

    const show = (i) => {
      index = Math.max(0, Math.min(pages.length - 1, i));
      pages.forEach((p, n) => p.setAttribute('data-active', String(n === index)));
      if (label) label.textContent = `${index + 1} / ${pages.length}`;
      if (bar) bar.style.width = `${((index + 1) / pages.length) * 100}%`;
      try { localStorage.setItem(key, String(index)); } catch { /* ignore */ }
      pages[index]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    };

    const updateVertical = () => {
      const top = window.scrollY + window.innerHeight * 0.4;
      let current = 0;
      pages.forEach((p, n) => { if (p.offsetTop <= top) current = n; });
      index = current;
      if (label) label.textContent = `${index + 1} / ${pages.length}`;
      if (bar) {
        const total = document.body.scrollHeight - window.innerHeight;
        bar.style.width = `${Math.min(100, Math.max(0, (window.scrollY / Math.max(1, total)) * 100))}%`;
      }
      try { localStorage.setItem(key, String(index)); } catch { /* ignore */ }
    };

    document.querySelectorAll('[data-mode-btn]').forEach((b) => {
      b.addEventListener('click', () => setMode(b.getAttribute('data-mode-btn')));
    });
    document.querySelector('[data-next]')?.addEventListener('click', () => (mode === 'paged' ? show(index + 1) : window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' })));
    document.querySelector('[data-prev]')?.addEventListener('click', () => (mode === 'paged' ? show(index - 1) : window.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' })));

    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('input, textarea, select')) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(ev.key)) { ev.preventDefault(); mode === 'paged' ? show(index + 1) : window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' }); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(ev.key)) { ev.preventDefault(); mode === 'paged' ? show(index - 1) : window.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' }); }
      if (ev.key === 'Home') show(0);
      if (ev.key === 'End') show(pages.length - 1);
    });

    let touchX = null;
    root.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (touchX === null || mode !== 'paged') return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });

    window.addEventListener('scroll', () => { if (mode === 'vertical') updateVertical(); }, { passive: true });

    const saved = Number(localStorage.getItem(key) || 0);
    setMode(mode);
    if (saved > 0 && saved < pages.length) {
      const resume = document.querySelector('[data-resume]');
      if (resume) {
        resume.hidden = false;
        resume.querySelector('[data-resume-go]')?.addEventListener('click', () => {
          mode === 'paged' ? show(saved) : pages[saved]?.scrollIntoView({ behavior: 'smooth' });
          resume.hidden = true;
        });
      }
    }
  }

  /* Acompanhamento de jobs no admin */
  const jobWatch = document.querySelector('[data-job-watch]');
  if (jobWatch) {
    const mangaId = jobWatch.getAttribute('data-job-watch');
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch(`/admin/api/mangas/${mangaId}/jobs`, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          const bar = jobWatch.querySelector('[data-job-progress]');
          if (bar) bar.style.width = `${data.progress}%`;
          const txt = jobWatch.querySelector('[data-job-text]');
          if (txt) txt.textContent = data.label;
          if (data.done) { stop = true; location.reload(); return; }
        }
      } catch { /* mantem polling */ }
      setTimeout(tick, 2500);
    };
    setTimeout(tick, 2000);
  }

  /* Exportacao de card PNG a partir do SVG (sem dependencia e sem custo de IA) */
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-export-png]');
    if (!btn) return;
    const svgEl = document.querySelector(btn.getAttribute('data-export-png'));
    if (!svgEl) return;
    const w = Number(btn.getAttribute('data-w') || svgEl.viewBox.baseVal.width || 1080);
    const h = Number(btn.getAttribute('data-h') || svgEl.viewBox.baseVal.height || 1350);
    const xml = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const cx = canvas.getContext('2d');
      cx.fillStyle = '#F8F5ED'; cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${btn.getAttribute('data-filename') || 'mangaloop-card'}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    };
    img.onerror = () => flash(btn, 'Falha ao exportar');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
})();
