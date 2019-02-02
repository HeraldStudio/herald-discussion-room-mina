const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database() // 需要云数据库
let openid = '' // 获取调用用户的openid
const _=db.command
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
// ---从这里开始编写路由和逻辑---
const routes = {
  async delete({questionId}) {
    if(typeof questionId!== 'string'){
      throw Error("调用方法错误")
    }
    let userinfo=await getUserInfoByOpenId(openid)
    //获取问题的document
    let record_question=await db.collection("Question").where({_id:questionId}).get()
    if(record_question.data.length==0){
      throw Error("目标问题不存在")
    }
    record_question=record_question.data[0]

    let count_room = await db.collection("DiscussionRoom").where({
      _id: record_question.discussionRoomId,
      hostId: userinfo._id
    }).count()
    let count_assistant = await db.collection("Assistant").where({
      discussionRoomId: record_question.discussionRoomId,
      assistantId:userinfo._id
    }).count()
    
    // 判断权限
    if(count_assistant.total+count_room.total==0){
      throw Error("权限不允许")
    }

    //级联删除关注
    await db.collection("WatchQuestion").where({questionId}).remove()
    //级联删除答案
    let ret=[]
    let questions=(await db.collection("Answer").where({questionId}).get()).data
    for(let each of questions){
      ret.push(await cloud.callFunction({
        name:"answer",
        data:{
          path:"delete",
          data:{
            answerId:each._id,
            __id__:openid
          }
        }
      }))
    }
    //删除操作
    await db.collection("Question").doc(questionId).remove();
    if (record_question.imageCode){
      await cloud.deleteFile({fileList:[record_question.imageCode]})
    }
    
    return ret
  },
  async watch({ questionId , setOrCancel }) {
    if(typeof questionId !=='string'||
    typeof setOrCancel!=='boolean'){
      throw Error("调用方法错误")
    }
    const userinfo=await getUserInfoByOpenId(openid)
    let record_question=await db.collection("Question").where({_id:questionId}).get()
    if(record_question.data.length==0){
      throw Error("目标问题不存在")
    }
    const record_watch = await db.collection('WatchQuestion').where({
      questionId,
      watcherId:userinfo._id
    }).get()    

    if(setOrCancel){
      if(record_watch.data.length!==0)
        throw Error("请勿重复关注")
      const count_userTotalWatch = await db.collection('WatchQuestion').where({
        watcherId:userinfo._id
      }).count()
      if(count_userTotalWatch.total>=100){
        throw Error("已达关注上限100")
      }

      //构造插入的document
      let data={
        questionId:questionId,
        watcherId:userinfo._id,
        watcherName:userinfo.name,
        watchTime:+moment()
      }
      let result = await db.collection("WatchQuestion").add({data})
      if(!result._id){
        throw Error("关注失败")
      }
      await db.collection("Question").doc(questionId).update({
        data:{
          watch:_.inc(1)
        }
      })
      return 1
    }else{
      if (record_watch.data.length == 0)
        throw Error("你还没有关注这个问题")
      let result = await db.collection('WatchQuestion').doc(record_watch.data[0]._id).remove()
      if(result.stats.removed!==1){
        throw Error("取消关注失败")
      }
      await db.collection("Question").doc(questionId).update({
        data: {
          watch: _.inc(-1)
        }
      })
      return 1
    }
  },
  async selected({ questionId, setOrCancel }){
    if (typeof questionId !== 'string' ||
      typeof setOrCancel !== 'boolean') {
      throw Error("调用方法错误")
    }
    const userinfo = await getUserInfoByOpenId(openid)
    let record_question=await db.collection("Question").where({_id:questionId}).get()
    if(record_question.data.length==0){
      throw Error("目标问题不存在")
    }
    record_question=record_question.data[0]

    //权限判断
    const count_room = await db.collection("DiscussionRoom").where({
      _id:record_question.discussionRoomId,
      hostId:userinfo._id
    }).count()
    const count_assistant=await db.collection("Assistant").where({
      discussionRoomId: record_question.discussionRoomId,
      assistantId: userinfo._id
    }).count()

    if(count_assistant.total+count_room.total==0){
      throw Error("权限不允许")
    }

    if(!(record_question.isSelected^setOrCancel)){
      throw Error("请勿重复设置")
    }

    //更新数据库
    let result = await db.collection("Question").doc(questionId).update({
      data: {
        isSelected: setOrCancel,
        lastModifiedTime:+moment()
      }
    })
    if(result.stats.updated==1){
      return 1
    }else{
      throw Error("设置失败")
    }
  },
  async setRead({ questionId }){
    if (typeof questionId !== 'string') {
      throw Error("调用方法错误")
    }
    const userinfo = await getUserInfoByOpenId(openid)
    let record_question=await db.collection("Question").where({_id:questionId}).get()
    if(record_question.data.length==0){
      throw Error("目标问题不存在")
    }
    record_question=record_question.data[0]

    //权限判断
    const count_room = await db.collection("DiscussionRoom").where({
      _id:record_question.discussionRoomId,
      hostId:userinfo._id
    }).count()
    const count_assistant=await db.collection("Assistant").where({
      discussionRoomId: record_question.discussionRoomId,
      assistantId: userinfo._id
    }).count()

    if(count_assistant.total+count_room.total==0){
      throw Error("权限不允许")
    }
    
    if(record_question.hasRead){
      throw Error("请勿重复设置")
    }
    let result = await db.collection("Question").doc(questionId).update({
      data:{
        hasRead:true,
        lastModifiedTime:+moment()
      }
    })
    if(result.stats.updated==1){
      return 1
    }else{
      throw Error("设置失败")
    }

  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  //增加一个__id__的用户参数，是为了解决云函数内调用云函数的时候内层云函数无法获取外层openid的问题
  //属于牺牲部分安全性而换取程序灵活性的行为（如果要取消这一部分的话，需要修改的是级联删除操作部分，其他部分
  //与__id__不相关）

  openid = wxContext.OPENID || event.data.__id__// 获取调用用户的openid
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