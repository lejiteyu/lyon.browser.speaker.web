// === 設定區 (請修改這裡) ===
const CLIENT_ID = '349428974262-mtqbatagcp2qgfmes5u7q6hl5bh121oa.apps.googleusercontent.com';//'您的_WEB_CLIENT_ID.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBGplLuT3GAvIhrGBXHteY8zocroG7OiOY';//'你的_API_KEY';//'您的_API_KEY';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const FILE_NAME = 'browser_tabs_backup.json';

// === 全域變數 ===
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isPendingRetry = false; // ★ 關鍵：用來標記是否正在等待重試
// === 新增全域變數 ===
let globalData = null;   // 暫存下載下來的 JSON 資料
let globalFileId = null; // 暫存雲端檔案 ID


// === 1. 初始化流程 ===
function gapiLoaded() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            checkAuthAvailable();
        } catch (err) {
            updateStatus('GAPI 初始化失敗: ' + JSON.stringify(err));
        }
    });
}

function gisLoaded() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error !== undefined) {
                    throw (resp);
                }
                
                // 1. 授權成功
                console.log("授權成功");
                
                // 2. 更新按鈕狀態 (變成「☁️ 下載資料」)
                updateButtonState(true); 

                // 3. ★★★ 修改這裡：不再判斷 isPendingRetry，直接下載 ★★★
                // 這樣「第一次登入」或「自動重試」都會自動觸發下載，用戶不用再點一次
                if (isPendingRetry) {
                    console.log("重登成功，繼續執行之前的下載任務...");
                    isPendingRetry = false; // 重置旗標
                } else {
                    console.log("登入成功，自動開始下載...");
                }

                // 立即執行下載
                listAndReadAppData();
            },
        });
        gisInited = true;
        checkAuthAvailable();
    } catch (err) {
        updateStatus('GIS 初始化失敗: ' + err);
    }
}

function checkAuthAvailable() {
    if (gapiInited && gisInited) {
        // ★ 修改：初始化時先設定為「登入」狀態
        updateButtonState(false);
        // 綁定按鈕事件
        document.getElementById('authBtn').onclick = handleAuthClick;
    }
}

function updateStatus(msg) {
    document.getElementById('status').innerText = msg;
    console.log('[Status]', msg);
}

// ★ 新增：按鈕狀態切換函式
function updateButtonState(isSignedIn) {
    const btn = document.getElementById('authBtn');
    btn.style.display = 'inline-block';
    
    if (isSignedIn) {
        btn.innerText = "☁️ 下載資料";
        // 如果有 CSS class 可以切換顏色
        // btn.classList.add('btn-success'); 
        updateStatus('已登入，請點擊下載。');
    } else {
        btn.innerText = "登入並讀取紀錄";
        updateStatus('系統就緒，請登入。');
    }
}

// === 2. 登入與 API 呼叫 ===
async function handleAuthClick() {
    const btn = document.getElementById('authBtn');
    
    if (btn.innerText.includes("登入")) {
        // 狀態 A: 還沒登入 -> 執行登入 (跳出視窗)
        if (tokenClient) {
            tokenClient.requestAccessToken({prompt: 'consent'});
        }
    } else {
        // 狀態 B: 已經是「下載資料」 -> 執行下載邏輯
        listAndReadAppData();
    }
}
//========(加入變數暫存)======================
async function listAndReadAppData() {
    try {
        updateStatus('正在搜尋雲端檔案...');
        
        const response = await gapi.client.drive.files.list({
            'q': `name = '${FILE_NAME}' and trashed = false`,
            'spaces': 'appDataFolder',
            'fields': 'files(id, name)'
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            globalFileId = files[0].id; // ★ 存起來，上傳要用
            updateStatus('找到備份檔，下載中...');

            const fileContent = await gapi.client.drive.files.get({
                fileId: globalFileId,
                alt: 'media'
            });

            globalData = fileContent.result; // ★ 存起來，修改要用
            renderData(globalData);
            updateStatus(`同步成功！(ID: ${globalFileId})`);
        } else {
            updateStatus('找不到備份檔案。');
        }
    } catch (err) {
        updateStatus('發生錯誤: ' + err.message);
        console.error(err);

        // ★ 修改：失敗重試邏輯
        // 401 = 未授權 (Token 過期), 403 = 禁止存取
        if (err.status === 401 || err.status === 403) {
            updateStatus("憑證過期，正在自動重新登入...");
            console.log("Token 失效，觸發自動重登...");

            // 設定旗標：告訴 gisLoaded callback 等一下登入成功後，要自動再跑一次 listAndReadAppData
            isPendingRetry = true;

            // 觸發登入 (使用 prompt: '' 嘗試靜默登入，減少彈窗干擾)
            tokenClient.requestAccessToken({prompt: ''});
        } else {
            updateStatus('發生錯誤: ' + (err.result?.error?.message || err.message));
        }
    }
}

// === 3. 畫面渲染邏輯 (修改版) ===
function renderData(data) {
    document.getElementById('display-area').style.display = 'block';

    // A. 渲染 Current URL (保持不變)
    const urlInput = document.getElementById('current-url-input');
    const iframe = document.getElementById('current-iframe');
    const newTabBtn = document.getElementById('open-new-tab-btn');
    const uploadBar = document.getElementById('upload-bar');

    if (data.currentUrl) {
        urlInput.value = data.currentUrl;
        iframe.src = data.currentUrl;
        newTabBtn.onclick = () => window.open(urlInput.value, '_blank');
    }

    urlInput.oninput = function() {
        const newUrl = this.value;
        globalData.currentUrl = newUrl;
        uploadBar.style.display = 'flex';
        updateStatus('檢測到變更，請點擊上傳按鈕儲存。');
    };

    // B. 處理 Tabs (★ 修改這裡：加入刪除按鈕)
    const tabsContainer = document.getElementById('tabs-container');
    tabsContainer.innerHTML = '';
    
    if (data.tabs && Array.isArray(data.tabs)) {
        data.tabs.forEach((tab, index) => {
            const tabTitle = tab.title || tab.Url; 
            
            // 加入刪除按鈕 HTML
            // 注意：editor-container 樣式已移至 CSS 處理
            const tabHtml = `
                <div class="editor-container">
                    <button class="delete-btn" onclick="deleteTab(${index})" title="刪除此分頁">×</button>

                    <div style="margin-bottom: 5px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-left: 15px;">
                        #${index + 1} ${escapeHtml(tabTitle)}
                        <button onclick="window.open('${tab.Url}', '_blank')" style="float: right; font-size: 12px; cursor: pointer;">外開</button>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px; padding-left: 15px;">${escapeHtml(tab.Url)}</div>
                    <div class="iframe-wrapper" style="height: 200px;">
                        <iframe src="${tab.Url}" loading="lazy"></iframe>
                    </div>
                </div>
            `;
            tabsContainer.innerHTML += tabHtml;
        });
    }

    // C. 渲染 History (保持不變)
    renderHistory(data);
}

// === 新增：刪除分頁功能 ===
async function deleteTab(index) {
    // 1. 跳出確認視窗
    const isConfirmed = confirm("⚠️ 確定要刪除這個分頁嗎？\n\n刪除後將會立即同步至雲端，無法復原。");
    
    if (!isConfirmed) {
        return; // 使用者取消
    }

    try {
        // 2. 從全域資料中移除該項目
        // splice(開始位置, 刪除數量)
        const deletedTab = globalData.tabs.splice(index, 1);
        console.log("已移除分頁:", deletedTab);

        // 3. 立即重新渲染畫面 (讓使用者覺得反應很快)
        renderData(globalData);
        
        // 4. 自動觸發上傳
        updateStatus(`分頁 #${index + 1} 已刪除，正在同步至雲端...`);
        await uploadChanges();

    } catch (err) {
        console.error("刪除失敗", err);
        updateStatus("刪除時發生錯誤: " + err.message);
        alert("刪除失敗，請重新整理網頁後再試");
    }
}
// 為了版面乾淨，把 History 渲染獨立出來
function renderHistory(data) {
    const historyContainer = document.getElementById('history-container');
    historyContainer.innerHTML = '';
    if (data.tabWebHistory && Array.isArray(data.tabWebHistory)) {
         // 反轉顯示，讓最新的在上面 (Optional)
        const reversedHistory = [...data.tabWebHistory].reverse();

        reversedHistory.forEach((item, index) => {
              // 計算原始索引值 (如果反轉了)
            const originalIndex = data.tabWebHistory.length - 1 - index;
             // 處理標題空值
            const displayTitle = (item.title && item.title.trim() !== "") ? item.title : item.Url;
             // 處理時間戳記 (如果 JSON 有 timeStamp)
            let dateStr = "";
            if(item.timeStamp) {
                dateStr = new Date(item.timeStamp).toLocaleString();
            }
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `<a href="${item.Url}" target="_blank">
                <span class="history-index">${originalIndex}</span>
                <span class="history-title">${escapeHtml(displayTitle)}</span>
                 <span class="history-date">${dateStr}</span>
            </a>`;
            historyContainer.appendChild(li);
        });
    }
}
// === 新增：上傳更新功能 ===
async function uploadChanges() {
    if (!globalFileId || !globalData) {
        alert('錯誤：沒有檔案 ID 或資料為空');
        return;
    }

    try {
        updateStatus('正在上傳更新至雲端...');
        
        // 準備要上傳的 JSON 字串
        const fileContent = JSON.stringify(globalData, null, 2);

        // 使用 Generic Request 方法來執行 PATCH 更新 (這是最穩定的方法)
        // 說明：https://www.googleapis.com/upload/drive/v3/files/[FILE_ID]?uploadType=media
        const response = await gapi.client.request({
            path: `/upload/drive/v3/files/${globalFileId}`,
            method: 'PATCH',
            params: {
                uploadType: 'media'
            },
            body: fileContent
        });

        if (response.status === 200) {
            updateStatus('✅ 上傳成功！雲端資料已更新。');
            document.getElementById('upload-bar').style.display = 'none'; // 隱藏按鈕
            
            // 同時更新 iframe 預覽 (如果剛剛沒更新)
            document.getElementById('current-iframe').src = globalData.currentUrl;
        } else {
            throw new Error('上傳回應非 200: ' + response.status);
        }

    } catch (err) {
        console.error('上傳失敗', err);
        updateStatus('❌ 上傳失敗: ' + (err.result?.error?.message || err.message));
        alert('上傳失敗，請檢查 Console Log');
    }
}

// === 輔助函式 ===
function createCardHtml(url, label) {
    return `
        <div class="card" onclick="window.open('${url}', '_blank')">
            <div class="card-label">${escapeHtml(label)}</div>
            <div class="card-url">${escapeHtml(url)}</div>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
