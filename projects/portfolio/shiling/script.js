// 等待 DOM 加载完成
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const itemsContainer = document.getElementById('itemsContainer');
    const filterButtons = document.querySelectorAll('.filter-btn');

    // 如果元素存在，才绑定事件
    if (searchBtn && searchInput) {
        // 搜索按钮点击事件
        searchBtn.addEventListener('click', performSearch);

        // 搜索输入框回车事件
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }

    if (filterButtons.length > 0 && searchInput) {
        // 筛选功能
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // 更新按钮状态
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 获取筛选类型
                const filterType = btn.getAttribute('data-filter');
                const itemCards = itemsContainer.querySelectorAll('.item-card-link');
                
                // 清空搜索框
                searchInput.value = '';
                
                // 应用筛选
                itemCards.forEach(card => {
                    if (filterType === 'all') {
                        card.classList.remove('hidden');
                    } else {
                        const cardType = card.getAttribute('data-type');
                        if (cardType === filterType) {
                            card.classList.remove('hidden');
                        } else {
                            card.classList.add('hidden');
                        }
                    }
                });
            });
        });
    }
});

// 执行搜索
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const itemsContainer = document.getElementById('itemsContainer');
    
    if (!searchInput || !itemsContainer) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    const itemCards = itemsContainer.querySelectorAll('.item-card-link');
    
    itemCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if (text.includes(searchTerm) || searchTerm === '') {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// 动态加载发布的内容
function loadPublishedItems() {
    const items = JSON.parse(localStorage.getItem('lostFoundItems') || '[]');
    const itemsContainer = document.getElementById('itemsContainer');

    if (items.length === 0) {
        return;
    }

    // 为每个发布的内容创建卡片
    items.forEach(item => {
        const cardLink = document.createElement('a');
        cardLink.href = `detail.html?id=${item.id}`;
        cardLink.className = 'item-card-link';
        cardLink.setAttribute('data-type', item.itemType);

        const typeText = item.itemType === 'found' ? '招领' : '失物';
        const badgeClass = item.itemType === 'found' ? 'found' : 'lost';
        const emoji = item.itemType === 'found' ? '📦' : '🔍';

        cardLink.innerHTML = `
            <div class="item-card">
                <div class="item-image">
                    <img src="${item.image}" alt="${item.itemName}" onerror="this.src='https://via.placeholder.com/120x120/4A90E2/FFFFFF?text=${emoji}'">
                </div>
                <div class="item-info">
                    <div class="item-header">
                        <h3>${item.itemName}</h3>
                        <span class="type-badge ${badgeClass}">${typeText}</span>
                    </div>
                    <p>${item.description}</p>
                    <div class="item-footer">
                        <span class="location">📍 ${item.location}</span>
                        <span class="date">${item.date}</span>
                    </div>
                </div>
            </div>
        `;

        // 插入到容器开头（最新发布在前面）
        itemsContainer.insertBefore(cardLink, itemsContainer.firstChild);
    }
}

// 页面加载时加载发布的内容
window.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('itemsContainer');
    if (itemsContainer) {
        loadPublishedItems();
        // 如果有搜索条件，重新执行搜索
        setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput && searchInput.value.trim() !== '') {
                performSearch();
            }
        }, 100);
    }
});

// 底部导航栏功能（在 DOM 加载后执行）
document.addEventListener('DOMContentLoaded', () => {
    const publishBtn = document.getElementById('publishBtn');
    const profileBtn = document.getElementById('profileBtn');
    const navButtons = document.querySelectorAll('.nav-btn');

    // 个人主页按钮点击事件
    if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('个人主页功能待开发，您可以在这里查看个人发布的信息！');
            // 这里可以跳转到个人主页
        });
    }

    // 导航按钮激活状态管理
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有按钮的active状态
            navButtons.forEach(b => b.classList.remove('active'));
            // 添加当前按钮的active状态
            btn.classList.add('active');
        });
    });
});

