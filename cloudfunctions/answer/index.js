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
const _=db.command
// ---从这里开始编写路由和逻辑---
const routes = {
  async delete({ answerId }) {
    if (typeof answerId !== 'string') {
      throw Error("调用方法错误")
    }
    let userinfo = await getUserInfoByOpenId(openid)

    //下面都是为了判断权限
    let record_answer = await db.collection("Answer").where({ _id: answerId }).get()
    if (record_answer.data.length == 0) {
      throw Error("目标答案不存在")
    }
    record_answer = record_answer.data[0]

    let record_question = await db.collection("Question").where({ _id: record_answer.questionId }).get()
    if (record_question.data.length == 0) {
      throw Error("答案所属问题不存在")
    }
    record_question = record_question.data[0]

    let count_room = await db.collection("DiscussionRoom").where({
      _id: record_question.discussionRoomId,
      hostId: userinfo._id
    }).count()
    let count_assistant = await db.collection("Assistant").where({
      discussionRoomId: record_question.discussionRoomId,
      assistantId: userinfo._id
    }).count()

    //判断权限，如果用户是答疑室管理员或主持人，或者用户是答案创建者
    if (count_assistant.total + count_room.total == 0 &&
      userinfo._id !== record_answer.respondentId) {
      throw Error("权限不允许")
    }

    //级联删除答案点赞
    await db.collection("VoteAnswer").where({ answerId }).remove()

    //级联删除答案评论
    let ret=[]
    let questions=(await db.collection("Comment").where({ answerId }).get()).data
    for(let each of questions){
      ret.push(await cloud.callFunction({
        name: "comment",
        data: {
          path: "delete",
          data: { 
            commentId: each._id,
            __id__:openid
          }
        }
      }))
    }
    //删除操作
    await db.collection("Answer").doc(answerId).remove()
    if (record_answer.imageCode) {
      await cloud.deleteFile({ fileList: [record_answer.imageCode] })
    }    
    return ret
  },
  async setRead({ answerId }) {
    if (typeof answerId !== 'string') {
      throw Error("调用方法错误")
    }
    const userinfo = await getUserInfoByOpenId(openid)
    let record_answer = await db.collection("Answer").where({ _id: answerId }).get()
    if (record_answer.data.length == 0) {
      throw Error("目标答案不存在")
    }
    record_answer = record_answer.data[0]

    let record_question = await db.collection("Question").where({ _id: record_answer.questionId }).get()
    if (record_question.data.length == 0) {
      throw Error("答案所属问题已不存在")
    }
    record_question = record_question.data[0]

    //权限判断
    if (record_question.questionerId !== userinfo._id) {
      throw Error("权限不允许")
    }
    if (record_answer.hasRead) {
      throw Error("请勿重复设置")
    }
    let result = await db.collection("Answer").doc(answerId).update({
      data: {
        hasRead: true,
        lastModifiedTime: +moment()
      }
    })
    if (result.stats.updated == 1) {
      return 1
    } else {
      throw Error("设置失败")
    }

  },
  async vote({ answerId, setOrCancel }) {
    if (typeof answerId !== 'string' ||
      typeof setOrCancel !== 'boolean') {
      throw Error("调用方法错误")
    }
    const userinfo = await getUserInfoByOpenId(openid)

    let record_answer = await db.collection("Answer").where({ _id: answerId }).get()
    if (record_answer.data.length == 0) {
      throw Error("目标答案不存在")
    }    
    const record_vote = await db.collection('VoteAnswer').where({
      answerId,
      voterId: userinfo._id
    }).get()

    if (setOrCancel) {
      if (record_vote.data.length !== 0)
        throw Error("你已经点过赞了")

      //点赞上限有点怪，先注释了
      // const count_userTotalVoted = await db.collection('VoteAnswer').where({
      //   voterId: userinfo._id
      // }).count()
      // if (count_userTotalWatch.total >= 100) {
      //   throw Error("已达点赞上限100")
      // }

      //构造插入的document
      let data = {
        answerId,
        voterId: userinfo._id,
        voterName: userinfo.name,
        voteTime: +moment()
      }
      let result = await db.collection("VoteAnswer").add({ data })
      if (!result._id) {
        throw Error("点赞失败")
      }
      await db.collection("Answer").doc(answerId).update({
        data: {
          vote: _.inc(1)
        }
      })
      return 1
    } else {
      if (record_vote.data.length == 0)
        throw Error("你还没有点过赞")
      let result = await db.collection('VoteAnswer').doc(record_vote.data[0]._id).remove()
      if (result.stats.removed !== 1) {
        throw Error("取消点赞失败")
      }
      await db.collection("Answer").doc(answerId).update({
        data: {
          vote: _.inc(-1)
        }
      })
      return 1
    }

  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  openid = wxContext.OPENID|| event.data.__id__ // 获取调用用户的openid
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