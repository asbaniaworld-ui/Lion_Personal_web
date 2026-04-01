// 图片上传功能
const imageInput = document.getElementById('imageInput');
const imageUploadArea = document.getElementById('imageUploadArea');
const previewImage = document.getElementById('previewImage');
const removeImageBtn = document.getElementById('removeImageBtn');
const uploadPlaceholder = imageUploadArea.querySelector('.upload-placeholder');

let selectedImage = null;

// 图片选择事件
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleImageSelect(file);
    }
});

// 拖拽上传
imageUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('dragover');
});

imageUploadArea.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('dragover');
});

imageUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageSelect(file);
        // 更新 input 文件
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;
    }
});

// 处理图片选择
function handleImageSelect(file) {
    // 检查文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
    }

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedImage = e.target.result;
        previewImage.src = selectedImage;
        previewImage.style.display = 'block';
        uploadPlaceholder.style.display = 'none';
        removeImageBtn.style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

// 移除图片
removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedImage = null;
    previewImage.src = '';
    previewImage.style.display = 'none';
    uploadPlaceholder.style.display = 'block';
    removeImageBtn.style.display = 'none';
    imageInput.value = '';
});

// 表单提交
const publishForm = document.getElementById('publishForm');

publishForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // 获取表单数据
    const formData = {
        id: Date.now().toString(), // 生成唯一ID
        itemName: document.getElementById('itemName').value.trim(),
        itemType: document.querySelector('input[name="itemType"]:checked').value,
        description: document.getElementById('description').value.trim(),
        location: document.getElementById('location').value.trim(),
        contact: document.getElementById('contact').value.trim(),
        image: selectedImage || 'assets/placeholder-item.svg',
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD 格式
        timestamp: Date.now()
    };

    // 验证必填项
    if (!formData.itemName || !formData.description || !formData.location || !formData.contact) {
        alert('请填写所有必填项');
        return;
    }

    if (!formData.image || formData.image === 'assets/placeholder-item.svg') {
        if (!confirm('您还没有上传图片，确定要继续发布吗？')) {
            return;
        }
    }

    // 获取现有数据
    let items = JSON.parse(localStorage.getItem('lostFoundItems') || '[]');

    // 添加新数据到数组开头（最新的在前面）
    items.unshift(formData);

    // 保存到 localStorage
    localStorage.setItem('lostFoundItems', JSON.stringify(items));

    // 显示成功提示
    alert('发布成功！即将返回首页...');

    // 跳转到首页
    window.location.href = 'index.html';
});

