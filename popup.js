// =============================
// IndexedDB 定義
// =============================
let db;
let sortOrder = 'desc';   // 新しい順 or 古い順
let searchKeyword = '';   // カテゴリ or タグ 検索用

/**
 * IndexedDB 初期化
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('skillDB', 2);

    request.onupgradeneeded = (e) => {
      db = e.target.result;

      // v1 -> v2 への移行想定: 追加フィールドを入れるため
      if (!db.objectStoreNames.contains('skillStore')) {
        const store = db.createObjectStore('skillStore', { keyPath: 'id', autoIncrement: true });
        // 新しい項目がある場合でも追加定義は不要（JSオブジェクトで自由に入れる）
      } else {
        // すでに skillStore がある場合、特にここでは何もしない
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
 * 新規スキルを追加
 */
function addSkill(title, content, category, tags, pinned) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readwrite');
    const store = tx.objectStore('skillStore');
    const record = {
      title: title,
      content: content,
      category: category || '',
      tags: tags || '',    // 文字列で保存（例: "JavaScript,FrontEnd"）
      pinned: pinned || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

/**
 * すべてのスキルを取得
 */
function getSkills() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readonly');
    const store = tx.objectStore('skillStore');
    const req = store.getAll();
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = (e) => reject(e);
  });
}

/**
 * スキルをID指定で取得
 */
function getSkillById(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readonly');
    const store = tx.objectStore('skillStore');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

/**
 * スキルを更新
 */
function updateSkill(id, newData) {
  return new Promise(async (resolve, reject) => {
    // 既存のデータを取得
    const skill = await getSkillById(id);
    if (!skill) {
      return reject(new Error('Skill not found'));
    }

    // 更新フィールドをマージ
    const updatedRecord = {
      ...skill,
      ...newData,
      updatedAt: new Date(),
    };

    const tx = db.transaction(['skillStore'], 'readwrite');
    const store = tx.objectStore('skillStore');
    const req = store.put(updatedRecord);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

/**
 * スキルを削除
 */
function deleteSkill(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readwrite');
    const store = tx.objectStore('skillStore');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// =============================
// UI 操作
// =============================
/**
 * スキル一覧を描画
 */
async function renderSkillList() {
  const listEl = document.getElementById('skill-list');
  listEl.innerHTML = '';

  let skills = await getSkills();

  // 検索キーワードがあればフィルタリング
  if (searchKeyword) {
    const kwLower = searchKeyword.toLowerCase();
    skills = skills.filter(skill => {
      // カテゴリー or タグにキーワードが含まれているか？
      return (
        (skill.category && skill.category.toLowerCase().includes(kwLower)) ||
        (skill.tags && skill.tags.toLowerCase().includes(kwLower))
      );
    });
  }

  // ピン留めがtrueのものを優先表示し、その後日付ソート
  // pinned: true が先, false が後
  skills.sort((a, b) => {
    if (a.pinned === b.pinned) {
      // pinned同士なら createdAt で比較
      return sortOrder === 'desc'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt);
    }
    return b.pinned - a.pinned; // true(1) が前、 false(0) が後
  });

  // 一覧を表示
  skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    // ピン留めアイコン
    const pinIcon = document.createElement('span');
    pinIcon.className = 'pin-icon ' + (skill.pinned ? 'gold' : 'gray');
    pinIcon.textContent = '★';
    pinIcon.addEventListener('click', () => {
      // ピン留め切り替え
      updateSkill(skill.id, { pinned: !skill.pinned }).then(renderSkillList);
    });
    item.appendChild(pinIcon);

    // タイトル
    const titleEl = document.createElement('h2');
    titleEl.textContent = skill.title;
    item.appendChild(titleEl);

    // 内容
    const contentEl = document.createElement('p');
    contentEl.textContent = skill.content;
    item.appendChild(contentEl);

    // カテゴリ・タグ
    const catTagEl = document.createElement('small');
    catTagEl.textContent = `カテゴリ: ${skill.category} / タグ: ${skill.tags}`;
    item.appendChild(catTagEl);

    // 日付
    const dateEl = document.createElement('small');
    dateEl.textContent = `作成日時: ${new Date(skill.createdAt).toLocaleString()}`;
    item.appendChild(dateEl);

    // 操作ボタン群
    const actionsEl = document.createElement('div');
    actionsEl.className = 'skill-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => openEditModal(skill.id));
    actionsEl.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', async () => {
      if (confirm('このスキルを削除しますか？')) {
        await deleteSkill(skill.id);
        renderSkillList();
      }
    });
    actionsEl.appendChild(deleteBtn);

    item.appendChild(actionsEl);

    listEl.appendChild(item);
  });
}

/**
 * 登録フォームのセットアップ
 */
function setupForm() {
  const form = document.getElementById('skill-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const categoryInput = document.getElementById('category');
    const tagsInput = document.getElementById('tags');
    const pinnedChk = document.getElementById('pinned');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const category = categoryInput.value.trim();
    const tags = tagsInput.value.trim();
    const pinned = pinnedChk.checked;

    if (!title) {
      alert('タイトルを入力してください。');
      return;
    }

    // 新規登録
    await addSkill(title, content, category, tags, pinned);

    // フォーム初期化
    titleInput.value = '';
    contentInput.value = '';
    categoryInput.value = '';
    tagsInput.value = '';
    pinnedChk.checked = false;

    renderSkillList();
  });
}

// =============================
// 編集用モーダル
// =============================

let backdropEl; // 背景
let editModalEl; // モーダル本体
let editSkillId; // 編集対象ID

/**
 * モーダルを開く
 */
async function openEditModal(skillId) {
  // スキル情報を取得
  const skill = await getSkillById(skillId);
  if (!skill) return;

  editSkillId = skillId;

  // モーダル要素作成
  createEditModalElements();

  // フィールドに既存の値をセット
  document.getElementById('edit-title').value = skill.title;
  document.getElementById('edit-content').value = skill.content;
  document.getElementById('edit-category').value = skill.category;
  document.getElementById('edit-tags').value = skill.tags;
  document.getElementById('edit-pinned').checked = skill.pinned;

  // モーダル表示
  backdropEl.classList.add('active');
}

/**
 * モーダル要素を生成（初回のみ）
 */
function createEditModalElements() {
  // 既に作られていればスキップ
  if (editModalEl) {
    editModalEl.style.display = 'block';
    backdropEl.style.display = 'block';
    return;
  }

  // 背景
  backdropEl = document.createElement('div');
  backdropEl.className = 'modal-backdrop active';
  document.body.appendChild(backdropEl);

  // モーダル
  editModalEl = document.createElement('div');
  editModalEl.className = 'edit-modal';

  editModalEl.innerHTML = `
    <h2>スキルを編集</h2>
    <div class="modal-field">
      <label>タイトル: </label>
      <input id="edit-title" type="text" />
    </div>
    <div class="modal-field">
      <label>内容: </label>
      <textarea id="edit-content" rows="2"></textarea>
    </div>
    <div class="modal-field">
      <label>カテゴリ: </label>
      <input id="edit-category" type="text" />
    </div>
    <div class="modal-field">
      <label>タグ: </label>
      <input id="edit-tags" type="text" placeholder="カンマ区切り" />
    </div>
    <div class="modal-field">
      <label>ピン留め: </label>
      <input id="edit-pinned" type="checkbox" />
    </div>
    <div class="modal-buttons">
      <button id="edit-save-btn">保存</button>
      <button id="edit-cancel-btn">キャンセル</button>
    </div>
  `;

  document.body.appendChild(editModalEl);

  // ボタンイベント
  document.getElementById('edit-save-btn').addEventListener('click', handleEditSave);
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
}

/**
 * 編集を保存
 */
async function handleEditSave() {
  const newTitle = document.getElementById('edit-title').value.trim();
  const newContent = document.getElementById('edit-content').value.trim();
  const newCategory = document.getElementById('edit-category').value.trim();
  const newTags = document.getElementById('edit-tags').value.trim();
  const newPinned = document.getElementById('edit-pinned').checked;

  if (!newTitle) {
    alert('タイトルを入力してください。');
    return;
  }

  await updateSkill(editSkillId, {
    title: newTitle,
    content: newContent,
    category: newCategory,
    tags: newTags,
    pinned: newPinned
  });

  closeEditModal();
  renderSkillList();
}

/**
 * モーダルを閉じる
 */
function closeEditModal() {
  if (editModalEl) {
    editModalEl.style.display = 'none';
  }
  if (backdropEl) {
    backdropEl.style.display = 'none';
  }
}

// =============================
// エクスポート/インポート
// =============================
function setupExportImport() {
  const exportBtn = document.getElementById('export-btn');
  exportBtn.addEventListener('click', handleExport);

  const importBtn = document.getElementById('import-btn');
  importBtn.addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  const importFileInput = document.getElementById('import-file');
  importFileInput.addEventListener('change', handleImportFile);
}

/**
 * データをJSONでエクスポート
 */
async function handleExport() {
  const skills = await getSkills();
  // JSON文字列化
  const jsonStr = JSON.stringify(skills, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'skillData.json';
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * JSONファイルを読み込み -> インポート
 */
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) {
        throw new Error('インポートデータが配列ではありません');
      }

      const tx = db.transaction(['skillStore'], 'readwrite');
      const store = tx.objectStore('skillStore');

      for (const record of data) {
        // id が被っていると上書きされる可能性がある
        // ここでは "put" を使い、既存なら上書き、新規なら追加にしています
        store.put({
          ...record,
          // pinned, category など存在しない項目があれば初期化
          pinned: record.pinned || false,
          category: record.category || '',
          tags: record.tags || '',
          createdAt: record.createdAt || new Date(),
          updatedAt: new Date()
        });
      }

      tx.oncomplete = () => {
        alert('インポートが完了しました');
        renderSkillList();
      };
      tx.onerror = () => {
        alert('インポートに失敗しました');
      };
    } catch (err) {
      alert('インポートエラー: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// =============================
// 検索＆ソート
// =============================
function setupSearchAndSort() {
  const searchBtn = document.getElementById('search-btn');
  searchBtn.addEventListener('click', () => {
    const input = document.getElementById('search-input');
    searchKeyword = input.value.trim();
    renderSkillList();
  });

  const sortSelect = document.getElementById('sort-order');
  sortSelect.addEventListener('change', () => {
    sortOrder = sortSelect.value;
    renderSkillList();
  });
}

// =============================
// エントリーポイント
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  setupForm();
  setupExportImport();
  setupSearchAndSort();
  renderSkillList();
});
