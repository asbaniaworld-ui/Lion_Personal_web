# 校园失物招领平台

## 项目说明

这是一个校园失物招领Web应用，包含完整的失物招领功能，可以用于微信小程序开发。

## 文件结构

```
wechat-miniprogram/
├── index.html              # 首页
├── publish.html            # 发布页
├── detail.html             # 详情页
├── styles.css              # 首页样式
├── publish-styles.css      # 发布页样式
├── detail-styles.css      # 详情页样式
├── script.js              # 首页脚本
├── publish.js             # 发布页脚本
├── detail-dynamic.js      # 详情页动态加载脚本
└── README.md              # 说明文档
```

## 功能特点

### 首页 (index.html)
- ✅ 左图右信息布局（适配移动端）
- ✅ 搜索功能
- ✅ 筛选功能（全部/失物/招领）
- ✅ 动态加载发布的内容
- ✅ 底部导航栏（首页/发布/个人主页）

### 发布页 (publish.html)
- ✅ 图片上传（支持点击和拖拽）
- ✅ 图片预览
- ✅ 物品类型选择（失物/招领）
- ✅ 表单验证
- ✅ 数据保存到 localStorage

### 详情页 (detail.html)
- ✅ 动态加载内容
- ✅ 完整的物品信息展示
- ✅ 联系方式显示
- ✅ 联系按钮

## 使用方法

### 本地调试
1. 直接用浏览器打开 `index.html` 即可运行
2. 所有数据存储在浏览器的 localStorage 中

### 微信小程序开发
1. 打开微信开发者工具
2. 创建新项目，选择"小程序"
3. 将本文件夹中的文件复制到小程序项目中
4. 修改文件后缀：
   - `.html` → `.wxml`
   - `.css` → `.wxss`
   - `.js` → `.js`（保持不变）
5. 在小程序的 `app.json` 中配置页面路由：
```json
{
  "pages": [
    "pages/index/index",
    "pages/publish/publish",
    "pages/detail/detail"
  ],
  "window": {
    "navigationBarTitleText": "校园失物招领"
  },
  "tabBar": {
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "首页",
        "iconPath": "images/home.png",
        "selectedIconPath": "images/home-active.png"
      },
      {
        "pagePath": "pages/publish/publish",
        "text": "发布",
        "iconPath": "images/add.png",
        "selectedIconPath": "images/add-active.png"
      }
    ]
  }
}
```

## 注意事项

1. **数据存储**：当前使用 localStorage 存储数据，在小程序中需要使用 `wx.setStorageSync()` 和 `wx.getStorageSync()` 替代
2. **图片上传**：小程序中使用 `wx.chooseImage()` 选择图片，`wx.uploadFile()` 上传
3. **路由跳转**：将 `href="xxx.html"` 改为 `navigator url="/pages/xxx/xxx"`
4. **API 调用**：小程序中使用 `wx.request()` 替代 `fetch()` 或 `XMLHttpRequest`

## 技术栈

- HTML5
- CSS3
- JavaScript (ES6+)
- localStorage (数据存储)

## 浏览器支持

- Chrome/Edge (推荐)
- Firefox
- Safari
- 微信内置浏览器

## 开发建议

1. 建议将 localStorage 改为后端 API 接口
2. 图片上传建议使用云存储（如腾讯云 COS）
3. 添加用户登录功能
4. 添加数据分页加载
5. 优化图片压缩和懒加载

## 更新日志

### v1.0.0 (2024-11-02)
- ✅ 首页左图右信息布局
- ✅ 发布功能完整实现
- ✅ 详情页动态加载
- ✅ 搜索和筛选功能
- ✅ 底部导航栏

