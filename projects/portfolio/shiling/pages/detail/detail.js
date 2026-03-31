// detail.js
Page({
  data: {
    item: {},
    itemId: '',
    hasPhone: false
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        this.goBack()
      }, 1500)
      return
    }

    this.setData({
      itemId: id
    })
    this.loadItemDetail(id)
  },


  // 加载物品详情
  loadItemDetail(id) {
    try {
      const items = wx.getStorageSync('lostFoundItems') || []
      const item = items.find(i => i.id === id)

      if (!item) {
        wx.showModal({
          title: '提示',
          content: '未找到该物品信息',
          showCancel: false,
          success: () => {
            this.goBack()
          }
        })
        return
      }

      // 判断是否有手机号
      const hasPhone = /^1[3-9]\d{9}$/.test(item.contact)

      this.setData({
        item: item,
        hasPhone: hasPhone
      })

      // 设置页面标题
      wx.setNavigationBarTitle({
        title: item.itemName + ' - 详情页'
      })
    } catch (e) {
      console.error('加载详情失败:', e)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 返回首页
  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        // 如果无法返回，则跳转到首页
        wx.reLaunch({
          url: '/pages/index/index'
        })
      }
    })
  },

  // 联系功能
  onContact() {
    const phone = this.data.item.contact
    if (/^1[3-9]\d{9}$/.test(phone)) {
      // 是手机号，调用拨打电话
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: (err) => {
          wx.showToast({
            title: '拨打失败',
            icon: 'none'
          })
        }
      })
    } else {
      // 显示联系方式
      wx.showModal({
        title: '联系方式',
        content: this.data.item.contact,
        showCancel: false
      })
    }
  }
})

