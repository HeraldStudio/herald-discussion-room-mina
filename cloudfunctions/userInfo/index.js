const cloud = require('wx-server-sdk')
cloud.init()
let openid = '' // 获取调用用户的openid
// ---上面的内容请复制---
const moment = require('moment')
const db = cloud.database() // 需要云数据库

const getUserInfoByOpenId = async (openid) => {
  let userRecord = await db.collection('User').where({ openid }).get()
  if (userRecord.data.length === 1) {
    return userRecord.data[0]
  } else {
    throw Error('授权无效')
  }
}

// ---从这里开始编写路由和逻辑---
const routes = {
  async get () {
    let record = await db.collection('User').where({openid}).get()
    if (record.data && record.data.length === 1) {
      record.data[0].openid = null // 删除openid
      return {
        authorized:true,
        data:record.data[0]
      }
    } else {
      return {
        authorized:false
      }
    }
  },
  async add (data) {
    let { cardnum, name, identity } = data
    let registrationTime = +moment()
    // 检查是否已经注册
    let oldRecord = await db.collection('User').where({openid}).get()
    if(oldRecord.data.length !== 0) {
      // 由前端逻辑限制不允许出现同一openid绑定多个一卡通的情况，出现这种情况直接拒绝
      throw '非法授权'
    }
    // 插入新记录
    await db.collection('User').add({
      data:{cardnum, name, identity, registrationTime, openid, isBanned:false}
    })
    return '授权成功'
  },
  async bindWechat({ token, appId, wechatUserId }){
    let userInfo = await getUserInfoByOpenId(openid)
    let userId = userInfo._id
    let res = await db.collection('User').doc(userId).update({
      data:{
        bindWechatAppId:appId, bindWechatToken:token, bindWechatUserId:wechatUserId
      }
    })
    // TODO:推送绑定成功提醒
    if (res.stats.updated === 1) {
      return '绑定成功'
    } else {
      throw '请勿重复绑定'
    }
    
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