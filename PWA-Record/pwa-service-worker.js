// Service Worker - 處理離線快取和背景同步
const CACHE_NAME = 'meeting-recorder-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('已開啟快取');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 啟動 Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('刪除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 處理 fetch 請求
self.addEventListener('fetch', event => {
  // 跳過非 GET 請求
  if (event.request.method !== 'GET') {
    return;
  }
  
  // 跳過 API 請求（不快取）
  if (event.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果有快取，返回快取
        if (response) {
          return response;
        }
        
        // 否則進行網路請求
        return fetch(event.request).then(response => {
          // 檢查是否為有效響應
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // 複製響應以供快取
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // 離線時返回離線頁面
        return caches.match('/index.html');
      })
  );
});

// 背景同步
self.addEventListener('sync', event => {
  if (event.tag === 'sync-meeting-data') {
    event.waitUntil(syncMeetingData());
  }
});

// 同步會議資料到雲端
async function syncMeetingData() {
  try {
    // 從 IndexedDB 獲取待同步的資料
    const db = await openDB();
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');
    const allData = await store.getAll();
    
    // 同步每筆資料
    for (const data of allData) {
      await uploadToCloud(data);
      
      // 刪除已同步的資料
      const deleteTx = db.transaction('pending', 'readwrite');
      const deleteStore = deleteTx.objectStore('pending');
      await deleteStore.delete(data.id);
    }
    
    // 通知客戶端同步完成
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'sync-complete',
          message: '資料已同步到雲端'
        });
      });
    });
  } catch (error) {
    console.error('同步失敗:', error);
  }
}

// 推送通知
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '您有新的會議記錄',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: '查看',
        icon: '/icon-72.png'
      },
      {
        action: 'close',
        title: '關閉',
        icon: '/icon-72.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('AI 會議記錄助手', options)
  );
});

// 處理通知點擊
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    // 開啟應用程式
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// 處理應用程式更新
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 輔助函數：開啟 IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MeetingRecorderDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id' });
      }
    };
  });
}

// 輔助函數：上傳到雲端
async function uploadToCloud(data) {
  // 這裡可以實作上傳到 Google Drive 或其他雲端服務
  // 範例：上傳到您的後端 API
  const response = await fetch('YOUR_BACKEND_URL/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error('上傳失敗');
  }
  
  return response.json();
}