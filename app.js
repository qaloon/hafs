import { normalizeArabic, toArabicDigits } from './arabic.js';
import { loadBookData } from './data.js';
import { AudioPlayer } from './audio.js';

// عناصر واجهة المستخدم
const pagesEl = document.getElementById('pages');
const netEl = document.getElementById('net');
const themeBtn = document.getElementById('themeBtn');
const indexBtn = document.getElementById('indexBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInput = document.getElementById('pageInput');
const goBtn = document.getElementById('goBtn');
const offlineBtn = document.getElementById('offlineBtn');
const playBtn = document.getElementById('playBtn');
const trackBar = document.getElementById('trackBar');
const drawer = document.getElementById('drawer');
const drawerBody = document.getElementById('drawerBody');
const searchInput = document.getElementById('search');
const bookTitleEl = document.getElementById('bookTitle');
const tabs = document.querySelectorAll('.tab');

let bookData = null;
let currentPage = 1;
let totalPages = 1;
let activeTab = 'surah';
const audioPlayer = new AudioPlayer();

// حالة الاتصال بالإنترنت
function updateNetStatus() {
  if (!netEl) return;
  if (navigator.onLine) {
    netEl.textContent = 'متصل';
    netEl.className = 'net on';
  } else {
    netEl.textContent = 'بلا إنترنت';
    netEl.className = 'net off';
  }
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);
updateNetStatus();

// إدارة المظهر (الوضع الليلي والنهاري)
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeIcon();
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = current;
  localStorage.setItem('theme', current);
  updateThemeIcon();
}
function updateThemeIcon() {
  if (!themeBtn) return;
  const isLight = document.documentElement.dataset.theme === 'light';
  themeBtn.textContent = isLight ? '🌙' : '☀️';
  themeBtn.title = isLight ? 'الوضع الداكن' : 'الوضع الفاتح';
}
if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

// تسجيل Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      console.log('Service Worker Registered:', reg.scope);
    })
    .catch(err => console.log('SW Registration failed:', err));

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'DOWNLOAD_PROGRESS') {
      if (!offlineBtn) return;
      if (data.error === 'QUOTA') {
        offlineBtn.textContent = '⚠️ الحصة ممتلئة';
        alert(data.message || 'انتهت مساحة التخزين المتاحة.');
      } else if (data.finished) {
        offlineBtn.textContent = '✓ تم الحفظ';
        offlineBtn.setAttribute('aria-pressed', 'true');
        setTimeout(() => {
          offlineBtn.textContent = '⤓ محفوظ أوفلاين';
        }, 2500);
      } else {
        const pct = Math.round((data.done / data.total) * 100);
        offlineBtn.textContent = `جارِ الحفظ: ${pct}%`;
      }
    }
  });
}

// حفظ الكتاب للقراءة أوفلاين
if (offlineBtn) {
  offlineBtn.addEventListener('click', () => {
    if (!navigator.serviceWorker?.controller) {
      alert('جاري تهيئة الخدمة، يرجى إعادة المحاولة بعد ثوانٍ');
      return;
    }
    if (!bookData?.pages?.length) {
      alert('لا توجد صفحات متاحة للحفظ.');
      return;
    }
    offlineBtn.textContent = 'جارِ البدء...';
    navigator.serviceWorker.controller.postMessage({
      type: 'DOWNLOAD_BOOK',
      urls: bookData.pages
    });
  });
}

// مشغل الصوت
audioPlayer.onStatusChange = (isPlaying) => {
  if (!playBtn) return;
  playBtn.textContent = isPlaying ? '⏸' : '▶';
  playBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
};
if (playBtn) {
  playBtn.addEventListener('click', () => {
    if (bookData?.audioUrl) {
      audioPlayer.toggle(bookData.audioUrl);
    } else {
      alert('التسجيل الصوتي غير متوفر لهذا الكتاب حالياً.');
    }
  });
}

// الانتقال لصفحة معينة
function scrollToPage(targetNum, isPrinted = true, smooth = true) {
  const offset = parseInt(bookData?.pageOffset || 0, 10);
  let rawIndex = targetNum;
  if (isPrinted && offset > 0) {
    rawIndex = targetNum + offset;
  }
  const num = Math.max(1, Math.min(rawIndex, totalPages));
  const el = document.getElementById(`page-${num}`);
  if (el) {
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    currentPage = num;
    updateHUD(currentPage);
  }
}

// تحديث شريط التنقل
function updateHUD(rawIndex) {
  const offset = parseInt(bookData?.pageOffset || 0, 10);
  const printedNum = rawIndex > offset ? (rawIndex - offset) : null;
  if (pageInput) pageInput.value = printedNum !== null ? printedNum : rawIndex;
  if (trackBar) {
    const pct = totalPages > 1 ? ((rawIndex - 1) / (totalPages - 1)) * 100 : 0;
    trackBar.style.width = `${pct}%`;
  }
  if (bookData?.id) {
    try {
      localStorage.setItem(`last_page_${bookData.id}`, String(rawIndex));
    } catch (_) {}
  }
}

// بناء صفحات القراءة
function renderPages(pages) {
  if (!pagesEl) return;
  pagesEl.innerHTML = '';
  totalPages = pages.length;
  const offset = parseInt(bookData?.pageOffset || 0, 10);
  const printedTotal = Math.max(1, totalPages - offset);

  if (pageInput) {
    pageInput.max = String(offset > 0 ? printedTotal : totalPages);
  }

  const fragment = document.createDocumentFragment();

  pages.forEach((url, idx) => {
    const rawIndex = idx + 1;
    const isAux = idx < offset;
    const printedNum = idx >= offset ? (idx - offset + 1) : null;

    const li = document.createElement('li');
    li.className = 'page';
    li.id = `page-${rawIndex}`;
    li.dataset.page = String(rawIndex);
    if (printedNum) li.dataset.printed = String(printedNum);

    const inner = document.createElement('div');
    inner.className = 'page-inner';

    const img = document.createElement('img');
    img.src = url;
    img.alt = printedNum ? `صفحة ${printedNum}` : (idx === 0 ? 'الغلاف' : 'مقدمة');
    img.loading = idx < 2 ? 'eager' : 'lazy';
    img.decoding = 'async';

    const badge = document.createElement('span');
    if (isAux) {
      badge.className = 'page-num page-num--aux';
      badge.textContent = idx === 0 ? 'غلاف' : (idx === 1 ? 'مقدمة' : `تمهيد ${toArabicDigits(idx)}`);
    } else {
      badge.className = 'page-num';
      badge.textContent = `${toArabicDigits(printedNum)} / ${toArabicDigits(printedTotal)}`;
    }

    inner.appendChild(img);
    inner.appendChild(badge);
    li.appendChild(inner);
    fragment.appendChild(li);
  });

  pagesEl.appendChild(fragment);

  // مراقبة التمرير لتحديد الصفحة النشطة بدقة
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        const p = parseInt(entry.target.dataset.page, 10);
        if (p && p !== currentPage) {
          currentPage = p;
          updateHUD(currentPage);
        }
      }
    }
  }, {
    root: pagesEl,
    threshold: 0.5
  });

  document.querySelectorAll('.page').forEach(el => observer.observe(el));
}

// أزرار التنقل
if (nextBtn) nextBtn.addEventListener('click', () => scrollToPage(currentPage + 1, false));
if (prevBtn) prevBtn.addEventListener('click', () => scrollToPage(currentPage - 1, false));

if (goBtn && pageInput) {
  goBtn.addEventListener('click', () => {
    const val = parseInt(pageInput.value, 10);
    if (!isNaN(val)) scrollToPage(val, true);
  });
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(pageInput.value, 10);
      if (!isNaN(val)) scrollToPage(val, true);
    }
  });
}

// اختصارات لوحة المفاتيح
window.addEventListener('keydown', (e) => {
  if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    scrollToPage(currentPage + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    scrollToPage(currentPage - 1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    scrollToPage(1);
  } else if (e.key === 'End') {
    e.preventDefault();
    scrollToPage(totalPages);
  } else if (e.key === 'Escape' && drawer?.hasAttribute('open')) {
    closeDrawer();
  }
});

// درج الفهرس
function openDrawer() {
  if (!drawer) return;
  drawer.setAttribute('open', '');
  renderDrawerContent();
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
}

function closeDrawer() {
  if (!drawer) return;
  drawer.removeAttribute('open');
}

if (indexBtn) indexBtn.addEventListener('click', openDrawer);
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeDrawer));

// تبويبات الفهرس
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    activeTab = tab.dataset.tab;
    renderDrawerContent();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    renderDrawerContent();
  });
}

// رسم محتويات الفهرس
function renderDrawerContent() {
  if (!drawerBody) return;
  drawerBody.innerHTML = '';
  const query = normalizeArabic(searchInput ? searchInput.value : '');

  if (activeTab === 'surah') {
    // عرض السور أو أبواب الكتاب
    const items = bookData?.index || [];
    const filtered = items.filter(item => {
      if (!query) return true;
      const normalizedTitle = normalizeArabic(item.title);
      const pageStr = String(item.page);
      return normalizedTitle.includes(query) || pageStr.includes(query);
    });

    if (filtered.length === 0) {
      drawerBody.innerHTML = '<div class="empty">لا توجد نتائج مطابقة للبحث</div>';
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span>${item.title}</span>
        <span class="p">صفحة ${toArabicDigits(item.page)}</span>
      `;
      row.addEventListener('click', () => {
        closeDrawer();
        scrollToPage(item.page);
      });
      drawerBody.appendChild(row);
    });

  } else if (activeTab === 'juz') {
    // تبويب الأجزاء (30 جزءًا قياسياً أو مخصصاً)
    const juzList = [];
    const juzSize = Math.max(1, Math.floor(totalPages / 30));
    for (let i = 1; i <= 30; i++) {
      const p = (i - 1) * juzSize + 1;
      if (p <= totalPages) {
        juzList.push({ title: `الجزء ${toArabicDigits(i)}`, page: p });
      }
    }

    const filtered = juzList.filter(item => {
      if (!query) return true;
      return normalizeArabic(item.title).includes(query) || String(item.page).includes(query);
    });

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span>${item.title}</span>
        <span class="p">صفحة ${toArabicDigits(item.page)}</span>
      `;
      row.addEventListener('click', () => {
        closeDrawer();
        scrollToPage(item.page, true);
      });
      drawerBody.appendChild(row);
    });

  } else if (activeTab === 'pages') {
    // شبكة أرقام الصفحات للانتقال السريع
    const grid = document.createElement('div');
    grid.className = 'grid';
    const offset = parseInt(bookData?.pageOffset || 0, 10);
    const count = offset > 0 ? Math.max(1, totalPages - offset) : totalPages;

    for (let i = 1; i <= count; i++) {
      if (query && !String(i).includes(query) && !normalizeArabic(toArabicDigits(i)).includes(query)) {
        continue;
      }
      const btn = document.createElement('button');
      btn.textContent = toArabicDigits(i);
      btn.addEventListener('click', () => {
        closeDrawer();
        scrollToPage(i, true);
      });
      grid.appendChild(btn);
    }

    drawerBody.appendChild(grid);
  }
}

// بدء تشغيل التطبيق
async function init() {
  initTheme();
  bookData = await loadBookData();

  if (bookTitleEl && bookData.title) {
    bookTitleEl.textContent = bookData.title;
  }

  const pages = bookData.pages || [];
  if (pages.length > 0) {
    renderPages(pages);

    // استعادة آخر صفحة تمت قراءتها
    let resumePage = 1;
    if (window.location.hash.includes('resume') || window.location.hash.includes('page=')) {
      const match = window.location.hash.match(/page=(d+)/);
      if (match) resumePage = parseInt(match[1], 10);
    } else if (bookData.id) {
      const saved = localStorage.getItem(`last_page_${bookData.id}`);
      if (saved) resumePage = parseInt(saved, 10);
    }
    if (resumePage && resumePage > 1 && resumePage <= pages.length) {
      setTimeout(() => scrollToPage(resumePage, false, false), 150);
    }
  } else {
    if (pagesEl) {
      pagesEl.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--muted);">لم يتم تعيين روابط الصفحات بعد. يرجى إدخال روابط الصور في لوحة الإعدادات.</div>';
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
