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
            callback: '', // 動態指定
        });
        gisInited = true;
        checkAuthAvailable();
    } catch (err) {
        updateStatus('GIS 初始化失敗: ' + err);
    }
}

function checkAuthAvailable() {
    if (gapiInited && gisInited) {
        document.getElementById('authBtn').style.display = 'inline-block';
        updateStatus('系統就緒，請登入。');
        
        // 綁定按鈕事件
        document.getElementById('authBtn').onclick = handleAuthClick;
    }
}

function updateStatus(msg) {
    document.getElementById('status').innerText = msg;
    console.log('[Status]', msg);
}

// === 2. 登入與 API 呼叫 ===
async function handleAuthClick() {
    if (!tokenClient) return;

    tokenClient.callback = async (resp) => {
        if (resp.error) throw resp;
        await listAndReadAppData();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
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
    }
}

// === 3. 畫面渲染邏輯 ===
function renderData(data) {
    document.getElementById('display-area').style.display = 'block';

    // A. 渲染 Current URL
    const urlInput = document.getElementById('current-url-input');
    const iframe = document.getElementById('current-iframe');
    const newTabBtn = document.getElementById('open-new-tab-btn');
    const uploadBar = document.getElementById('upload-bar');

    // 初始化數值
    if (data.currentUrl) {
        urlInput.value = data.currentUrl;
        iframe.src = data.currentUrl;
        
        // 綁定外開按鈕
        newTabBtn.onclick = () => window.open(urlInput.value, '_blank');
    }

    // ★ 綁定監聽：當網址修改時
    urlInput.oninput = function() {
        const newUrl = this.value;
        // 1. 更新 iframe 預覽 (稍微延遲避免頻繁重整)
        // iframe.src = newUrl; 
        
        // 2. 更新全域資料物件
        globalData.currentUrl = newUrl;

        // 3. 顯示上傳按鈕
        uploadBar.style.display = 'flex';
        updateStatus('檢測到變更，請點擊上傳按鈕儲存。');
    };

    //B. 處理 Tabs (也改用 iframe 預覽，但為了效能，建議預設摺疊或只顯示前幾個)
    const tabsContainer = document.getElementById('tabs-container');
    tabsContainer.innerHTML = '';
    
    if (data.tabs && Array.isArray(data.tabs)) {
        data.tabs.forEach((tab, index) => {
            // 這裡我們用一個簡化的 iframe 卡片
            const tabHtml = `
                <div class="editor-container" style="padding: 10px; border: 1px solid #eee;">
                    <div style="margin-bottom: 5px; font-weight: bold;">
                        分頁 #${index + 1} (Pos: ${tab.speakPos})
                        <button onclick="window.open('${tab.Url}', '_blank')" style="float: right; font-size: 12px;">外開</button>
                    </div>
                    <div class="iframe-wrapper" style="height: 200px;">
                        <iframe src="${tab.Url}" loading="lazy"></iframe>
                    </div>
                </div>
            `;
            tabsContainer.innerHTML += tabHtml;
        });
    }

    // C. 渲染 History (TabWebHistory)
    renderHistory(data);
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
