// 动态加载详情页内容
window.addEventListener('DOMContentLoaded', () => {
    // 从 URL 获取 ID 参数
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');

    // 如果没有 ID 参数，说明是静态页面，不处理
    if (!itemId) {
        return;
    }

    // 从 localStorage 获取数据
    const items = JSON.parse(localStorage.getItem('lostFoundItems') || '[]');
    const item = items.find(i => i.id === itemId);

    // 如果找不到对应的物品，显示提示
    if (!item) {
        document.querySelector('.detail-container').innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <h2>未找到该物品信息</h2>
                <p style="color: #666; margin: 1rem 0;">该物品可能已被删除或不存在。</p>
                <a href="index.html" class="back-button">返回首页</a>
            </div>
        `;
        return;
    }

    // 更新页面内容
    const typeText = item.itemType === 'found' ? '招领' : '失物';
    const badgeClass = item.itemType === 'found' ? 'found' : 'lost';
    const emoji = item.itemType === 'found' ? '📦' : '🔍';

    // 更新标题
    document.title = `${item.itemName} - 详情页`;

    // 更新图片
    const imageSection = document.querySelector('.item-image-section img');
    if (imageSection) {
        imageSection.src = item.image;
        imageSection.alt = item.itemName;
        imageSection.onerror = function() {
            this.src = "assets/placeholder-item.svg";
        };
    }

    // 更新标题
    const titleElement = document.querySelector('.item-title');
    if (titleElement) {
        titleElement.textContent = item.itemName;
    }

    // 更新类型和日期
    const metaElement = document.querySelector('.item-meta');
    if (metaElement) {
        metaElement.innerHTML = `
            <span class="type-badge ${badgeClass}">${typeText}</span>
            <span class="item-date">发布时间：${item.date}</span>
        `;
    }

    // 更新地点
    const locationElement = document.querySelector('.info-block:nth-child(3) .info-content');
    if (locationElement) {
        locationElement.innerHTML = `📍 ${item.location}`;
    }

    // 更新描述
    const descriptionElement = document.querySelector('.item-description');
    if (descriptionElement) {
        descriptionElement.innerHTML = `<p>${item.description.replace(/\n/g, '</p><p>')}</p>`;
    }

    // 更新联系方式
    const contactSection = document.querySelector('.contact-section');
    if (contactSection) {
        // 检查联系方式格式（电话或微信/QQ）
        let phone = '';
        let wechat = '';
        
        if (item.contact.match(/^1[3-9]\d{9}$/)) {
            // 如果是手机号格式
            phone = item.contact;
        } else if (item.contact.includes('@') || item.contact.includes('wx') || item.contact.includes('qq')) {
            // 如果是微信/QQ
            wechat = item.contact;
        } else {
            // 默认作为联系方式
            wechat = item.contact;
        }

        contactSection.innerHTML = `
            <div class="info-label">联系方式</div>
            ${phone ? `
                <div class="contact-info">
                    <span class="contact-label">联系电话：</span>
                    <span class="contact-value">${phone}</span>
                </div>
            ` : ''}
            ${wechat ? `
                <div class="contact-info" style="margin-top: 0.75rem;">
                    <span class="contact-label">微信/QQ：</span>
                    <span class="contact-value">${wechat}</span>
                </div>
            ` : ''}
        `;
    }

    // 更新联系按钮
    const contactBtn = document.querySelector('.btn-primary');
    if (contactBtn && item.contact.match(/^1[3-9]\d{9}$/)) {
        contactBtn.href = `tel:${item.contact}`;
        contactBtn.textContent = '联系Ta';
    } else if (contactBtn) {
        contactBtn.href = '#';
        contactBtn.onclick = (e) => {
            e.preventDefault();
            alert(`联系方式：${item.contact}`);
        };
    }
});

