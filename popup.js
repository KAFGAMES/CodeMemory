// =============================
// IndexedDB 定義
// =============================
let db;

// ★ デフォルトは古い順("asc")にする
let sortOrder = 'asc'; 

// 検索条件
let selectedCategory = '';
let selectedTag = '';

// タブ管理
let currentTab = 'all'; // "all", "pinned", "monthly"

// ★追加: ピン止めレベルのフィルター（Pinnedタブ専用）
// 'any' なら「★1～★5すべて」
// '1','2','3','4','5' ならそのレベルのみ表示
let pinnedFilter = 'any';

// メモ途中保存用: 最後に自動追記したクリップボード内容を保持
let lastClipboard = '';

// =============================
// IndexedDB 初期化
// =============================
function initDB() {
  return new Promise((resolve, reject) => {
    // DBバージョン: 4
    const request = indexedDB.open('skillDB', 4);

    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains('skillStore')) {
        db.createObjectStore('skillStore', { keyPath: 'id', autoIncrement: true });
      }
      // 既存のstoreがある場合のマイグレーション等は省略
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
 * pinnedLevel: 0～5
 */
function addSkill(title, content, category, tags, pinnedLevel) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['skillStore'], 'readwrite');
    const store = tx.objectStore('skillStore');
    const record = {
      title: title,
      content: content,
      category: category || '',
      tags: tags || '',
      pinned: Number(pinnedLevel) || 0,
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
 * pinnedも0～5の数値
 */
function updateSkill(id, newData) {
  return new Promise(async (resolve, reject) => {
    const skill = await getSkillById(id);
    if (!skill) return reject(new Error('Skill not found'));

    // 既存データ + 上書き
    const updatedRecord = {
      ...skill,
      ...newData,
      pinned: (newData.pinned !== undefined) ? Number(newData.pinned) : skill.pinned,
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
  // 「Monthly」タブかどうかで切り替え
  if (currentTab === 'monthly') {
    document.getElementById('skill-list').style.display = 'none';
    document.getElementById('monthly-view').style.display = 'block';
    // Pinnedフィルター UI は隠す
    document.getElementById('pinned-filter-area').style.display = 'none';
    renderMonthlyView();
  } else {
    document.getElementById('skill-list').style.display = 'block';
    document.getElementById('monthly-view').style.display = 'none';

    // ★ Pinnedタブならピンレベルフィルターを表示
    if (currentTab === 'pinned') {
      document.getElementById('pinned-filter-area').style.display = 'block';
    } else {
      document.getElementById('pinned-filter-area').style.display = 'none';
    }

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

  // (1) Categoryフィルタ
  if (selectedCategory) {
    skills = skills.filter(s => s.category === selectedCategory);
  }
  // (2) Tagフィルタ
  if (selectedTag) {
    skills = skills.filter(s => {
      const tagArr = s.tags.split(',').map(t => t.trim());
      return tagArr.includes(selectedTag);
    });
  }

  // (3) タブごと分岐
  if (currentTab === 'pinned') {
    // pinned>0 が前提
    skills = skills.filter(s => Number(s.pinned) > 0);

    // ★追加: pinnedFilter の指定がある場合さらに絞る
    if (pinnedFilter !== 'any') {
      const pinnedNum = Number(pinnedFilter);
      skills = skills.filter(s => s.pinned === pinnedNum);
    }
  }

  // (4) ソート（createdAt）
  skills.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return (sortOrder === 'asc') ? (timeA - timeB) : (timeB - timeA);
  });

  // (5) 一覧描画
  skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    // ピン留めアイコン: ★1～★5を文字列化
    const pinSpan = document.createElement('span');
    pinSpan.className = 'pin-icon';
    pinSpan.textContent = getPinStarString(Number(skill.pinned));
    // クリックでレベルを1つ上げ(0～5ループ)
    pinSpan.addEventListener('click', () => {
      const newLevel = (Number(skill.pinned) + 1) % 6; // 0～5
      updateSkill(skill.id, { pinned: newLevel }).then(() => render());
    });
    item.appendChild(pinSpan);

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

  let skills = await getSkills();

  // (1) Category/Tag フィルタ
  if (selectedCategory) {
    skills = skills.filter(s => s.category === selectedCategory);
  }
  if (selectedTag) {
    skills = skills.filter(s => {
      const tagArr = s.tags.split(',').map(t => t.trim());
      return tagArr.includes(selectedTag);
    });
  }

  // (2) ソート
  skills.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return (sortOrder === 'asc') ? (timeA - timeB) : (timeB - timeA);
  });

  // (3) 年月ごとにグルーピング
  const groupMap = {};
  skills.forEach(s => {
    const d = new Date(s.createdAt);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groupMap[ym]) {
      groupMap[ym] = [];
    }
    groupMap[ym].push(s);
  });

  // (4) 年月キーをソート
  const sortedKeys = Object.keys(groupMap).sort((a, b) => {
    return (sortOrder === 'asc') ? a.localeCompare(b) : b.localeCompare(a);
  });

  // (5) 描画
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
      const pinSpan = document.createElement('span');
      pinSpan.className = 'pin-icon';
      pinSpan.textContent = getPinStarString(Number(skill.pinned));
      pinSpan.addEventListener('click', () => {
        const newLevel = (Number(skill.pinned) + 1) % 6;
        updateSkill(skill.id, { pinned: newLevel }).then(() => render());
      });
      item.appendChild(pinSpan);

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

/**
 * pinned(0～5) を "★☆☆☆☆" のような文字列に変換
 */
function getPinStarString(level) {
  if (!level) return '☆×5'; // 0ならピン無し表示
  const full = '★★★★★'; 
  const empty = '☆☆☆☆☆';
  return full.slice(0, level) + empty.slice(level);
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
// ソート + エクスポート/インポート
// =============================
function setupControls() {
  const sortSelect = document.getElementById('sort-order');
  sortSelect.value = sortOrder;

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
          pinned: Number(record.pinned) || 0,
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
// タブ切り替え + Pinned Filter
// =============================
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.target;
      render();
    });
  });

  // ★ Pinnedフィルターセレクト
  const pinnedFilterSelect = document.getElementById('pinned-filter');
  pinnedFilterSelect.addEventListener('change', () => {
    pinnedFilter = pinnedFilterSelect.value; // 'any', '1'..'5'
    render();
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
  document.getElementById('edit-pinned-level').value = skill.pinned || 0;

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
      <label>タイトル:</label>
      <input id="edit-title" type="text" />
    </div>
    <div class="modal-field">
      <label>内容:</label>
      <textarea id="edit-content" rows="2"></textarea>
    </div>
    <div class="modal-field">
      <label>カテゴリ:</label>
      <input id="edit-category" type="text" />
    </div>
    <div class="modal-field">
      <label>タグ:</label>
      <input id="edit-tags" type="text" />
    </div>
    <div class="modal-field">
      <label>ピン止めレベル:</label>
      <select id="edit-pinned-level">
        <option value="0">なし(0)</option>
        <option value="1">★1</option>
        <option value="2">★★2</option>
        <option value="3">★★★3</option>
        <option value="4">★★★★4</option>
        <option value="5">★★★★★5</option>
      </select>
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
  const newPinnedLevel = Number(document.getElementById('edit-pinned-level').value);

  if (!newTitle) {
    alert('タイトルを入力してください。');
    return;
  }

  await updateSkill(editSkillId, {
    title: newTitle,
    content: newContent,
    category: newCategory,
    tags: newTags,
    pinned: newPinnedLevel,
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
// チャット風入力欄のセットアップ
// =============================
function setupChatInput() {
  const chatInput = document.getElementById('chat-input');
  const pinnedLevelSelect = document.getElementById('chat-pinned-level');

  // 下書き復元
  loadDraftFromLocalStorage();  

  // 入力中にドラフト保存
  chatInput.addEventListener('input', saveChatDraft);
  pinnedLevelSelect.addEventListener('change', saveChatDraft);

  // Enter送信 / Shift+Enterで改行
  chatInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 改行を防ぐ
      const content = chatInput.value.trim();
      if (!content) return;

      // pinnedLevel情報
      const pinnedLevel = Number(pinnedLevelSelect.value) || 0;

      // DB保存: title="ChatMemo", category="", tags=""
      await addSkill("ChatMemo", content, "", "", pinnedLevel);

      // 送信後: 入力欄リセット & ドラフトクリア
      chatInput.value = '';
      pinnedLevelSelect.value = '0';
      clearDraftFromLocalStorage(); 

      // 再描画
      render();
      buildCategoryTagOptions();
    }
  });
}

// 下書き保存: chat-inputの内容をlocalStorageに記憶
function saveChatDraft() {
  const draft = {
    content: document.getElementById('chat-input').value,
    pinned: document.getElementById('chat-pinned-level').value
  };
  localStorage.setItem('chatDraft', JSON.stringify(draft));
}

// 下書きロード
function loadDraftFromLocalStorage() {
  const draftStr = localStorage.getItem('chatDraft');
  if (!draftStr) return;
  try {
    const draft = JSON.parse(draftStr);
    if (draft && typeof draft === 'object') {
      document.getElementById('chat-input').value = draft.content || '';
      document.getElementById('chat-pinned-level').value = draft.pinned || '0';
    }
  } catch (err) {
    console.warn('Error parsing chatDraft:', err);
  }
}

// 下書きクリア
function clearDraftFromLocalStorage() {
  localStorage.removeItem('chatDraft');
}

// =============================
// エントリーポイント
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  console.log('initDB 完了');

  // タブ切り替え
  setupTabs();
  // フィルター/カテゴリ・タグ関連
  setupFilterArea();
  // ソート + エクスポート/インポート
  setupControls();
  // カテゴリ・タグを初期構築
  await buildCategoryTagOptions();

  // チャットUIのセットアップ
  setupChatInput();

  // 最初に ALL タブを表示
  currentTab = 'all';
  document.querySelector('.tab-btn[data-target="all"]')?.classList.add('active');
  await render();
});
