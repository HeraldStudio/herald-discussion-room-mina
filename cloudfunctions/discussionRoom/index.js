const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database() // 需要云数据库
let openid = '' // 获取调用用户的openid
const getUserInfoByOpenId = async(openid) => {
  let userRecord = await db.collection('User').where({openid}).get()
  if (userRecord.data.length === 1) {
    return userRecord.data[0]
  } else {
    throw '授权无效'
  }
}
// ---上面的内容请复制---
const moment = require('moment')
const uuid = require('uuid/v4')
// ---从这里开始编写路由和逻辑---
const routes = {
  async create (data) {
    let {courseName} = data
    if(!courseName){
      throw Error('调用方法错误')
    }
    let userInfo = await getUserInfoByOpenId(openid)
    if(userInfo.identity !== '教职员工'){
      throw Error('权限不允许')
    }
    let code = uuid().slice(0, 5).toUpperCase()
    let now = +moment()
    data = {
      courseName,
      code,
      hostId:userInfo._id,
      hostName:userInfo.name,
      createdTime:now,
      lastModifiedTime:now
    }
    await db.collection('DiscussionRoom').add({data})
    return data
  },
  // ... 其他部分

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