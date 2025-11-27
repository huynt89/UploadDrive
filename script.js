const CLIENT_ID = "957298442128-v4c9rc83fud515f2is92p97lojjoiuja.apps.googleusercontent.com"; // OAuth 2.0 Client ID
const API_KEY = "AIzaSyCxJzJVa5OUlnPDKvyxiUqkIJGQ8-hxZtU"; // API key

const SCOPES = "https://www.googleapis.com/auth/drive";	
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
// -------------------------------------------------------

let tokenClient;
let gapiInited = false;
let gisInited = false;
const folderIdCache = {}; 
let filesToUpload = []; 

let targetFolderId = 'root';
let targetFolderName = 'Drive của tôi';

let targetCurrentFolderId = 'root'; // ID thư mục đang được hiển thị trong cột 2
let targetFolderHistory = [{ id: 'root', name: 'Drive của tôi' }]; // Lịch sử duyệt cho cột 2

let currentFolderId = 'root'; 
let folderHistory = [{ id: 'root', name: 'Drive của tôi' }];

// Các element cho Đăng nhập
const authorizeButton = document.getElementById("authorize_button");
const signoutButton = document.getElementById("signout_button");
const authStatus = document.getElementById("auth_status");

// Các element cho Upload/Chọn File
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

// Các element cho Duyệt File
const listButton = document.getElementById("list_button");
const listStatus = document.getElementById("list_status");
const filesTbody = document.getElementById("files_tbody");

const goBackButton = document.getElementById("go_back_button");
const breadcrumbPath = document.getElementById("breadcrumb_path");

// Xử lý nút Quay lại
goBackButton.onclick = () => {
	navigateHistory(folderHistory.length - 2);
};


// Gọi khi api.js load xong
function gapiLoaded() {
	 gapi.load("client", initializeGapiClient);
}

// Khởi tạo client của Google API
async function initializeGapiClient() {
	 try {
	await gapi.client.init({
		 apiKey: API_KEY,
		 discoveryDocs: [DISCOVERY_DOC],
	});
	gapiInited = true;
	authStatus.textContent = "Thư viện Google API đã sẵn sàng. Đang chờ Google Identity Services...";
	maybeEnableAuthButton();
	 } catch (error) {
	console.error(error);
	authStatus.textContent = "Lỗi khởi tạo Google API: " + error.message;
	authStatus.classList.add("error");
	 }
}

// Gọi khi gsi/client load xong
function gisLoaded() {
	 tokenClient = google.accounts.oauth2.initTokenClient({
	client_id: CLIENT_ID,
	scope: SCOPES,
	callback: "", 
	 });
	 gisInited = true;
	
	// Lắng nghe sự kiện chọn file/folder ngay sau khi GIS load
	fileInputFiles.onchange = (e) => {
		filesToUpload = Array.from(e.target.files);
		updateUploadInputStatus();
	};

	fileInputFolder.onchange = (e) => {
		filesToUpload = Array.from(e.target.files);
		updateUploadInputStatus();
	};
	
	reloadTargetFoldersButton.onclick = () => { listTargetFolders(targetCurrentFolderId); };

	 maybeEnableAuthButton();
}

// Chỉ enable nút login khi cả 2 thư viện đã sẵn sàng
function maybeEnableAuthButton() {
	 if (gapiInited && gisInited) {
	authorizeButton.disabled = false;
	authStatus.textContent = "Sẵn sàng. Bấm \"Đăng nhập Google\" để cấp quyền.";
	 }
}

// Cập nhật trạng thái sau khi chọn file/folder
function updateUploadInputStatus() {
	const count = filesToUpload.length;
	if (count > 0) {
		// Đảm bảo dòng này có targetFolderName
		uploadStatus.textContent = `Sẵn sàng upload ${count} mục. Thư mục đích: ${targetFolderName}`;
		uploadStatus.classList.remove("error", "success");
		uploadButton.disabled = false;
	} else {
		// Đảm bảo dòng này có targetFolderName
		uploadStatus.textContent = `Chưa có tệp nào được chọn. Thư mục đích hiện tại: ${targetFolderName}`;
		uploadStatus.classList.remove("error", "success");
		uploadButton.disabled = true;
	}
	progressDisplay.style.display = 'none';
}

// Khi bấm Đăng nhập
authorizeButton.onclick = () => {
	 authorizeButton.disabled = true;
	 authStatus.textContent = "Đang mở popup đăng nhập...";

	 tokenClient.callback = async (resp) => {
	if (resp.error !== undefined) {
		 console.error(resp);
		 authStatus.textContent = "Lỗi đăng nhập: " + (resp.error || "Unknown error");
		 authStatus.classList.add("error");
		 authorizeButton.disabled = false;
		 return;
	}
	
	authStatus.textContent = "Đã đăng nhập và cấp quyền cho Google Drive.";
	authStatus.classList.remove("error");
	authStatus.classList.add("success");

	authorizeButton.textContent = "✅ Đã đăng nhập";
	signoutButton.disabled = false;
	listButton.disabled = false;
	updateUploadInputStatus(); 
	
	await listFiles(); 
	await listTargetFolders(); 
	 };

	 const token = gapi.client.getToken();
	 if (!token) {
	tokenClient.requestAccessToken({ prompt: "select_account" });
	 } else {
	tokenClient.requestAccessToken({ prompt: "" });
	 }
};

// Đăng xuất
signoutButton.onclick = () => {
	 const token = gapi.client.getToken();
	 if (token !== null) {
	google.accounts.oauth2.revoke(token.access_token);
	gapi.client.setToken("");
	 }

	 authorizeButton.textContent = "🔐 Đăng nhập Google";
	 authorizeButton.disabled = false;
	 signoutButton.disabled = true;
	 uploadButton.disabled = true;
	 listButton.disabled = true;
	 filesToUpload = []; 
	 progressDisplay.style.display = 'none';
	 filesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #9ca3af;">Vui lòng đăng nhập để xem danh sách file.</td></tr>';
	 listStatus.textContent = "Chưa tải danh sách file.";
	
	// Reset điều hướng
	currentFolderId = 'root';
	folderHistory = [{ id: 'root', name: 'Drive của tôi' }];
	renderBreadcrumb();

	targetFolderId = 'root';
	targetFolderName = 'Drive của tôi';
	if (targetStatus) {
		targetStatus.innerHTML = 'Thư mục hiện tại: <strong>/Drive của tôi</strong>';
	}
	if (targetFolderList) {
		targetFolderList.innerHTML = '<div style="text-align: center; color: #9ca3af;">Đang chờ đăng nhập...</div>';
	}
	 authStatus.textContent = "Đã đăng xuất. Cần đăng nhập lại để sử dụng.";
	 authStatus.classList.remove("success");
};
    
// =========================================================
// === HÀM XỬ LÝ UPLOAD ===
// =========================================================

// Hàm kiểm tra và tạo Folder trên Drive nếu cần
async function createFolderIfNeeded(pathSegments, parentId) {
	let currentParentId = parentId;
	let currentPath = '';

	for (const segment of pathSegments) {
		currentPath = (currentPath ? currentPath + '/' : '') + segment;

		if (folderIdCache[currentPath]) {
			currentParentId = folderIdCache[currentPath];
			continue;
		}

		const query = `name = '${segment.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed = false`;
		const searchRes = await gapi.client.drive.files.list({
			q: query,
			fields: 'files(id)',
			pageSize: 1,
		});

		if (searchRes.result.files.length > 0) {
			currentParentId = searchRes.result.files[0].id;
		} else {
			const folderMetadata = {
				'name': segment,
				'mimeType': 'application/vnd.google-apps.folder',
				'parents': [currentParentId],
			};

			const createRes = await gapi.client.drive.files.create({
				resource: folderMetadata,
				fields: 'id',
			});
			currentParentId = createRes.result.id;
		}

		folderIdCache[currentPath] = currentParentId;
	}
	return currentParentId;
}

// Hàm upload file
uploadButton.onclick = async () => {
	uploadStatus.classList.remove("error", "success");
	const token = gapi.client.getToken();
	if (!token) {
		uploadStatus.textContent = "Bạn cần đăng nhập Google trước.";
		uploadStatus.classList.add("error");
		return;
	}

	const files = filesToUpload; 
	if (files.length === 0) {
		uploadStatus.textContent = "Vui lòng chọn file hoặc thư mục để upload.";
		uploadStatus.classList.add("error");
		return;
	}

	uploadButton.disabled = true;
	listButton.disabled = true;
	// VÔ HIỆU HÓA NÚT TẢI LẠI THƯ MỤC ĐÍCH
	reloadTargetFoldersButton.disabled = true;
	
	progressDisplay.style.display = 'block';
	
	let successCount = 0;
	let errorCount = 0;
	
	uploadStatus.textContent = `Đang chuẩn bị upload ${files.length} mục vào thư mục: ${targetFolderName}...`;

	try {
		Object.keys(folderIdCache).forEach(k => delete folderIdCache[k]); 

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const totalSize = file.size;
			const formattedTotalSize = formatBytes(totalSize);

			progressText.textContent = `Đang upload ${i + 1}/${files.length}: ${file.name}... (0 B / ${formattedTotalSize})`;
			progressBarInner.style.width = '0%';
			
			//SỬA: Dùng targetFolderId làm thư mục gốc cho upload
			let parentFolderId = targetFolderId; 

			if (file.webkitRelativePath) {
				const parts = file.webkitRelativePath.split('/');
				const pathSegments = parts.slice(0, -1); 

				if (pathSegments.length > 0) {
					// SỬA: DÙNG targetFolderId LÀM PARENT CHO FOLDER CON
					parentFolderId = await createFolderIfNeeded(pathSegments, targetFolderId);
				}
			}
			// KẾT THÚC SỬA

			// 2. Upload file với tiến trình hiển thị
			const metadata = {
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				parents: [parentFolderId], 
			};
			
			const form = new FormData();
			form.append(
				"metadata",
				new Blob([JSON.stringify(metadata)], { type: "application/json" })
			);
			form.append("file", file);

			const xhr = new XMLHttpRequest();
			
			// Hàm cập nhật tiến trình
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					const uploaded = event.loaded;
					const percent = Math.round((uploaded / totalSize) * 100);
					progressText.textContent = `Đang upload ${i + 1}/${files.length}: ${file.name}... (${formatBytes(uploaded)} / ${formattedTotalSize})`;
					progressBarInner.style.width = `${percent}%`;
				}
			};

			xhr.open(
				"POST",
				"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,iconLink,size,mimeType"
			);

			xhr.setRequestHeader("Authorization", "Bearer " + token.access_token);

			await new Promise((resolve, reject) => {
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						successCount++;
						resolve();
					} else {
						errorCount++;
						console.error("Lỗi upload file:", file.name, xhr.responseText);
						reject(new Error(`Lỗi upload: ${xhr.status}`));
					}
				};
				xhr.onerror = () => {
					errorCount++;
					console.error("Lỗi mạng khi upload:", file.name);
					reject(new Error("Lỗi mạng/kết nối"));
				};
				xhr.send(form);
			});
		}
		
		// Cập nhật trạng thái cuối cùng
		const totalUploaded = successCount + errorCount;
		progressDisplay.style.display = 'none';
		if (errorCount === 0) {
			uploadStatus.textContent = `✅ Upload thành công ${successCount}/${totalUploaded} mục vào thư mục ${targetFolderName}!`;
			uploadStatus.classList.add("success");
			uploadStatus.classList.remove("error");
		} else {
			uploadStatus.textContent = `⚠️ Hoàn tất: Upload thành công ${successCount}/${totalUploaded} mục, thất bại ${errorCount} mục. Kiểm tra console để biết chi tiết.`;
			uploadStatus.classList.add("error");
			uploadStatus.classList.remove("success");
		}

		// Reset filesToUpload và cập nhật trạng thái
		filesToUpload = []; 
		updateUploadInputStatus(); 

		// Nếu upload vào thư mục hiện tại, tải lại danh sách file
		if (targetFolderId === currentFolderId) {
			await listFiles(currentFolderId);
		}
		
	} catch (error) {
		console.error(error);
		progressDisplay.style.display = 'none';
		uploadStatus.textContent = "Lỗi upload tổng quát: " + error.message;
		uploadStatus.classList.add("error");
		uploadStatus.classList.remove("success");
	} finally {
		uploadButton.disabled = false;
		listButton.disabled = false;
		// BẬT LẠI NÚT TẢI LẠI THƯ MỤC ĐÍCH
		reloadTargetFoldersButton.disabled = false;
	}
};

// =========================================================
// === HÀM LIỆT KÊ THƯ MỤC ĐÍCH (ĐÃ SỬA ĐỂ HỖ TRỢ DUYỆT) ===
// =========================================================

async function listTargetFolders(parentFolderId = 'root', parentFolderName = 'Drive của tôi') {
	targetCurrentFolderId = parentFolderId;
	targetFolderList.innerHTML = '<div style="text-align: center; color: #2563eb;">Đang tải danh sách thư mục...</div>';
	reloadTargetFoldersButton.disabled = true;

	// Cập nhật lịch sử duyệt và hiển thị đường dẫn + nút chọn
	updateTargetHistory(parentFolderId, parentFolderName);
	renderTargetBreadcrumb(); 

	try {
		const response = await gapi.client.drive.files.list({
			pageSize: 50, 
			fields: "files(id,name,mimeType)",
			orderBy: "name", 
			// DÙNG targetCurrentFolderId LÀM PARENT ID ĐỂ DUYỆT
			q: `mimeType = 'application/vnd.google-apps.folder' and '${targetCurrentFolderId}' in parents and trashed = false`, 
		});

		const folders = response.result.files || [];
		
		// Xóa nội dung danh sách cũ
		targetFolderList.innerHTML = '';
		
		if (folders.length > 0) {
			folders.forEach(renderTargetFolderItem);
		} else {
			targetFolderList.innerHTML = '<div style="text-align: center; color: #4b5563; margin-top: 10px;">Thư mục này trống.</div>';
		}
		
	} catch (error) {
		console.error("Lỗi tải danh sách thư mục đích:", error);
		targetFolderList.innerHTML = '<div style="text-align: center; color: #dc2626;">Lỗi tải danh sách. Vui lòng thử lại.</div>';
	} finally {
		reloadTargetFoldersButton.disabled = false;
	}
}

// Hàm render từng mục folder và xử lý click: CHUYỂN VÀO THƯ MỤC CON
function renderTargetFolderItem(folder) {
	const div = document.createElement('div');
	div.className = 'folder-item';
	
	if (folder.id === targetFolderId) {
		div.classList.add('active-target');
	}
	
	div.setAttribute('data-id', folder.id);
	div.setAttribute('data-name', folder.name);

	div.innerHTML = `<span role="img" aria-label="thư mục">📁</span> ${folder.name}`;
	
	// LOGIC MỚI: BẤM VÀO SẼ CHUYỂN VÀO THƯ MỤC CON
	div.onclick = () => {
		// Gọi hàm listTargetFolders để duyệt thư mục con
		targetFolderId = folder.id;
		targetFolderName = folder.name;
		updateUploadInputStatus(); // Cập nhật trạng thái upload
		
		listTargetFolders(folder.id, folder.name);
	};

	targetFolderList.appendChild(div);
}

// Hàm cập nhật lịch sử duyệt thư mục đích
function updateTargetHistory(newFolderId) {
    const newFolder = { id: newFolderId, name: 'Thư mục con' }; // Tên tạm
    
    // 1. Tìm thông tin folder trong folderHistory của cột Duyệt Drive (nếu có)
    const folderInfo = folderHistory.find(item => item.id === newFolderId);
    if (newFolderId === 'root') {
        newFolder.name = 'Drive của tôi';
    } else if (folderInfo) {
        newFolder.name = folderInfo.name;
    } 
    
    // 2. Cập nhật targetFolderHistory
    const existingIndex = targetFolderHistory.findIndex(item => item.id === newFolderId);

    if (existingIndex !== -1) {
        // Quay lại
        targetFolderHistory = targetFolderHistory.slice(0, existingIndex + 1);
    } else {
        // Đi sâu vào
        targetFolderHistory.push(newFolder);
    }
}

// Hàm hiển thị đường dẫn và nút chọn cho cột Thư mục Đích
function renderTargetBreadcrumb() {
	const currentFolder = targetFolderHistory[targetFolderHistory.length - 1];
    
    let pathHtml = '';
	
	const pathArray = targetFolderHistory.map((item, index) => {
		// Tạo link để click quay lại
		if (index < targetFolderHistory.length - 1) {
			return `<a href="javascript:void(0)" class="link" onclick="listTargetFolders('${item.id}')">${item.name}</a>`;
		}
		// Thư mục hiện tại (không link)
		return `<strong>${item.name}</strong>`;
	}).join(' / ');
	
	// Hiển thị đường dẫn
	pathHtml = `<div style="font-size: 13px; color: #4b5563; margin-bottom: 5px;">${pathArray}</div>`;

    // Hiển thị nút "Chọn thư mục này"
    const selectButtonHtml = `
        <button id="select_target_folder_btn" class="btn btn-primary" style="padding: 6px 10px; font-size: 14px; margin-top: 5px; width: 100%;">
            ✅ Chọn thư mục: ${currentFolder.name}
        </button>
    `;

    // Nút Quay lại (nếu không phải thư mục gốc)
    const goBackBtnHtml = (targetFolderHistory.length > 1) ? `
        <button id="target_go_back_btn" class="btn btn-outline" style="padding: 6px 10px; font-size: 14px; margin-top: 5px; margin-right: 5px;">
            ⬅️ Quay lại
        </button>
    ` : '';

    // Cập nhật thẻ targetStatus
    targetStatus.innerHTML = pathHtml + 
        `<div class="buttons-row" style="margin: 0; padding: 0;">` +
        goBackBtnHtml + 
        selectButtonHtml +
        `</div>`;
    
    // Gắn sự kiện cho nút Quay lại
    if (targetFolderHistory.length > 1) {
        document.getElementById('target_go_back_btn').onclick = () => {
            const previousFolder = targetFolderHistory[targetFolderHistory.length - 2];
            listTargetFolders(previousFolder.id);
        };
    }

    // Gắn sự kiện cho nút Chọn
    document.getElementById('select_target_folder_btn').onclick = () => {
        // Cập nhật biến thư mục đích chính
        targetFolderId = currentFolder.id;
        targetFolderName = currentFolder.name;
        
        // Cập nhật lại trạng thái upload
        updateUploadInputStatus();
        
        // Cập nhật visual cho nút chọn (thông báo chọn thành công)
        const btn = document.getElementById('select_target_folder_btn');
        const originalText = btn.textContent;
        btn.textContent = `✅ Đã chọn làm đích: ${targetFolderName}`;
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1500);
    };

    // Đảm bảo trạng thái upload luôn phản ánh đích cuối cùng
    updateUploadInputStatus();
}

// =========================================================
// === HÀM LIỆT KÊ FILE VÀ ĐIỀU HƯỚNG ===
// =========================================================

// Hàm điều hướng lịch sử
function navigateHistory(index) {
	if (index < 0 || index >= folderHistory.length - 1) return;
	
	const targetFolder = folderHistory[index];
	folderHistory = folderHistory.slice(0, index + 1);
	
	listFiles(targetFolder.id);
}

// Hàm render breadcrumb
function renderBreadcrumb() {
	let path = 'Đường dẫn hiện tại: ';
	
	path += folderHistory.map((item, index) => {
		if (index < folderHistory.length - 1) {
			return `<a href="javascript:void(0)" class="link" onclick="navigateHistory(${index})">${item.name}</a>`;
		}
		return `<strong>${item.name}</strong>`;
	}).join(' / ');
	
	breadcrumbPath.innerHTML = path;
	
	// Cập nhật trạng thái nút Quay lại
	if (folderHistory.length > 1) {
		goBackButton.disabled = false;
		goBackButton.style.display = 'inline-flex';
	} else {
		goBackButton.disabled = true;
		goBackButton.style.display = 'none';
	}
}


// List files khi bấm nút
listButton.onclick = () => {
	// Thiết lập lại thư mục gốc và tải lại
	folderHistory = [{ id: 'root', name: 'Drive của tôi' }];
	listFiles('root');
};

// Hàm liệt kê file (nhận folderId làm tham số)
async function listFiles(folderId = 'root') {
	 listStatus.classList.remove("error", "success");
	 const token = gapi.client.getToken();
	 if (!token) {
	listStatus.textContent = "Bạn cần đăng nhập Google trước.";
	listStatus.classList.add("error");
	return;
	 }
	
	 // Cập nhật ID thư mục hiện tại
	currentFolderId = folderId;
	renderBreadcrumb(); // Cập nhật đường dẫn

	 listButton.disabled = true;
	 listStatus.textContent = "Đang tải danh sách file...";
	 filesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #9ca3af;">Đang tải...</td></tr>';

	 try {
	const response = await gapi.client.drive.files.list({
		 pageSize: 50, // Tăng giới hạn hiển thị
		 fields: "files(id,name,mimeType,modifiedTime,iconLink,webViewLink,size)",
		 // Ưu tiên hiển thị Folder trước, sau đó sắp xếp theo tên
		 orderBy: "folder,name",
		 // Truy vấn: chỉ lấy các mục có thư mục cha là currentFolderId VÀ KHÔNG BỊ XOÁ
		 q: `'${currentFolderId}' in parents and trashed = false`, 
	});

	const files = response.result.files || [];
	filesTbody.innerHTML = "";

	if (files.length === 0) {
		 listStatus.textContent = "Không tìm thấy file/thư mục nào trong thư mục này.";
		 listStatus.classList.add("success");
		 filesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #9ca3af;">Thư mục này trống.</td></tr>';
		 return;
	}

	for (const file of files) {
		 const tr = document.createElement("tr");

		 const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
		 
		 // Gắn sự kiện click vào hàng nếu đó là thư mục
		 if (isFolder) {
		tr.classList.add('folder-row');
		tr.onclick = () => {
			// Thêm thư mục vào lịch sử và tải danh sách file mới
			folderHistory.push({ id: file.id, name: file.name });
			listFiles(file.id); 
		};
		 }

		 const nameTd = document.createElement("td");
		 nameTd.textContent = file.name || "(Không tên)";
	  // Thêm data-label cho responsive
	  nameTd.setAttribute('data-label', 'Tên file');

		 const typeTd = document.createElement("td");
		 const tag = document.createElement("span");
		 tag.className = "tag";
		 tag.textContent = isFolder ? "📁 Folder" : (file.mimeType || "Unknown");	
		 typeTd.appendChild(tag);
	  typeTd.setAttribute('data-label', 'Loại');

		 const modifiedTd = document.createElement("td");
		 modifiedTd.textContent = file.modifiedTime
		? new Date(file.modifiedTime).toLocaleString()
		: "";
	  modifiedTd.setAttribute('data-label', 'Cập nhật');

		 const sizeTd = document.createElement("td");
		 sizeTd.textContent = isFolder	
		? "-" 
		: (file.size ? formatBytes(parseInt(file.size, 10)) : "-");
	  sizeTd.setAttribute('data-label', 'Kích thước');

		 const linkTd = document.createElement("td");
	  linkTd.setAttribute('data-label', 'Xem');
		 if (file.webViewLink) {
		const a = document.createElement("a");
		a.href = file.webViewLink;
		a.target = "_blank";
		a.rel = "noopener noreferrer";
		a.className = "link";
		a.textContent = isFolder ? "Mở Folder" : "Xem File";
		// Nếu là folder, không cho phép click vào link ở cột này (vì đã click vào row)
		if (isFolder) {
			a.style.opacity = '0.7';
			a.onclick = (e) => { e.stopPropagation(); }; // Ngăn chặn sự kiện click lan truyền lên row
		}
		linkTd.appendChild(a);
		 } else {
		linkTd.textContent = "-";
		 }

		 tr.appendChild(nameTd);
		 tr.appendChild(typeTd);
		 tr.appendChild(modifiedTd);
		 tr.appendChild(sizeTd);
		 tr.appendChild(linkTd);

		 filesTbody.appendChild(tr);
	}

	listStatus.textContent = `Đã tải ${files.length} mục.`;
	listStatus.classList.add("success");
	 } catch (error) {
	console.error(error);
	listStatus.textContent = "Lỗi tải danh sách file: " + error.message;
	listStatus.classList.add("error");
	 } finally {
	listButton.disabled = false;
	 }
}

// Helper format size
function formatBytes(bytes) {
	 if (bytes === 0) return "0 B";
	 const k = 1024;
	 const sizes = ["B", "KB", "MB", "GB", "TB"];
	 const i = Math.floor(Math.log(bytes) / Math.log(k));
	 return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}