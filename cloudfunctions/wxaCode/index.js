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

// ---从这里开始编写路由和逻辑---
// ---上面的内容请复制---
const moment = require('moment')
const secret = require('./secret.json')
const {encode, decode} = require('base64-arraybuffer')
const axios = require('axios')

const {
  WXMINIUser,
  WXMINIQR,
} = require('wx-js-utils');

const getAccessToken = async () => {
  let now = +moment()
  let record = await db.collection('AccessToken').where({ expireTime: db.command.gt(now) }).limit(1).get()
  if (record.data.length === 0) {
    // accessToken 已过期
    const wxMiniUser = new WXMINIUser({ appId: secret.appId, secret: secret.appSecret });
    const accessToken = await wxMiniUser.getAccessToken();
    await db.collection('AccessToken').add({ data: { accessToken, expireTime: now + 2 * 60 * 60 * 1000 } })
    return accessToken
  } else {
    return record.data[0].accessToken
  }
}

const routes = {
  async getWXAcode (data) {
    let access_token = await getAccessToken();
    let res = await axios.post("https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=" + access_token,
    {
      'page': data.path,
      'scene': data.scene,
      'width':750
    },{
      responseType: 'arraybuffer'
    })
    return encode(res.data)
    // let wXMINIQR = new WXMINIQR();
    // let qrResult = await wXMINIQR.getMiniQR({
    //   scene: data.scene,
    //   access_token,
    //   path: data.path,
    //   is_hyaline: false
    // });
    // let cloudFileCode = await cloud.uploadFile({
    //   cloudPath:'tmp/'+encode(qrResult),
    //   fileContent: qrResult
    // })
    //return cloudFileCode.fileID
  },
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