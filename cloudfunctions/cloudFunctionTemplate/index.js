const cloud = require('wx-server-sdk')
cloud.init()
let openid = ''
// ---上面的内容请复制---

// ---从这里开始编写路由和逻辑---
const routes = {
  async route1 (data) {
    return '正确结果' // 执行正确结果直接返回
  },
  async route2 (data) {
    throw Error('出错') // 执行出错 throw Error
  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  openid = wxContext.OPENID // 获取调用用户的openid
  let {path, data} = event
  if (routes[path] instanceof Function) {
    try {
      let result = await routes[path](data)
      return {
        success: true,
        data: result
      }
    } catch(e) {
      return {
        success: false,
        reason: e.message
      }
    }
  } else {
    return {
      success: false,
      reason: '调用方式不正确'
    }
  }
}