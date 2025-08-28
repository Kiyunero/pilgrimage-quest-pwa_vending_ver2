// このファイルはPWA機能のために必要です。
// 今後の開発でオフライン対応などをここに追加していきます。

self.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
  });
  
  self.addEventListener('fetch', (event) => {
    // 現時点では何もしません
  });