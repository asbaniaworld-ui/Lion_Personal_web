// imageUtils.js - 图片工具函数
// 生成base64占位图，避免使用外部域名

/**
 * 生成SVG占位图并转换为base64 data URI
 * @param {string} emoji - emoji字符
 * @param {string} bgColor - 背景颜色，默认 #4A90E2
 * @param {number} size - 图片尺寸，默认 120
 * @returns {string} base64 data URI
 */
function generatePlaceholderSVG(emoji, bgColor = '#4A90E2', size = 120) {
  // 创建SVG字符串
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    <text x="50%" y="50%" font-size="${Math.floor(size * 0.5)}" text-anchor="middle" dominant-baseline="central" fill="white">${emoji}</text>
  </svg>`
  
  // 在微信小程序中，我们可以直接使用SVG data URI
  // 使用encodeURIComponent编码SVG内容
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/**
 * 预定义的占位图（使用SVG格式，支持emoji和颜色）
 */
const placeholderMap = {
  '📱': generatePlaceholderSVG('📱', '#4A90E2', 120),
  '🎒': generatePlaceholderSVG('🎒', '#4A90E2', 120),
  '💧': generatePlaceholderSVG('💧', '#4A90E2', 120),
  '🔑': generatePlaceholderSVG('🔑', '#4A90E2', 120),
  '📚': generatePlaceholderSVG('📚', '#E74C3C', 120),
  '🎧': generatePlaceholderSVG('🎧', '#4A90E2', 120),
  '📦': generatePlaceholderSVG('📦', '#4A90E2', 120)
}

/**
 * 获取默认占位图
 * @param {string} emoji - emoji字符
 * @param {string} bgColor - 背景颜色（可选）
 * @returns {string} base64 data URI
 */
function getPlaceholderImage(emoji, bgColor) {
  if (bgColor) {
    return generatePlaceholderSVG(emoji || '📦', bgColor, 120)
  }
  return placeholderMap[emoji] || placeholderMap['📦'] || generatePlaceholderSVG('📦', '#4A90E2', 120)
}

/**
 * 获取大尺寸占位图（用于详情页）
 * @param {string} emoji - emoji字符
 * @param {string} bgColor - 背景颜色（可选）
 * @returns {string} base64 data URI
 */
function getLargePlaceholderImage(emoji, bgColor) {
  const color = bgColor || '#4A90E2'
  return generatePlaceholderSVG(emoji || '📦', color, 400)
}

/**
 * 获取默认占位图URL（兼容旧代码）
 * @param {string} emoji - emoji字符
 * @returns {string} base64 data URI
 */
function getDefaultPlaceholder(emoji) {
  return getPlaceholderImage(emoji)
}

module.exports = {
  getPlaceholderImage,
  getLargePlaceholderImage,
  getDefaultPlaceholder
}

