// index.js
Page({
  data: {
    searchKeyword: '',
    currentFilter: 'all',
    allItems: [],
    displayItems: []
  },

  onLoad() {
    this.loadItems()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadItems()
  },

  // 加载物品列表
  loadItems() {
    try {
      const items = wx.getStorageSync('lostFoundItems') || []
      this.setData({
        allItems: items,
        displayItems: items
      })
      this.applyFilter()
    } catch (e) {
      console.error('加载数据失败:', e)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.performSearch(e.detail.value)
  },

  // 执行搜索
  onSearch() {
    this.performSearch(this.data.searchKeyword)
  },

  performSearch(keyword) {
    const keywordLower = keyword.toLowerCase().trim()
    let filtered = this.data.allItems

    // 先应用筛选
    if (this.data.currentFilter !== 'all') {
      filtered = filtered.filter(item => item.itemType === this.data.currentFilter)
    }

    // 再应用搜索
    if (keywordLower) {
      filtered = filtered.filter(item => {
        const name = item.itemName.toLowerCase()
        const desc = item.description.toLowerCase()
        const location = item.location.toLowerCase()
        return name.includes(keywordLower) || 
               desc.includes(keywordLower) || 
               location.includes(keywordLower)
      })
    }

    this.setData({
      displayItems: filtered
    })
  },

  // 筛选功能
  onFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter,
      searchKeyword: '' // 清空搜索框
    })
    this.applyFilter()
  },

  applyFilter() {
    let filtered = this.data.allItems

    if (this.data.currentFilter !== 'all') {
      filtered = filtered.filter(item => item.itemType === this.data.currentFilter)
    }

    // 如果有搜索关键词，继续应用搜索
    if (this.data.searchKeyword) {
      const keywordLower = this.data.searchKeyword.toLowerCase().trim()
      filtered = filtered.filter(item => {
        const name = item.itemName.toLowerCase()
        const desc = item.description.toLowerCase()
        const location = item.location.toLowerCase()
        return name.includes(keywordLower) || 
               desc.includes(keywordLower) || 
               location.includes(keywordLower)
      })
    }

    this.setData({
      displayItems: filtered
    })
  },

  // 跳转到详情页
  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 底部导航栏功能
  navigateToIndex() {
    // 已经在首页，无需跳转
    wx.showToast({
      title: '当前在首页',
      icon: 'none',
      duration: 1000
    })
  },

  navigateToPublish() {
    // 跳转到发布页面
    wx.navigateTo({
      url: '/pages/publish/publish',
      fail: () => {
        wx.showToast({
          title: '发布功能开发中',
          icon: 'none'
        })
      }
    })
  },

  navigateToProfile() {
    // 跳转到个人主页
    wx.showToast({
      title: '个人主页功能开发中',
      icon: 'none'
    })
    // 如果后续有个人主页，可以使用以下代码跳转
    // wx.navigateTo({
    //   url: '/pages/profile/profile',
    //   fail: () => {
    //     wx.showToast({
    //       title: '个人主页功能开发中',
    //       icon: 'none'
    //     })
    //   }
    // })
  }
})

