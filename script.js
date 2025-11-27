const CLIENT_ID = "957298442128-v4c9rc83fud515f2is92p97lojjoiuja.apps.googleusercontent.com"; 
const API_KEY = "AIzaSyCxJzJVa5OUlnPDKvyxiUqkIJGQ8-hxZtU"; 

// PHẠM VI TRUY CẬP (SCOPE) - Cần quyền đọc và ghi vào Google Drive
const SCOPES = "https://www.googleapis.com/auth/drive";	
// TÀI LIỆU KHÁM PHÁ API (Discovery Document)
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";


// ==============================================================================
// 📋 KHU VỰC KHAI BÁO BIẾN TOÀN CỤC (GLOBAL VARIABLES)
// ==============================================================================
let tokenClient;          // Đối tượng dùng để lấy Token đăng nhập (từ Google Identity Services - GIS)
let gapiInited = false;   // Trạng thái đã tải thư viện gapi chưa
let gisInited = false;    // Trạng thái đã tải thư viện gis chưa
let folderIdCache = {};   // Cache/bộ nhớ đệm để lưu ID các thư mục đã tạo, tránh tạo trùng
let filesToUpload = [];   // Mảng chứa các tệp (File object) đã chọn để upload

// --- BIẾN QUẢN LÝ THƯ MỤC ĐÍCH (CỘT 2: NƠI LƯU) ---
let targetFolderId = 'root'; // ID thư mục hiện tại để upload vào. 'root' là Drive của tôi
let targetFolderName = 'Drive của tôi';
// Mảng LỊCH SỬ duyệt thư mục đích. Dùng để quản lý nút Quay lại (Back button)
// Luôn bắt đầu với thư mục gốc.
let targetFolderHistory = [{ id: 'root', name: 'Drive của tôi' }]; 

// --- BIẾN QUẢN LÝ DANH SÁCH FILE (PHẦN DƯỚI) ---
let currentFolderId = 'root'; 
// Mảng LỊCH SỬ duyệt thư mục hiển thị danh sách file. Dùng cho Breadcrumb và nút Quay lại
let folderHistory = [{ id: 'root', name: 'Drive của tôi' }];


// ==============================================================================
// 🔗 KHU VỰC KHAI BÁO CÁC PHẦN TỬ HTML (ELEMENTS)
// ==============================================================================
// Tài khoản (Cột 3)
const authorizeButton = document.getElementById("authorize_button");
const signoutButton = document.getElementById("signout_button");
const authStatusBadge = document.getElementById("auth_status_badge"); 
const authText = document.getElementById("auth_text"); 

// Upload (Cột 1)
const uploadButton = document.getElementById("upload_button");
const uploadStatus = document.getElementById("upload_status");
const progressDisplay = document.getElementById("progress_display");
const progressText = document.getElementById("progress_text");
const progressBarInner = document.getElementById("progress_bar_inner");
const fileInputFiles = document.getElementById("file_input_files");
const fileInputFolder = document.getElementById("file_input_folder");

// Nơi lưu (Cột 2)
const targetStatus = document.getElementById("target_status");
const targetFolderList = document.getElementById("target_folder_list");
const reloadTargetFoldersButton = document.getElementById("reload_target_folders");
const goBackTargetFolderButton = document.getElementById("go_back_target_folder"); // Nút Quay lại ICON

// Danh sách File (Phần dưới)
const listButton = document.getElementById("list_button");
const filesTbody = document.getElementById("files_tbody");
const goBackButton = document.getElementById("go_back_button"); // Nút Quay lại (text)
const breadcrumbPath = document.getElementById("breadcrumb_path");


// ==============================================================================
// ⚙️ KHU VỰC KHỞI TẠO (INITIALIZATION)
// ==============================================================================

/**
 * Tải thư viện GAPI (Google APIs client library).
 */
function gapiLoaded() { 
    gapi.load("client", initializeGapiClient); 
}

/**
 * Khởi tạo GAPI client (Thiết lập API Key và Discovery Doc).
 */
async function initializeGapiClient() {
    try {
        await gapi.client.init({ 
            apiKey: API_KEY, 
            discoveryDocs: [DISCOVERY_DOC] 
        });
        gapiInited = true;
        maybeEnableAuthButton();
    } catch (error) {
        console.error("Lỗi khởi tạo GAPI:", error);
        if(authText) authText.textContent = "Lỗi API: " + error.message;
    }
}

/**
 * Tải thư viện GIS (Google Identity Services) và thiết lập các sự kiện click.
 */
function gisLoaded() {
    // Khởi tạo Client Token để lấy Access Token sau này
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, 
        scope: SCOPES, 
        callback: "" // Callback sẽ được thiết lập lại trong handleAuthClick
    });
    gisInited = true;
    
    // Thiết lập sự kiện cho các nút
    if(authorizeButton) authorizeButton.onclick = handleAuthClick;
    if(signoutButton) signoutButton.onclick = handleSignoutClick;
    
    fileInputFiles.onchange = (e) => { filesToUpload = Array.from(e.target.files); updateUploadInputStatus(); };
    fileInputFolder.onchange = (e) => { filesToUpload = Array.from(e.target.files); updateUploadInputStatus(); };
    
    reloadTargetFoldersButton.onclick = () => { 
        const current = targetFolderHistory[targetFolderHistory.length - 1];
        listTargetFolders(current.id, current.name, false); 
    };
    
    // NÚT QUAY LẠI CỘT 2 (Icon)
    goBackTargetFolderButton.onclick = navigateTargetHistoryBack; 
    
    // Nút Quay lại và Tải lại cho danh sách file (Phần dưới)
    goBackButton.onclick = () => { navigateHistory(folderHistory.length - 2); };
    listButton.onclick = () => { folderHistory = [{ id: 'root', name: 'Drive của tôi' }]; listFiles('root'); };
    
    uploadButton.onclick = handleUploadClick;

    maybeEnableAuthButton();
}

/**
 * Kích hoạt nút Đăng nhập nếu cả GAPI và GIS đã sẵn sàng.
 */
function maybeEnableAuthButton() {
    if (gapiInited && gisInited && authorizeButton) {
        authorizeButton.disabled = false;
        if(authText) authText.textContent = "Sẵn sàng kết nối";
    }
}

// ==============================================================================
// 🔐 KHU VỰC XỬ LÝ ĐĂNG NHẬP & ĐĂNG XUẤT (AUTHENTICATION)
// ==============================================================================

/**
 * Xử lý khi người dùng nhấn nút Đăng nhập (Authorize).
 */
function handleAuthClick() {
    if (!tokenClient) return console.error("Token Client chưa sẵn sàng!");

    tokenClient.callback = async (resp) => {
        if (resp.error) {
            alert("Lỗi đăng nhập: " + resp.error);
            return;
        }
        
        // Cập nhật trạng thái UI
        authorizeButton.style.display = "none";
        signoutButton.style.display = "inline-flex";
        authStatusBadge.className = "status-badge connected";
        authText.textContent = "Đã kết nối";
        
        signoutButton.disabled = false;
        listButton.disabled = false;
        reloadTargetFoldersButton.disabled = false;
        
        // Tải dữ liệu ban đầu
        updateUploadInputStatus();
        await listFiles(); // Tải danh sách file phía dưới
        // Tải thư mục đích ban đầu (Không push lịch sử)
        await listTargetFolders('root', 'Drive của tôi', false); 
    };
    
    // Yêu cầu lấy Access Token
    tokenClient.requestAccessToken({ prompt: "select_account" });
}

/**
 * Xử lý khi người dùng nhấn nút Đăng xuất (Signout).
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        // Thu hồi token (Logout Google)
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken("");
    }
    
    // Cập nhật trạng thái UI về chưa kết nối
    authorizeButton.style.display = "inline-flex";
    signoutButton.style.display = "none";
    authStatusBadge.className = "status-badge disconnected";
    authText.textContent = "Chưa kết nối";
    
    // RESET TOÀN BỘ TRẠNG THÁI & LỊCH SỬ
    targetFolderHistory = [{ id: 'root', name: 'Drive của tôi' }]; 
    folderHistory = [{ id: 'root', name: 'Drive của tôi' }];
    filesToUpload = [];
    filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Vui lòng đăng nhập.</td></tr>';
    targetFolderList.innerHTML = '<div class="placeholder-text">Đăng nhập để xem...</div>';
    targetFolderId = 'root';
    targetFolderName = 'Drive của tôi';
    updateUploadInputStatus();
    updateTargetStatus(); // Cập nhật trạng thái Nơi lưu về mặc định
}


// ==============================================================================
// 📂 KHU VỰC QUẢN LÝ THƯ MỤC ĐÍCH (CỘT 2)
// ==============================================================================

/**
 * Xử lý sự kiện Quay lại (Back) cho cột Nơi lưu (Target Folder).
 */
function navigateTargetHistoryBack() {
    if (targetFolderHistory.length <= 1) return;
    
    // 1. Lấy chỉ mục của thư mục trước đó
    const previousIndex = targetFolderHistory.length - 2;
    
    // 2. Lấy thông tin thư mục sẽ quay về
    const targetFolder = targetFolderHistory[previousIndex];
    
    // 3. Cắt lịch sử (Chỉ giữ lại đến thư mục vừa quay về)
    targetFolderHistory = targetFolderHistory.slice(0, previousIndex + 1);
    
    // 4. Tải lại thư mục trước đó (Truyền false để không push thêm vào lịch sử)
    listTargetFolders(targetFolder.id, targetFolder.name, false); 
}


/**
 * Tải danh sách các thư mục con trong Drive để chọn làm thư mục đích.
 * @param {string} id - ID của thư mục cha.
 * @param {string} name - Tên của thư mục cha.
 * @param {boolean} shouldPushHistory - Có nên thêm vào lịch sử duyệt hay không (true: click vào thư mục mới, false: tải lại hoặc quay lại).
 */
async function listTargetFolders(id, name, shouldPushHistory = true) {
    
    // 1. CẬP NHẬT LỊCH SỬ VÀ TRẠNG THÁI
    let currentFolder;
    if (shouldPushHistory) {
        // Chỉ push nếu ID mới khác ID hiện tại (Tránh push trùng lặp)
        const lastFolderId = targetFolderHistory[targetFolderHistory.length - 1]?.id;
        if (id !== lastFolderId) {
            targetFolderHistory.push({ id: id, name: name });
        }
    }
    
    // Lấy thư mục hiện tại sau khi có thể đã được push (hoặc là thư mục cuối trong mảng)
    currentFolder = targetFolderHistory[targetFolderHistory.length - 1];
    
    targetFolderId = currentFolder.id; 
    targetFolderName = currentFolder.name;
    
    updateTargetStatus();
    updateUploadInputStatus();

    // Cập nhật trạng thái nút quay lại ICON
    goBackTargetFolderButton.disabled = targetFolderHistory.length <= 1;
    
    targetFolderList.innerHTML = '<div class="placeholder-text">Đang tải...</div>';
    
    try {
        const response = await gapi.client.drive.files.list({
            pageSize: 100,
            fields: "files(id,name,mimeType)",
            orderBy: "name",
            // Truy vấn chỉ lấy thư mục con nằm trong thư mục hiện tại và chưa bị xóa (trashed=false)
            q: `mimeType = 'application/vnd.google-apps.folder' and '${targetFolderId}' in parents and trashed = false`,
        });

        const folders = response.result.files || [];
        targetFolderList.innerHTML = "";

        if (folders.length > 0) {
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'folder-item';
                div.innerHTML = `📁 ${folder.name}`;
                
                div.onclick = () => {
                    // Click vào thư mục con -> PUSH lịch sử (shouldPushHistory = true)
                    listTargetFolders(folder.id, folder.name, true);
                };
                targetFolderList.appendChild(div);
            });
        } else {
            targetFolderList.innerHTML += '<div class="placeholder-text">Thư mục trống</div>';
        }
        
        // Cuộn về đầu danh sách
        targetFolderList.scrollTop = 0; 
        
    } catch (err) {
        console.error("Lỗi tải thư mục đích:", err);
        targetFolderList.innerHTML = '<div class="placeholder-text" style="color:red">Lỗi tải danh sách</div>';
    }
}

/**
 * Cập nhật hiển thị tên thư mục đích hiện tại trên UI (Cột 2).
 */
function updateTargetStatus() {
    targetStatus.innerHTML = `Đích: <strong>/${targetFolderName}</strong>`; 
}


// ==============================================================================
// ⬆️ KHU VỰC XỬ LÝ UPLOAD (CỘT 1)
// ==============================================================================

/**
 * Cập nhật trạng thái hiển thị của khu vực chọn file và nút Upload.
 */
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

/**
 * Kiểm tra và tạo các thư mục con theo đường dẫn nếu chưa tồn tại.
 * Dùng cho tính năng upload thư mục (webkitdirectory).
 * @param {string[]} pathSegments - Mảng các tên thư mục con.
 * @param {string} parentId - ID thư mục cha bắt đầu.
 * @returns {string} ID của thư mục cuối cùng trong đường dẫn.
 */
async function createFolderIfNeeded(pathSegments, parentId) {
    let currentParentId = parentId;
    for (const segment of pathSegments) {
        const currentPath = currentParentId + '/' + segment;
        
        // 1. Kiểm tra cache
        if (folderIdCache[currentPath]) {
            currentParentId = folderIdCache[currentPath];
            continue;
        }
        
        // 2. Tìm kiếm trên Drive
        const q = `name = '${segment.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed = false`;
        const res = await gapi.client.drive.files.list({q: q, fields: 'files(id)'});
        
        if (res.result.files.length > 0) {
            // Đã tìm thấy
            currentParentId = res.result.files[0].id;
        } else {
            // Chưa có -> Tạo mới
            const meta = { 
                name: segment, 
                mimeType: 'application/vnd.google-apps.folder', 
                parents: [currentParentId] 
            };
            const createRes = await gapi.client.drive.files.create({ 
                resource: meta, 
                fields: 'id' 
            });
            currentParentId = createRes.result.id;
        }
        
        // Lưu vào cache
        folderIdCache[currentPath] = currentParentId;
    }
    return currentParentId;
}

/**
 * Xử lý chính quá trình Upload nhiều file.
 */
async function handleUploadClick() {
    const token = gapi.client.getToken();
    if (!token) return alert("Vui lòng đăng nhập!");
    
    uploadButton.disabled = true;
    progressDisplay.style.display = 'block';
    
    let success = 0;
    folderIdCache = {}; // Reset cache cho mỗi lần upload mới

    for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const sizeStr = formatBytes(file.size);
        progressText.textContent = `Uploading ${i+1}/${filesToUpload.length}: ${file.name} (${sizeStr})`;
        progressBarInner.style.width = '0%';

        try {
            let parentID = targetFolderId;
            
            // Xử lý tạo thư mục cha nếu là upload thư mục (webkitRelativePath tồn tại)
            if (file.webkitRelativePath) {
                const parts = file.webkitRelativePath.split('/');
                const pathSegments = parts.slice(0, -1); // Lấy tên các thư mục (loại bỏ tên file)
                if (pathSegments.length > 0) {
                    parentID = await createFolderIfNeeded(pathSegments, targetFolderId);
                }
            }

            // Tạo Metadata và FormData cho upload
            const metadata = { 
                name: file.name, 
                mimeType: file.type || 'application/octet-stream', 
                parents: [parentID] 
            };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            // Tiến hành Upload bằng XMLHttpRequest để theo dõi tiến trình
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
                xhr.setRequestHeader('Authorization', 'Bearer ' + token.access_token);
                
                // Theo dõi tiến trình
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        progressBarInner.style.width = pct + '%';
                    }
                };
                
                // Xử lý kết quả
                xhr.onload = () => xhr.status < 300 ? resolve() : reject(xhr.responseText);
                xhr.onerror = () => reject("Network Error");
                
                xhr.send(form);
            });
            success++;
        } catch (err) {
            console.error("Lỗi Upload file:", file.name, err);
        }
    }
    
    uploadStatus.textContent = `Hoàn tất: ${success}/${filesToUpload.length} mục.`;
    filesToUpload = []; // Xóa danh sách file đã chọn
    uploadButton.disabled = false;
    
    // Nếu thư mục đích (Cột 2) trùng với thư mục đang xem (Phần dưới), thì tải lại danh sách
    if (targetFolderId === currentFolderId) listFiles(currentFolderId);
};

// ==============================================================================
// 💾 KHU VỰC QUẢN LÝ DANH SÁCH FILE (PHẦN DƯỚI)
// ==============================================================================

/**
 * Tải và hiển thị danh sách file/folder trong một thư mục cụ thể.
 * @param {string} folderId - ID của thư mục cần hiển thị.
 */
async function listFiles(folderId) {
    currentFolderId = folderId || 'root';
    renderBreadcrumb(); // Cập nhật đường dẫn
    
    listButton.disabled = true;
    filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Đang tải...</td></tr>';

    try {
        const res = await gapi.client.drive.files.list({
            pageSize: 50,
            fields: "files(id,name,mimeType,modifiedTime,iconLink,webViewLink,size)",
            orderBy: "folder,name", // Sắp xếp thư mục lên trên, sau đó theo tên
            q: `'${currentFolderId}' in parents and trashed = false` // Chỉ lấy file/folder trong thư mục cha
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
                        // Thêm thư mục mới vào lịch sử và tải lại danh sách
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
        console.error("Lỗi tải danh sách file:", err);
        filesTbody.innerHTML = '<tr><td colspan="5" class="placeholder-text" style="color:red">Lỗi tải dữ liệu.</td></tr>';
    } finally {
        listButton.disabled = false;
    }
}

/**
 * Hiển thị đường dẫn thư mục hiện tại (Breadcrumb) và thiết lập nút quay lại.
 */
function renderBreadcrumb() {
    const path = folderHistory.map((f, i) => {
        // Thư mục cuối cùng là thư mục hiện tại (in đậm)
        if (i === folderHistory.length - 1) return `<strong>${f.name}</strong>`;
        // Các thư mục trước đó có thể click để quay lại
        return `<span style="cursor:pointer; color:#2563eb" onclick="navigateHistory(${i})">${f.name}</span>`;
    }).join(' / ');
    
    breadcrumbPath.innerHTML = path;
    // Nút Quay lại (Phần dưới) chỉ sáng khi lịch sử có nhiều hơn 1 mục (không phải thư mục gốc)
    goBackButton.disabled = folderHistory.length <= 1;
}

/**
 * Điều hướng lịch sử xem file về một index cụ thể (dùng cho Breadcrumb).
 * @param {number} index - Vị trí trong mảng folderHistory muốn quay về.
 */
function navigateHistory(index) {
    if (index < 0) return;
    // Cắt bớt lịch sử
    folderHistory = folderHistory.slice(0, index + 1);
    // Tải lại thư mục cuối cùng trong lịch sử mới
    listFiles(folderHistory[folderHistory.length -1].id);
}


// ==============================================================================
// 🛠️ KHU VỰC HÀM HỖ TRỢ (HELPER FUNCTIONS)
// ==============================================================================

/**
 * Chuyển đổi dung lượng byte sang định dạng dễ đọc (KB, MB, GB).
 * @param {number} bytes - Dung lượng file tính bằng byte.
 * @returns {string} Chuỗi dung lượng đã định dạng.
 */
function formatBytes(bytes) {
    if (!bytes || bytes == 0) return '0 B';
    const k = 1024; 
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Định dạng chuỗi ngày ISO thành dd/mm/yy hh:mm.
 * @param {string} isoString - Chuỗi ngày tháng theo chuẩn ISO.
 * @returns {string} Chuỗi ngày tháng đã định dạng.
 */
function formatDateCustom(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2); // Chỉ lấy 2 số cuối của năm
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}