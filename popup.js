// =============================
// IndexedDB 定義
// =============================
let db;

// ★ デフォルトは古い順("asc")に変更
let sortOrder = 'asc';     

// 検索条件
let selectedCategory = '';
let selectedTag = '';

// タブ管理
let currentTab = 'all';  // "all", "pinned", "monthly"


/**
 * IndexedDB 初期化
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('skillDB', 3);

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
      tags: tags || '', // 文字列で保存
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

/**
 * IDで1つ取得
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
 * スキル更新
 */
function updateSkill(id, newData) {
  return new Promise(async (resolve, reject) => {
    const skill = await getSkillById(id);
    if (!skill) return reject(new Error('Skill not found'));

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
 * スキル削除
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
// メイン描画
// =============================
async function render() {
  if (currentTab === 'monthly') {
    document.getElementById('skill-list').style.display = 'none';
    document.getElementById('monthly-view').style.display = 'block';
    renderMonthlyView();
  } else {
    document.getElementById('skill-list').style.display = 'block';
    document.getElementById('monthly-view').style.display = 'none';
    renderSkillList();
  }
}

/**
 * スキル一覧を描画 (All or Pinnedタブ用)
 */
async function renderSkillList() {
  const listEl = document.getElementById('skill-list');
  listEl.innerHTML = '';

  let skills = await getSkills();

  // フィルタリング: Category, Tag
  if (selectedCategory) {
    skills = skills.filter(s => s.category === selectedCategory);
  }
  if (selectedTag) {
    // タグはカンマ区切りで複数ある可能性があるため、部分一致チェック
    // (厳密に "tag1,tag2" のようにマッチさせたい場合は工夫が必要)
    skills = skills.filter(s => s.tags.split(',').map(t => t.trim()).includes(selectedTag));
  }

  // Pinnedタブの場合、pinned==true のみ
  if (currentTab === 'pinned') {
    skills = skills.filter(s => s.pinned);
  }

  // ソート（ピン留めタブでもさらに古い順/新しい順が適用される想定）
  skills.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (sortOrder === 'asc') {
      return timeA - timeB; // 古い順
    } else {
      return timeB - timeA; // 新しい順
    }
  });

  skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    // ピン留めアイコン
    const pinIcon = document.createElement('span');
    pinIcon.className = 'pin-icon ' + (skill.pinned ? 'gold' : 'gray');
    pinIcon.textContent = '★';
    pinIcon.addEventListener('click', () => {
      updateSkill(skill.id, { pinned: !skill.pinned }).then(() => render());
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
    const dateObj = new Date(skill.createdAt);
    dateEl.textContent = `作成日時: ${dateObj.toLocaleString()}`;
    item.appendChild(dateEl);

    // 操作ボタン群
    const actionsEl = document.createElement('div');
    actionsEl.className = 'skill-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => openEditModal(skill.id));
    actionsEl.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', async () => {
      if (confirm('削除しますか？')) {
        await deleteSkill(skill.id);
        render();
      }
    });
    actionsEl.appendChild(delBtn);

    item.appendChild(actionsEl);
    listEl.appendChild(item);
  });

  // スクロール位置を一番下に移動
  listEl.scrollTop = listEl.scrollHeight;
}

/**
 * 月別ビューを描画
 */
async function renderMonthlyView() {
  const monthlyEl = document.getElementById('monthly-view');
  monthlyEl.innerHTML = '';

  // 全スキル取得
  let skills = await getSkills();

  // フィルタ（category/tagは共通）
  if (selectedCategory) {
    skills = skills.filter(s => s.category === selectedCategory);
  }
  if (selectedTag) {
    skills = skills.filter(s => s.tags.split(',').map(t => t.trim()).includes(selectedTag));
  }

  // ソート
  skills.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  });

  // 年月ごとにグルーピング: { '2025-01': [...], '2025-02': [...], ... }
  const groupMap = {};
  skills.forEach(s => {
    const d = new Date(s.createdAt);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // e.g. "2025-01"
    if (!groupMap[ym]) {
      groupMap[ym] = [];
    }
    groupMap[ym].push(s);
  });

  // 年月キーをソート
  const sortedKeys = Object.keys(groupMap).sort((a, b) => {
    if (sortOrder === 'asc') {
      return a.localeCompare(b);
    } else {
      return b.localeCompare(a);
    }
  });

  // 各年月ブロック生成
  sortedKeys.forEach(ym => {
    const [year, month] = ym.split('-');
    const headingText = `${year}年${Number(month)}月`;

    const block = document.createElement('div');
    block.className = 'month-block';

    // 見出し
    const header = document.createElement('div');
    header.className = 'month-header';
    header.textContent = headingText;
    block.appendChild(header);

    // リスト
    const listDiv = document.createElement('div');
    listDiv.className = 'month-list';

    const items = groupMap[ym];
    items.forEach(skill => {
      const item = document.createElement('div');
      item.className = 'skill-item';

      // ピン留めアイコン
      const pinIcon = document.createElement('span');
      pinIcon.className = 'pin-icon ' + (skill.pinned ? 'gold' : 'gray');
      pinIcon.textContent = '★';
      pinIcon.addEventListener('click', () => {
        updateSkill(skill.id, { pinned: !skill.pinned }).then(() => render());
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
      const dateObj = new Date(skill.createdAt);
      dateEl.textContent = `作成日時: ${dateObj.toLocaleString()}`;
      item.appendChild(dateEl);

      // 操作ボタン
      const actionsEl = document.createElement('div');
      actionsEl.className = 'skill-actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = '編集';
      editBtn.addEventListener('click', () => openEditModal(skill.id));
      actionsEl.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', async () => {
        if (confirm('削除しますか？')) {
          await deleteSkill(skill.id);
          render();
        }
      });
      actionsEl.appendChild(delBtn);

      item.appendChild(actionsEl);
      listDiv.appendChild(item);
    });

    block.appendChild(listDiv);

    // 見出しクリックで開閉
    header.addEventListener('click', () => {
      listDiv.classList.toggle('open');
    });

    monthlyEl.appendChild(block);
  });
}

// =============================
// 登録フォーム
// =============================
function setupForm() {
  const form = document.getElementById('skill-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value.trim();
    const content = document.getElementById('content').value.trim();
    const category = document.getElementById('category').value.trim();
    const tags = document.getElementById('tags').value.trim();
    const pinned = document.getElementById('pinned').checked;

    if (!title) {
      alert('タイトルを入力してください。');
      return;
    }

    await addSkill(title, content, category, tags, pinned);

    // フォーム初期化
    document.getElementById('title').value = '';
    document.getElementById('content').value = '';
    document.getElementById('category').value = '';
    document.getElementById('tags').value = '';
    document.getElementById('pinned').checked = false;

    render();
    buildCategoryTagOptions(); // 新しく追加したカテゴリ/タグを反映
  });
}

// =============================
// カテゴリ/タグのプルダウンを作る
// =============================
async function buildCategoryTagOptions() {
  const skills = await getSkills();
  const categorySet = new Set();
  const tagSet = new Set();

  skills.forEach(s => {
    if (s.category) categorySet.add(s.category);
    if (s.tags) {
      s.tags.split(',').forEach(t => tagSet.add(t.trim()));
    }
  });

  // categoryセレクト
  const categorySelect = document.getElementById('category-select');
  categorySelect.innerHTML = '<option value="">(All)</option>';
  Array.from(categorySet).sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });

  // tagセレクト
  const tagSelect = document.getElementById('tag-select');
  tagSelect.innerHTML = '<option value="">(All)</option>';
  Array.from(tagSet).sort().forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagSelect.appendChild(option);
  });
}

// =============================
// フィルター操作
// =============================
function setupFilterArea() {
  const categorySelect = document.getElementById('category-select');
  const tagSelect = document.getElementById('tag-select');
  const clearBtn = document.getElementById('clear-filter-btn');

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    render();
  });
  tagSelect.addEventListener('change', () => {
    selectedTag = tagSelect.value;
    render();
  });

  clearBtn.addEventListener('click', () => {
    selectedCategory = '';
    selectedTag = '';
    categorySelect.value = '';
    tagSelect.value = '';
    render();
  });
}

// =============================
// ソート + エクポート/インポート
// =============================
function setupControls() {
  const sortSelect = document.getElementById('sort-order');
  sortSelect.value = sortOrder; // 初期値 "asc"

  sortSelect.addEventListener('change', () => {
    sortOrder = sortSelect.value;
    render();
  });

  const exportBtn = document.getElementById('export-btn');
  exportBtn.addEventListener('click', handleExport);

  const importBtn = document.getElementById('import-btn');
  importBtn.addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  const importFileInput = document.getElementById('import-file');
  importFileInput.addEventListener('change', handleImportFile);
}

async function handleExport() {
  const skills = await getSkills();
  const jsonStr = JSON.stringify(skills, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'skillData.json';
  a.click();
  URL.revokeObjectURL(url);
}

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
        store.put({
          ...record,
          pinned: !!record.pinned,
          category: record.category || '',
          tags: record.tags || '',
          createdAt: record.createdAt || new Date(),
          updatedAt: new Date()
        });
      }
      tx.oncomplete = () => {
        alert('インポート完了');
        render();
        buildCategoryTagOptions();
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
// タブ切り替え
// =============================
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 全タブのactiveを外し、このボタンだけactive
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // ターゲット
      currentTab = btn.dataset.target; // "all", "pinned", "monthly"
      render();
    });
  });
}

// =============================
// 編集モーダル
// =============================
let backdropEl; 
let editModalEl;
let editSkillId;

async function openEditModal(skillId) {
  const skill = await getSkillById(skillId);
  if (!skill) return;
  editSkillId = skillId;
  createEditModalElements();

  document.getElementById('edit-title').value = skill.title;
  document.getElementById('edit-content').value = skill.content;
  document.getElementById('edit-category').value = skill.category;
  document.getElementById('edit-tags').value = skill.tags;
  document.getElementById('edit-pinned').checked = skill.pinned;

  backdropEl.classList.add('active');
}

function createEditModalElements() {
  if (editModalEl) {
    editModalEl.style.display = 'block';
    backdropEl.style.display = 'block';
    return;
  }

  backdropEl = document.createElement('div');
  backdropEl.className = 'modal-backdrop active';
  document.body.appendChild(backdropEl);

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
      <input id="edit-tags" type="text" />
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

  document.getElementById('edit-save-btn').addEventListener('click', handleEditSave);
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
}

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
    pinned: newPinned,
  });

  closeEditModal();
  render();
  buildCategoryTagOptions();
}

function closeEditModal() {
  if (editModalEl) {
    editModalEl.style.display = 'none';
  }
  if (backdropEl) {
    backdropEl.style.display = 'none';
  }
}

// =============================
// エントリーポイント
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  setupTabs();
  setupForm();
  setupFilterArea();
  setupControls();
  await buildCategoryTagOptions();

  render(); // 初回描画
});
