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
const routes = {
  async delete({commentId }) {
    let userInfo = await getUserInfoByOpenId(openid)
    // 如果不是评论创建者，检查是否为答疑室管理员
    let commentRecord = (await db.collection('Comment').doc(commentId).get()).data
    let answerRecord = (await db.collection('Answer').doc(commentRecord.answerId).get()).data
    let questionRecord = (await db.collection('Question').doc(answerRecord.questionId).get()).data
    let discussionRoomRecord = (await db.collection('DiscussionRoom').doc(questionRecord.discussionRoomId).get()).data;
    if(commentRecord.commentatorId===userInfo._id
      ||
      discussionRoomRecord.hostId === userInfo._id){
      // 如果是答疑室创建者，可以删除
      await db.collection('Comment').doc(commentId).remove()
      return null
    }

    // 检查是否是答疑室管理员
    let count = (await db.collection('Assistant').where({assistantId:userInfo._id, discussionRoomId:discussionRoomRecord._id}).count()).total
    if(count === 1){
      // 是管理员，可以删除
      await db.collection('Comment').doc(commentId).remove()
      return null
    }

    // 执行到此处仍然没有权限
    throw Error('权限不允许')
  },
  async setRead({ commentId }) {    
    let commentRecord = (await db.collection('Comment').doc(commentId).get()).data
    let answerRecord = (await db.collection('Answer').doc(commentRecord.answerId).get()).data

    let userInfo =  await getUserInfoByOpenId(openid)

    if(userInfo._id === answerRecord.respondentId){
      await db.collection('Comment').doc(commentId).update({data:{hasRead:true}})
      return null
    }

    throw Error('权限不允许')
  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  //增加一个__id__的用户参数，是为了解决云函数内调用云函数的时候内层云函数无法获取外层openid的问题
  //属于牺牲部分安全性而换取程序灵活性的行为（如果要取消这一部分的话，需要修改的是级联删除操作部分，其他部分
  //与__id__不相关）

  openid = wxContext.OPENID || event.data.__id__// 获取调用用户的openid
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