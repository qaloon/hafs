/* إدارة وجلب بيانات الكتاب والفهارس */

export async function loadBookData() {
  if (typeof window !== 'undefined' && window.__BOOK_DATA__) {
    return window.__BOOK_DATA__;
  }

  try {
    const res = await fetch('data/book.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('تعذر تحميل data/book.json، استخدام البيانات الاحتياطية:', err);
    return {
      title: document.title || 'الكتاب الرقمي',
      totalPages: 0,
      pages: [],
      index: []
    };
  }
}
