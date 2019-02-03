const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database() // 需要云数据库
let openid = '' // 获取调用用户的openid
const getUserInfoByOpenId = async (openid) => {
  let userRecord = await db.collection('User').where({ openid }).get()
  if (userRecord.data.length === 1) {
    return userRecord.data[0]
  } else {
    throw '授权无效'
  }
}
// ---上面的内容请复制---
const moment = require('moment')
const secret = require('./secret.json')
const {
  WXMINIUser,
  WXMINIMessage,
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
const sendMessage = async (userId, templateId, data, url) => {
  let now = +moment()
  let formId = await db.collection('FormId').where({ userId, expireTime: db.command.gt(now) }).orderBy('expireTime', 'asc').limit(1).get()
  let accessToken = await getAccessToken()
  if (formId.data.length === 1) {
    let openId = formId.data[0]._openid
    formId = formId.data[0].formId
    db.collection('FormId').where({formId}).remove()
    const wxMiniMessage = new WXMINIMessage({ openId, formId, templateId });
    return { 
      res:(await wxMiniMessage.sendMessage({
      access_token:accessToken,
      data,
      page: url
    }))};
  }

}
// ---从这里开始编写路由和逻辑---
const routes = {
  async question(data) {
    // 获取问题id和答疑室id
    let { questionId, discussionRoomId } = data
    let discussionRoomInfo = (await db.collection('DiscussionRoom').doc(discussionRoomId).get()).data
    let notificateUserId = discussionRoomInfo.hostId
    let notificateUserInfo = (await db.collection('User').doc(notificateUserId).get()).data
    let questionInfo = (await db.collection('Question').doc(questionId).get()).data
    // 插入到Notification集合
    data = {
      toUser: notificateUserId,
      top: `${questionInfo.questionerName} 在答疑室 ${discussionRoomInfo.courseName} 中提问：`,
      title: questionInfo.title,
      content: questionInfo.description.slice(0, 100) + '...',
      url: `/pages/question/detail?questionId=${questionId}`,
      timestamp: +moment()
    }
    await db.collection('Notification').add({ data })
    return await sendMessage(notificateUserId, 'YTu_6AnPAdbK7zJWOLEXScoguaG-0cKGNg6ABn_9ow0', 
    { keyword1: { value: questionInfo.title },
    keyword2:{value:`提问人 - ${questionInfo.questionerName}`},
    keyword3:{value:`来自${discussionRoomInfo.courseName}`}
   }, data.url);
  },
  async answer(data) {
    // 获取问题id和答案id
    let { questionId, answerId } = data
    let questionInfo = (await db.collection('Question').doc(questionId).get()).data
    let notificateUserId = questionInfo.questionerId
    let notificateUserInfo = (await db.collection('User').doc(notificateUserId).get()).data
    let answerInfo = (await db.collection('Answer').doc(answerId).get()).data
    // 插入到Notification集合
    data = {
      toUser: notificateUserId,
      top: `${answerInfo.respondentName} 回答了你的问题：`,
      title: questionInfo.title,
      content: `答：${answerInfo.description.slice(0, 100)}...`,
      url: `/pages/question/detail?questionId=${questionId}`,
      timestamp: +moment()
    }
    await db.collection('Notification').add({ data })
    return await sendMessage(notificateUserId, 'q_oqofCZfWBYb23HsKDqCqHB3Dbfh_pKyZFUw94ODg4', 
    { keyword1: { value: questionInfo.title },
    keyword2:{value:answerInfo.respondentName},
    keyword3:{value:answerInfo.description.slice(0, 50)}
   }, data.url);
  },
  async clear(data) {
    let { notificationId } = data
    await db.collection('Notification').doc(notificationId).remove()
    return '成功'
  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  openid = wxContext.OPENID // 获取调用用户的openid
  let { path, data } = event
  if (routes[path] instanceof Function) {
    try {
      let result = await routes[path](data)
      return {
        success: true,
        data: result
      }
    } catch (e) {
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