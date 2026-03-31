// publish.js
Page({
  data: {
    imagePath: '',
    itemName: '',
    itemType: 'found', // 默认为招领
    description: '',
    location: '',
    contact: '',
    isSubmitting: false
  },

  onLoad() {
    // 页面加载
  },

  // 返回
  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({
          url: '/pages/index/index'
        })
      }
    })
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      // sizeType: ['compressed'], // 注释：开发者工具可能不支持压缩选项
      // sourceType: ['album', 'camera'], // 注释：简化来源选择
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          imagePath: tempFilePath
        })
      },
      fail: (err) => {
        // console.error('选择图片失败:', err) // 注释：开发者工具可能不支持console.error
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 移除图片
  removeImage(e) {
    if (e) {
      e.stopPropagation && e.stopPropagation()
    }
    this.setData({
      imagePath: ''
    })
  },

  // 物品名称输入
  onItemNameInput(e) {
    this.setData({
      itemName: e.detail.value
    })
  },

  // 类型选择
  onTypeChange(e) {
    const type = e.detail.value
    this.setData({
      itemType: type
    })
  },

  // 描述输入
  onDescriptionInput(e) {
    this.setData({
      description: e.detail.value
    })
  },

  // 地点输入
  onLocationInput(e) {
    this.setData({
      location: e.detail.value
    })
  },

  // 联系方式输入
  onContactInput(e) {
    this.setData({
      contact: e.detail.value
    })
  },

  // 表单提交
  onSubmit(e) {
    // 验证必填项
    if (!this.data.itemName.trim()) {
      wx.showToast({
        title: '请输入物品名称',
        icon: 'none'
      })
      return
    }

    if (!this.data.description.trim()) {
      wx.showToast({
        title: '请输入详细描述',
        icon: 'none'
      })
      return
    }

    if (!this.data.location.trim()) {
      wx.showToast({
        title: '请输入地点',
        icon: 'none'
      })
      return
    }

    if (!this.data.contact.trim()) {
      wx.showToast({
        title: '请输入联系方式',
        icon: 'none'
      })
      return
    }

    // 如果没有上传图片，询问用户
    if (!this.data.imagePath) {
      wx.showModal({
        title: '提示',
        content: '您还没有上传图片，确定要继续发布吗？',
        success: (res) => {
          if (res.confirm) {
            this.submitForm()
          }
        }
      })
      return
    }

    this.submitForm()
  },

  // 提交表单
  submitForm() {
    if (this.data.isSubmitting) {
      return
    }

    this.setData({
      isSubmitting: true
    })

    // 直接保存，使用临时图片路径
    this.handleImage()
  },

  // 处理图片（直接使用临时路径）
  handleImage() {
    const imageUrl = this.data.imagePath || ''
    this.saveItem(imageUrl)
  },

  // 保存物品信息
  saveItem(imageUrl) {
    try {
      // 生成唯一ID
      const id = Date.now().toString()
      
      // 获取当前日期（兼容写法，不使用padStart）
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const day = now.getDate()
      const monthStr = month < 10 ? '0' + month : month.toString()
      const dayStr = day < 10 ? '0' + day : day.toString()
      const date = `${year}-${monthStr}-${dayStr}`

      // 构建表单数据
      const formData = {
        id: id,
        itemName: this.data.itemName.trim(),
        itemType: this.data.itemType,
        description: this.data.description.trim(),
        location: this.data.location.trim(),
        contact: this.data.contact.trim(),
        image: imageUrl || '',
        date: date,
        timestamp: Date.now()
      }

      // 获取现有数据
      let items = wx.getStorageSync('lostFoundItems') || []

      // 添加新数据到数组开头（最新的在前面）
      items.unshift(formData)

      // 保存到本地存储
      wx.setStorageSync('lostFoundItems', items)

      // 显示成功提示
      wx.showToast({
        title: '发布成功！',
        icon: 'success',
        duration: 2000
      })

      // 延迟返回首页
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/index/index'
        })
      }, 2000)

    } catch (e) {
      // console.error('保存失败:', e) // 注释：开发者工具可能不支持console.error
      wx.showToast({
        title: '发布失败，请重试',
        icon: 'none'
      })
      this.setData({
        isSubmitting: false
      })
    }
  }
})

