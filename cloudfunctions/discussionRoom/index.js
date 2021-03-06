const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database() // 需要云数据库

const _ = db.command;
let openid = '' // 获取调用用户的openid
const getUserInfoByOpenId = async (openid) => {
  let userRecord = await db.collection('User').where({ openid }).get()
  if (userRecord.data.length === 1) {
    return userRecord.data[0]
  } else {
    throw Error('授权无效')
  }
}
const getUserInfoByCardnum = async (cardnum) => {
  let userRecord = await db.collection('User').where({ cardnum }).get()
  if (userRecord.data.length === 1) {
    return userRecord.data[0]
  } else {
    throw Error('用户不存在')
  }
}

// ---上面的内容请复制---
const moment = require('moment')
const uuid = require('uuid/v4')
// ---从这里开始编写路由和逻辑---
const routes = {
  async assistant({ cardnum, discussionRoomId, setOrCancel }) {
    if (typeof cardnum !== 'string' ||
      typeof discussionRoomId !== 'string' ||
      typeof setOrCancel !== 'boolean') {
      throw Error('调用方法错误')
    }
    let hostInfo = await getUserInfoByOpenId(openid);
    let roomRecord = await db.collection('DiscussionRoom')
      .where({
        _id: discussionRoomId,
        hostId: hostInfo._id
      })
      .get();
    if (roomRecord.data.length !== 1) {
      throw Error('权限不允许')
    }

    let assitantInfo = await getUserInfoByCardnum(cardnum)
    let currentAssitantRecord = await db.collection('Assistant').where({
      discussionRoomId,
      assistantId: assitantInfo._id
    }).get()
    if (setOrCancel) {
      if (currentAssitantRecord.data.length !== 0) {
        throw Error('请勿重复授权')
      }
      let countRecord = await db.collection('Assistant').where({
        assistantId: assitantInfo._id
      }).count()
      if (countRecord.total >= 100) {
        throw Error('对方已达管理上限100')
      }
      countRecord = await db.collection('Assistant').where({
        discussionRoomId
      }).count()
      if (countRecord.total >= 100) {
        throw Error('最多100名管理员')
      }
      let now = +moment()
      let data = {
        discussionRoomId,
        assistantId: assitantInfo._id,
        assistantName: assitantInfo.name,
        authTime: now
      }
      let result = await db.collection('Assistant').add({ data })
      if (result._id) {
        return 1
      } else {
        throw Error('授权失败')
      }
    } else {
      if (currentAssitantRecord.data.length === 0) {
        throw Error('目标不存在')
      }
      let result = await db.collection('Assistant').doc(currentAssitantRecord.data[0]._id).remove()
      if (result.stats.removed == 1) {
        return 1;
      } else {
        throw Error('删除失败')
      }
    }

  },

  async create(data) {
    let { courseName } = data
    if (!courseName) {
      throw Error('调用方法错误')
    }
    let userInfo = await getUserInfoByOpenId(openid)
    if (userInfo.identity !== '教职员工') {
      throw Error('权限不允许')
    }
    let record = await db.collection('DiscussionRoom').where({
      hostId: userInfo._id
    }).count()
    if (record.total >= 20) {
      throw Error('已达创建答疑室上限20')
    }
    let code = uuid().slice(0, 5).toUpperCase()
    let now = +moment()
    data = {
      courseName,
      code,
      hostId: userInfo._id,
      hostName: userInfo.name,
      createdTime: now,
      lastModifiedTime: now,
      watch: 0
    }
    let res = await db.collection('DiscussionRoom').add({ data })
    return {
      id:res._id,
      code
    }
  },

  async delete({ discussionRoomId }) {
    if (!discussionRoomId) {
      throw Error('调用方法错误')
    }
    let userInfo = await getUserInfoByOpenId(openid)
    let record = await db.collection('DiscussionRoom').where({ _id: discussionRoomId }).get()
    if (record.data.length !== 1) {
      throw Error('目标答疑室不存在')
    } else if (record.data[0].hostId === userInfo._id) {
      await db.collection('Assistant').where({ discussionRoomId }).remove()
      await db.collection('WatchDiscussionRoom').where({ discussionRoomId }).remove()
      let questions=(await db.collection("Question").where({ discussionRoomId}).get()).data

      let ret=[]//调试用，保存云函数调用结果
      for(let each of questions){
        ret.push(await cloud.callFunction({
          name:"question",
          data:{
            path:"delete",
            data:{
              questionId:each._id,
              __id__:openid
            }
          }
        }))
      }
      await db.collection('DiscussionRoom').doc(discussionRoomId).remove()
      return ret
    } else {
      throw Error('权限不允许')
    }
  },

  async getAll() {
    let userInfo = await getUserInfoByOpenId(openid)
    switch (userInfo.identity) {
      case '教职员工': {
        let host = await db.collection('DiscussionRoom').where({
          hostId: userInfo._id
        })
          .get()
        let hostRooms = host.data.map(each => {
          return { ...each, tag: '主持' }
        })

        let watches = await db.collection('WatchDiscussionRoom').where({
          watcherId: userInfo._id
        }).limit(100).get()
        let watchedRooms = []
        if (watches.data.length !== 0) {
          let tempwatchedRooms = await db.collection('DiscussionRoom').where({
            _id: _.in(watches.data.map(each => each.discussionRoomId))
          }).limit(100).get()
          watchedRooms = tempwatchedRooms.data.map(each => {
            return {
              ...each,
              tag: '关注'
            }
          })//end map
        }//end if

        let assistants = await db.collection('Assistant').where({
          assistantId: userInfo._id
        }).limit(100).get()
        let assistRooms = []
        if (assistants.data.length !== 0) {
          let tempassistRooms = await db.collection('DiscussionRoom').where({
            _id: _.in(assistants.data.map(each => each.discussionRoomId))
          }).limit(100).get()
          assistRooms = tempassistRooms.data.map(each => {
            return {
              ...each,
              tag: '管理'
            }
          })//end map
        }//end if

        return [...watchedRooms, ...hostRooms, ...assistRooms]

      }
      case '本科生':
      case '研究生': {
        let watches = await db.collection('WatchDiscussionRoom').where({
          watcherId: userInfo._id
        }).limit(100).get()
        let watchedRooms = []
        if (watches.data.length !== 0) {
          let tempwatchedRooms = await db.collection('DiscussionRoom').where({
            _id: _.in(watches.data.map(each => each.discussionRoomId))
          }).limit(100).get()
          watchedRooms = tempwatchedRooms.data.map(each => {
            return {
              ...each,
              tag: '关注'
            }
          })//end map
        }//end if

        let assistants = await db.collection('Assistant').where({
          assistantId: userInfo._id
        }).limit(100).get()
        let assistRooms = []
        if (assistants.data.length !== 0) {
          let tempassistRooms = await db.collection('DiscussionRoom').where({
            _id: _.in(assistants.data.map(each => each.discussionRoomId))
          }).limit(100).get()
          assistRooms = tempassistRooms.data.map(each => {
            return {
              ...each,
              tag: '管理'
            }
          })//end map
        }//end if
        return [
          ...watchedRooms,
          ...assistRooms
        ]
      }//end case
      default:
        //不应执行到此步
        throw Error('未知身份')
    }
  },
  async watch({ discussionRoomId, setOrCancel }) {
    if (typeof discussionRoomId !== 'string' ||
      typeof setOrCancel !== 'boolean') {
      throw Error('调用方法错误')
    }
    let userInfo = await getUserInfoByOpenId(openid)

    let currentWatchRecord = await db.collection('WatchDiscussionRoom').where({
      discussionRoomId,
      watcherId: userInfo._id
    }).get()

    if (setOrCancel) {
      if (currentWatchRecord.data.length != 0) {
        throw Error('请勿重复关注')
      }
      const countRecord = await db.collection('WatchDiscussionRoom').where({
        watcherId: userInfo._id
      }).count()
      if (countRecord.total >= 100) {
        throw Error('已达关注上限100')
      }
      let now = +moment()
      let data = {
        discussionRoomId,
        watcherId: userInfo._id,
        watcherName: userInfo.name,
        watchTime: now
      }
      let result = await db.collection('WatchDiscussionRoom').add({ data })
      if (result._id) {
        await db.collection('DiscussionRoom').doc(discussionRoomId).update({
          data: { watch: _.inc(1) }
        })
        return 1
      } else {
        throw Error('关注失败')
      }
    } else {
      if (currentWatchRecord.data.length == 0) {
        throw Error('取消关注失败')
      }
      let result = await db.collection('WatchDiscussionRoom').doc(currentWatchRecord.data[0]._id).remove()
      if (result.stats.removed == 1) {
        await db.collection('DiscussionRoom').doc(discussionRoomId).update({
          data: { watch: _.inc(-1) }
        })
        return 1
      } else {
        throw Error('取消关注失败')
      }
    }

  }
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  //增加一个__id__的用户参数，是为了解决云函数内调用云函数的时候内层云函数无法获取外层openid的问题
  //属于牺牲部分安全性而换取程序灵活性的行为（如果要取消这一部分的话，需要修改的是级联删除操作部分，其他部分
  //与__id__不相关）

  openid = wxContext.OPENID || event.data.__id__ // 获取调用用户的openid
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