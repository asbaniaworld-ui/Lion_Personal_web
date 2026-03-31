// app.js
const imageUtils = require('./utils/imageUtils')

App({
  onLaunch(options) {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 初始化数据
    this.initData()
  },
  
  initData() {
    // 初始化失物招领数据，如果不存在则创建示例数据
    let items = wx.getStorageSync('lostFoundItems')
    
    // 数据迁移：更新旧数据中的占位图URL
    if (items && items.length > 0) {
      let needUpdate = false
      items = items.map(item => {
        if (item.image && item.image.includes('via.placeholder.com')) {
          needUpdate = true
          // 根据emoji提取占位图
          const emojiMatch = item.image.match(/text=([^&]+)/)
          if (emojiMatch) {
            try {
              const emoji = decodeURIComponent(emojiMatch[1])
              item.image = imageUtils.getPlaceholderImage(emoji)
            } catch (e) {
              item.image = imageUtils.getPlaceholderImage('📦')
            }
          } else {
            item.image = imageUtils.getPlaceholderImage('📦')
          }
        }
        return item
      })
      
      if (needUpdate) {
        wx.setStorageSync('lostFoundItems', items)
      }
    }
    
    if (!items || items.length === 0) {
      const defaultItems = [
        {
          id: '1',
          itemName: 'iPhone 13',
          itemType: 'found',
          description: '黑色iPhone 13，在图书馆二楼捡到，有蓝色手机壳',
          location: '图书馆二楼',
          contact: '138****5678',
          image: imageUtils.getPlaceholderImage('📱'),
          date: '2024-01-15'
        },
        {
          id: '2',
          itemName: '黑色双肩包',
          itemType: 'found',
          description: '耐克黑色双肩包，在食堂门口发现，内有笔记本和文具',
          location: '食堂门口',
          contact: '139****1234',
          image: imageUtils.getPlaceholderImage('🎒'),
          date: '2024-01-14'
        },
        {
          id: '3',
          itemName: '保温杯',
          itemType: 'found',
          description: '白色保温杯，星巴克品牌，在操场看台发现',
          location: '操场看台',
          contact: 'wxid_2024abc',
          image: imageUtils.getPlaceholderImage('💧'),
          date: '2024-01-13'
        },
        {
          id: '4',
          itemName: '钥匙串',
          itemType: 'found',
          description: '一串钥匙，包括宿舍钥匙和自行车钥匙，在宿舍楼下发现',
          location: '宿舍楼下',
          contact: '138****8888',
          image: imageUtils.getPlaceholderImage('🔑'),
          date: '2024-01-12'
        },
        {
          id: '5',
          itemName: '高等数学教材',
          itemType: 'lost',
          description: '《高等数学》上册，在教室A101发现，书内有名贴',
          location: '教室A101',
          contact: 'wxid_student123',
          image: imageUtils.getPlaceholderImage('📚'),
          date: '2024-01-11'
        },
        {
          id: '6',
          itemName: 'AirPods Pro',
          itemType: 'found',
          description: '白色AirPods Pro，在体育馆更衣室发现，充电盒完整',
          location: '体育馆更衣室',
          contact: '139****9999',
          image: imageUtils.getPlaceholderImage('🎧'),
          date: '2024-01-10'
        }
      ]
      wx.setStorageSync('lostFoundItems', defaultItems)
    }
  },
  
  globalData: {
    userInfo: null
  }
})

