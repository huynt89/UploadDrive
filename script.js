const CLIENT_ID = "957298442128-v4c9rc83fud515f2is92p97lojjoiuja.apps.googleusercontent.com"; 
const API_KEY = "AIzaSyCxJzJVa5OUlnPDKvyxiUqkIJGQ8-hxZtU"; 

const SCOPES = "https://www.googleapis.com/auth/drive";	
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// --- BIẾN TOÀN CỤC ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let folderIdCache = {}; 
let filesToUpload = []; 

// Biến cho upload
let targetFolderId = 'root';
let targetFolderName = 'Drive của tôi';

// Biến cho Cột 2 (Duyệt thư mục đích)
let targetCurrentFolderId = 'root'; 

// Biến cho Cột Danh sách File (Phía dưới)
let currentFolderId = 'root'; 
let folderHistory = [{ id: 'root', name: 'Drive của tôi' }];

// --- ELEMENTS ---
const authorizeButton = document.getElementById("authorize_button");
const signoutButton = document.getElementById("signout_button");
const authStatusBadge = document.getElementById("auth_status_badge"); 
const authText = document.getElementById("auth_text"); 

const uploadButton = document.getElementById("upload_button");
const uploadStatus = document.getElementById("upload_status");
const progressDisplay = document.getElementById("progress_display");
const progressText = document.getElementById("progress_text");
const progressBarInner = document.getElementById("progress_bar_inner");

const fileInputFiles = document.getElementById("file_input_files");
const fileInputFolder = document.getElementById("file_input_folder");

const targetStatus = document.getElementById("target_status");
const targetFolderList = document.getElementById("target_folder_list");
const reloadTargetFoldersButton = document.getElementById("reload_target_folders");

const listButton = document.getElementById("list_button");
const filesTbody = document.getElementById("files_tbody");
const goBackButton = document.getElementById("go_back_button");
const breadcrumbPath = document.getElementById("breadcrumb_path");


// --- KHỞI TẠO ---
function gapiLoaded() { gapi.load("client", initializeGapiClient); }
async function initializeGapiClient() {
    try {
        await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
        gapiInited = true;
        maybeEnableAuthButton();
    } catch (error) {
        console.error(error);
        if(authText) authText.textContent = "Lỗi API: " + error.message;
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES, callback: ""
    });
    gisInited = true;
    
    // GÁN SỰ KIỆN CLICK SAU KHI tokenClient ĐÃ SẴN SÀNG (Sửa lỗi logic)
    if(authorizeButton) authorizeButton.onclick = handleAuthClick;
    if(signoutButton) signoutButton.onclick = handleSignoutClick;
    
    fileInputFiles.onchange = (e) => { filesToUpload = Array.from(e.target.files); updateUploadInputStatus(); };
    fileInputFolder.onchange = (e) => { filesToUpload = Array.from(e.target.files); updateUploadInputStatus(); };
    reloadTargetFoldersButton.onclick = () => { listTargetFolders(targetCurrentFolderId, targetFolderName); };
    
    goBackButton.onclick = () => { navigateHistory(folderHistory.length - 2); };
    listButton.onclick = () => { folderHistory = [{ id: 'root', name: 'Drive của tôi' }]; listFiles('root'); };
    uploadButton.onclick = handleUploadClick;

    maybeEnableAuthButton();
}

function maybeEnableAuthButton() {
    if (gapiInited && gisInited && authorizeButton) {
        authorizeButton.disabled = false;
        if(authText) authText.textContent = "Sẵn sàng kết nối";
    }
}

// --- XỬ LÝ ĐĂNG NHẬP ---
function handleAuthClick() {
    if (!tokenClient) return console.error("Token Client chưa sẵn sàng!");

    tokenClient.callback = async (resp) => {
        if (resp.error) {
            alert("Lỗi đăng nhập: " + resp.error);
            return;
        }
        
        // UI Change: Đăng nhập thành công
        authorizeButton.style.display = "none";
        signoutButton.style.display = "inline-flex";
        
        // Cập nhật Badge xanh
        authStatusBadge.className = "status-badge connected";
        authText.textContent = "Đã kết nối";
        
        signoutButton.disabled = false;
        listButton.disabled = false;
        reloadTargetFoldersButton.disabled = false;
        
        updateUploadInputStatus();
        await listFiles(); 
        await listTargetFolders(); 
    };
    
    tokenClient.requestAccessToken({ prompt: "select_account" });
}

// --- XỬ LÝ ĐĂNG XUẤT ---
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken("");
    }
    // Reset UI: Về trạng thái chưa đăng nhập
    authorizeButton.style.display = "inline-flex";
    signoutButton.style.display = "none";
    
    // Cập nhật Badge xám
    authStatusBadge.className = "status-badge disconnected";
    authText.textContent = "Chưa kết nối";
    
    // Reset Data
    filesToUpload = [];
    filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Vui lòng đăng nhập.</td></tr>';
    targetFolderList.innerHTML = '<div class="placeholder-text">Đăng nhập để xem...</div>';
    targetFolderId = 'root';
    targetFolderName = 'Drive của tôi';
    updateUploadInputStatus();
}


// --- CỘT 2: QUẢN LÝ THƯ MỤC ĐÍCH ---
async function listTargetFolders(parentFolderId = 'root', parentFolderName = 'Drive của tôi') {
    targetCurrentFolderId = parentFolderId;
    targetFolderList.innerHTML = '<div class="placeholder-text">Đang tải...</div>';
    
    targetFolderId = parentFolderId;
    targetFolderName = parentFolderName;
    updateTargetStatus();
    updateUploadInputStatus();

    try {
        const response = await gapi.client.drive.files.list({
            pageSize: 100,
            fields: "files(id,name,mimeType)",
            orderBy: "name",
            q: `mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`,
        });

        const folders = response.result.files || [];
        targetFolderList.innerHTML = "";

        if (parentFolderId !== 'root') {
             const backDiv = document.createElement('div');
             backDiv.className = 'folder-item';
             backDiv.innerHTML = '🔙 <strong>.. (Về Drive của tôi)</strong>';
             backDiv.onclick = () => {
                 listTargetFolders('root', 'Drive của tôi');
             };
             targetFolderList.appendChild(backDiv);
        }

        if (folders.length > 0) {
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'folder-item';
                if(folder.id === targetFolderId) div.classList.add('active-target'); 
                div.innerHTML = `📁 ${folder.name}`;
                div.onclick = () => {
                    listTargetFolders(folder.id, folder.name);
                };
                targetFolderList.appendChild(div);
            });
        } else {
            targetFolderList.innerHTML += '<div class="placeholder-text">Thư mục trống</div>';
        }
    } catch (err) {
        console.error(err);
        targetFolderList.innerHTML = '<div class="placeholder-text" style="color:red">Lỗi tải danh sách</div>';
    }
}

function updateTargetStatus() {
    targetStatus.innerHTML = `Đích: <strong>/${targetFolderName}</strong>`;
}

// --- CỘT 1: UPLOAD ---
function updateUploadInputStatus() {
    const count = filesToUpload.length;
    if (count > 0) {
        uploadStatus.textContent = `Sẵn sàng: ${count} mục vào "${targetFolderName}"`;
        uploadStatus.style.color = "green";
        uploadButton.disabled = false;
    } else {
        uploadStatus.textContent = `Chưa chọn tệp nào.`;
        uploadStatus.style.color = "#666";
        uploadButton.disabled = true;
    }
    progressDisplay.style.display = 'none';
}

async function createFolderIfNeeded(pathSegments, parentId) {
    let currentParentId = parentId;
    for (const segment of pathSegments) {
        const currentPath = currentParentId + '/' + segment;
        if (folderIdCache[currentPath]) {
            currentParentId = folderIdCache[currentPath];
            continue;
        }
        const q = `name = '${segment.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed = false`;
        const res = await gapi.client.drive.files.list({q: q, fields: 'files(id)'});
        
        if (res.result.files.length > 0) {
            currentParentId = res.result.files[0].id;
        } else {
            const meta = { name: segment, mimeType: 'application/vnd.google-apps.folder', parents: [currentParentId] };
            const createRes = await gapi.client.drive.files.create({ resource: meta, fields: 'id' });
            currentParentId = createRes.result.id;
        }
        folderIdCache[currentPath] = currentParentId;
    }
    return currentParentId;
}

async function handleUploadClick() {
    const token = gapi.client.getToken();
    if (!token) return alert("Vui lòng đăng nhập!");
    
    uploadButton.disabled = true;
    progressDisplay.style.display = 'block';
    
    let success = 0;
    folderIdCache = {}; 

    for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const sizeStr = formatBytes(file.size);
        progressText.textContent = `Uploading ${i+1}/${filesToUpload.length}: ${file.name} (${sizeStr})`;
        progressBarInner.style.width = '0%';

        try {
            let parentID = targetFolderId;
            if (file.webkitRelativePath) {
                const parts = file.webkitRelativePath.split('/');
                const pathSegments = parts.slice(0, -1);
                if (pathSegments.length > 0) {
                    parentID = await createFolderIfNeeded(pathSegments, targetFolderId);
                }
            }

            const metadata = { name: file.name, mimeType: file.type || 'application/octet-stream', parents: [parentID] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
                xhr.setRequestHeader('Authorization', 'Bearer ' + token.access_token);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        progressBarInner.style.width = pct + '%';
                    }
                };
                xhr.onload = () => xhr.status < 300 ? resolve() : reject(xhr.responseText);
                xhr.onerror = () => reject("Network Error");
                xhr.send(form);
            });
            success++;
        } catch (err) {
            console.error("Upload error", file.name, err);
        }
    }
    
    uploadStatus.textContent = `Hoàn tất: ${success}/${filesToUpload.length} mục.`;
    filesToUpload = [];
    uploadButton.disabled = false;
    
    if (targetFolderId === currentFolderId) listFiles(currentFolderId);
};

// --- DANH SÁCH FILE (DƯỚI) ---
async function listFiles(folderId) {
    currentFolderId = folderId || 'root';
    renderBreadcrumb();
    
    listButton.disabled = true;
    filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Đang tải...</td></tr>';

    try {
        const res = await gapi.client.drive.files.list({
            pageSize: 50,
            fields: "files(id,name,mimeType,modifiedTime,iconLink,webViewLink,size)",
            orderBy: "folder,name",
            q: `'${currentFolderId}' in parents and trashed = false`
        });
        
        const files = res.result.files || [];
        filesTbody.innerHTML = "";
        
        if(files.length === 0) {
            filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Thư mục trống.</td></tr>';
        } else {
            files.forEach(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const tr = document.createElement('tr');
                if (isFolder) {
                    tr.classList.add('folder-row');
                    tr.onclick = () => {
                        folderHistory.push({id: file.id, name: file.name});
                        listFiles(file.id);
                    };
                }
                
                tr.innerHTML = `
                    <td>${isFolder ? '📁 ' : '📄 '}${file.name}</td>
                    <td>${isFolder ? 'Folder' : 'File'}</td>
                    <td>${formatDateCustom(file.modifiedTime)}</td> 
                    <td>${isFolder ? '-' : formatBytes(file.size)}</td>
                    <td>${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" onclick="event.stopPropagation()">Mở</a>` : '-'}</td>
                `;
                filesTbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
        filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text" style="color:red">Lỗi tải dữ liệu.</td></tr>';
    } finally {
        listButton.disabled = false;
    }
}

function renderBreadcrumb() {
    const path = folderHistory.map((f, i) => {
        if (i === folderHistory.length - 1) return `<strong>${f.name}</strong>`;
        return `<span style="cursor:pointer; color:#2563eb" onclick="navigateHistory(${i})">${f.name}</span>`;
    }).join(' / ');
    breadcrumbPath.innerHTML = path;
    goBackButton.disabled = folderHistory.length <= 1;
}

function navigateHistory(index) {
    if (index < 0) return;
    folderHistory = folderHistory.slice(0, index + 1);
    listFiles(folderHistory[folderHistory.length -1].id);
}

// Helper format size
function formatBytes(bytes) {
    if (!bytes || bytes == 0) return '0 B';
    const k = 1024; 
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper format date: dd/mm/yy hh:mm
function formatDateCustom(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}