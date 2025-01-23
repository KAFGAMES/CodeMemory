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

// =============================
// IndexedDB 初期化
// =============================
function initDB() {
  return new Promise((resolve, reject) => {
    // DBバージョン: 5 にアップ
    const request = indexedDB.open('skillDB', 5);

    request.onupgradeneeded = (e) => {
      db = e.target.result;
      const oldVersion = e.oldVersion;

      if (!db.objectStoreNames.contains('skillStore')) {
        // 新規作成（初回）
        db.createObjectStore('skillStore', { keyPath: 'id', autoIncrement: true });
      } else {
        // すでに skillStore が存在
        // oldVersion < 5 なら、既存データにも completed フィールドを扱えるようにする
        // (実際は動的にフィールドを追加可能なので特別な作業は不要だが、
        //  バージョンを上げておくことで将来的な拡張にも対応できる)
        console.log('DBアップグレード:', oldVersion, '=>', 5);
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
      completed: false, // ★追加: 新規は未完了がデフォルト
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
      // 既存データに completed が無い場合は false に補完
      const result = req.result.map(item => {
        if (item.completed === undefined) {
          item.completed = false;
        }
        return item;
      });
      resolve(result);
    };
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
    req.onsuccess = () => {
      const skill = req.result;
      if (skill && skill.completed === undefined) {
        skill.completed = false;
      }
      resolve(skill);
    };
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
      completed: (newData.completed !== undefined) ? newData.completed : skill.completed,
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
// forceScroll が true の時のみリストを下までスクロールする
async function render(forceScroll = false) {
  if (currentTab === 'monthly') {
    document.getElementById('skill-list').style.display = 'none';
    document.getElementById('monthly-view').style.display = 'block';
    // Pinnedフィルター UI は隠す
    document.getElementById('pinned-filter-area').style.display = 'none';

    await renderMonthlyView(forceScroll);
  } else {
    document.getElementById('skill-list').style.display = 'block';
    document.getElementById('monthly-view').style.display = 'none';

    // ★ Pinnedタブならピンレベルフィルターを表示
    if (currentTab === 'pinned') {
      document.getElementById('pinned-filter-area').style.display = 'block';
    } else {
      document.getElementById('pinned-filter-area').style.display = 'none';
    }

    await renderSkillList(forceScroll);
  }
}

/**
 * スキル一覧を描画 (All or Pinnedタブ用)
 * @param {boolean} forceScroll - trueなら描画後にリストを一番下までスクロールする
 */
async function renderSkillList(forceScroll) {
  const listEl = document.getElementById('skill-list');

  // 現在のスクロール位置を保持
  const currentScroll = listEl.scrollTop;

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

    // ★ completed なら暗め色に
    if (skill.completed) {
      item.classList.add('completed');
    }

    // ピン留めアイコン: ★1～★5を文字列化
    const pinSpan = document.createElement('span');
    pinSpan.className = 'pin-icon';
    pinSpan.textContent = getPinStarString(Number(skill.pinned));
    // クリックでレベルを1つ上げ(0～5ループ)
    pinSpan.addEventListener('click', () => {
      // 完了済みでも操作可能にしているが、要件次第で無効化も可
      const newLevel = (Number(skill.pinned) + 1) % 6; // 0～5
      // 変更時はスクロール維持 => forceScroll=false
      updateSkill(skill.id, { pinned: newLevel }).then(() => render(false));
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

    // ★ 完了/未完了 切り替えボタン
    const toggleCompleteBtn = document.createElement('button');
    toggleCompleteBtn.textContent = skill.completed ? '未完了' : '完了';
    toggleCompleteBtn.addEventListener('click', () => {
      toggleCompletion(skill, false); // 変更時はスクロール維持
    });
    actionsEl.appendChild(toggleCompleteBtn);

    const editBtn = document.createElement('button');
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => openEditModal(skill.id));
    actionsEl.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', async () => {
      if (confirm('削除しますか？')) {
        await deleteSkill(skill.id);
        // 削除時もスクロール維持
        render(false);
      }
    });
    actionsEl.appendChild(delBtn);

    item.appendChild(actionsEl);
    listEl.appendChild(item);
  });

  // 強制スクロールのフラグが true の場合のみ下までスクロール
  if (forceScroll) {
    listEl.scrollTop = listEl.scrollHeight;
  } else {
    // それ以外の場合は現在のスクロール位置を維持
    listEl.scrollTop = currentScroll;
  }
}

/**
 * 月別ビューを描画
 * @param {boolean} forceScroll - trueなら描画後にMonthlyビューを一番下までスクロールする
 */
async function renderMonthlyView(forceScroll) {
  const monthlyEl = document.getElementById('monthly-view');
  // 現在のスクロール位置
  const currentScroll = monthlyEl.scrollTop;

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

      // 完了していればクラス付与
      if (skill.completed) {
        item.classList.add('completed');
      }

      // ピン留めアイコン
      const pinSpan = document.createElement('span');
      pinSpan.className = 'pin-icon';
      pinSpan.textContent = getPinStarString(Number(skill.pinned));
      pinSpan.addEventListener('click', () => {
        const newLevel = (Number(skill.pinned) + 1) % 6;
        // ピン変更時はスクロール維持 => false
        updateSkill(skill.id, { pinned: newLevel }).then(() => render(false));
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

      // 完了/未完了 切り替え
      const toggleCompleteBtn = document.createElement('button');
      toggleCompleteBtn.textContent = skill.completed ? '未完了' : '完了';
      toggleCompleteBtn.addEventListener('click', () => {
        toggleCompletion(skill, false); // スクロール維持
      });
      actionsEl.appendChild(toggleCompleteBtn);

      const editBtn = document.createElement('button');
      editBtn.textContent = '編集';
      editBtn.addEventListener('click', () => openEditModal(skill.id));
      actionsEl.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', async () => {
        if (confirm('削除しますか？')) {
          await deleteSkill(skill.id);
          render(false);
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

  // 描画終了後、forceScroll が true の場合のみ下までスクロール
  if (forceScroll) {
    monthlyEl.scrollTop = monthlyEl.scrollHeight;
  } else {
    // それ以外は元の位置を維持
    monthlyEl.scrollTop = currentScroll;
  }
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
// 完了/未完了のトグル
// =============================
async function toggleCompletion(skill, forceScroll = false) {
  const newCompleted = !skill.completed;
  // 完了にする場合は pinned=0 に
  // 未完了に戻す場合は pinned はそのまま
  let updateData = { completed: newCompleted };
  if (newCompleted) {
    updateData.pinned = 0;
  }
  await updateSkill(skill.id, updateData);
  // トグル時はスクロール動作を呼び出し元で指定
  render(forceScroll);
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
    // フィルター変更後は強制スクロールしたい場合は render(true)でも可
    // 今回はフィルター変更時も位置維持なら false
    render(true);
  });
  tagSelect.addEventListener('change', () => {
    selectedTag = tagSelect.value;
    render(true);
  });

  clearBtn.addEventListener('click', () => {
    selectedCategory = '';
    selectedTag = '';
    categorySelect.value = '';
    tagSelect.value = '';
    render(true);
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
    // ソート変更後は一番下にスクロールして見たい場合はtrue
    render(true);
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
          completed: !!record.completed, // boolean化
          category: record.category || '',
          tags: record.tags || '',
          createdAt: record.createdAt || new Date(),
          updatedAt: new Date()
        });
      }
      tx.oncomplete = () => {
        alert('インポート完了');
        // インポート後、リスト全体を見やすくするならスクロールする => true
        render(true);
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
      // タブ切り替え時は下までスクロールしたい => render(true)
      render(true);
    });
  });

  // ★ Pinnedフィルターセレクト
  const pinnedFilterSelect = document.getElementById('pinned-filter');
  pinnedFilterSelect.addEventListener('change', () => {
    pinnedFilter = pinnedFilterSelect.value; // 'any', '1'..'5'
    // フィルター変更 => リスト下部表示したいなら true
    render(true);
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
  // 編集保存後もスクロール維持
  render(false);
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

      // 新規追加時には一番下に追加されるので、下までスクロールしたい => true
      render(true);
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

  // 最初の表示は ALL タブをアクティブにして強制スクロール
  currentTab = 'all';
  document.querySelector('.tab-btn[data-target="all"]')?.classList.add('active');
  await render(true);
});
