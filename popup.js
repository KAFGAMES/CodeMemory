// IndexedDB を使うサンプル
let db;

/**
 * IndexedDB 初期化
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('skillDB', 1);

    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains('skillStore')) {
        db.createObjectStore('skillStore', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };

    request.onerror = (e) => {
      reject(e);
    };
  });
}

/**
 * スキルを追加
 */
function addSkill(title, content) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readwrite');
    const store = tx.objectStore('skillStore');
    const record = {
      title: title,
      content: content,
      date: new Date()
    };
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

/**
 * スキル一覧を取得
 */
function getSkills() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readonly');
    const store = tx.objectStore('skillStore');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

/**
 * スキル一覧を描画
 */
async function renderSkillList() {
  const listEl = document.getElementById('skill-list');
  listEl.innerHTML = '';

  const skills = await getSkills();
  // 新しい日時が上に来るようにソート
  skills.sort((a, b) => new Date(b.date) - new Date(a.date));

  skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    const titleEl = document.createElement('h2');
    titleEl.textContent = skill.title;

    const contentEl = document.createElement('p');
    contentEl.textContent = skill.content;

    const dateEl = document.createElement('small');
    dateEl.textContent = `登録日時: ${new Date(skill.date).toLocaleString()}`;

    item.appendChild(titleEl);
    item.appendChild(contentEl);
    item.appendChild(dateEl);
    listEl.appendChild(item);
  });
}

/**
 * フォーム送信イベント
 */
function setupForm() {
  const form = document.getElementById('skill-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title) {
      alert('タイトルを入力してください。');
      return;
    }

    // 登録
    await addSkill(title, content);
    titleInput.value = '';
    contentInput.value = '';
    renderSkillList();
  });
}

// ポップアップが開かれたときに実行
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  setupForm();
  renderSkillList();
});
