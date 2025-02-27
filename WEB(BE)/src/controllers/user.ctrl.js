const data = require('../models/index');
const jwt = require('../token/jwt');
const crypto = require('crypto');
const STRETCHINGKEY = 9999;

const createSalt = () =>
  new Promise((resolve, reject) => {
    crypto.randomBytes(64, (err, buf) => {
      if (err) reject(err);
      resolve(buf.toString('base64'));
    });
  });

const createHashedPassword = (plainPassword) =>
  new Promise(async (resolve, reject) => {
    const salt = await createSalt();
    crypto.pbkdf2(plainPassword, salt, STRETCHINGKEY, 64, 'sha512', (err, key) => {
      if (err) reject(err);
      resolve({ password: key.toString('base64'), salt });
    });
  });

const createHashedPasswordWithSalt = (plainPassword, salt) =>
  new Promise(async (resolve, reject) => {
    crypto.pbkdf2(plainPassword, salt, STRETCHINGKEY, 64, 'sha512', (err, key) => {
      if (err) reject(err);
      resolve(key.toString('base64'));
    });
  });

const getParticipationRate = (auth_cycle, duration, auth_count) =>{
	if(auth_count === 0){
		return 0;
	}
	
	const totalAuth = auth_cycle * duration;
	const currentAuth = auth_count;
	var rate = (currentAuth / totalAuth);
	if(rate > 1){
		rate = 1;
	}
	
	return rate;
}

const token = {
  isToken: (req, res) => {
    if (req.headers.authorization && req.headers.authorization.split(' ')[1]) {
      return true;
    } else {
      return false;
    }
  },

  decode: (req, res) => {
    if (!token.isToken(req, res)) {
      return res.status(400).json({
        success: false,
        isLogin: false,
        err: '로그인을 해주세요',
      });
    }

    const jwtToken = req.headers.authorization.split(' ')[1];
    const decoded = jwt.token.decode(jwtToken);
    return decoded;
  },
};

const output = {
  // @route GET /user/settings
  setting: async (req, res) => {
    const decoded = token.decode(req, res);

    const name = decoded.name;
    const categories = await data.user_category.get('user_no', decoded.no);

    res.json({
      success: true,
      name: name,
      category: categories,
    });
  },
  
  // @route GET /user/my
  mine: async (req, res) => {
    const decoded = token.decode(req, res);
    const host = decoded.no;

    const routines = await data.user_routine.get('user_no', host);

    var JoinedRoutine = [];

    for (const routine of routines) {
      if (routine.type == 'join') {
        const myRoutine = await data.routine.get('id', routine.routine_id);
        const userInfo = await data.user.get('no', decoded.no);
    	const authCount = (await data.auth.getTotalCount(userInfo[0].no, myRoutine[0].id))[0].count;
		
        const ParticipationRate =  getParticipationRate(myRoutine[0].auth_cycle, myRoutine[0].duration, authCount);;	

        myRoutine[0].participationRate = ParticipationRate;		
        JoinedRoutine.push(myRoutine[0]);
      }
    }

    res.json({
      success: true,
      routine: JoinedRoutine,
    });
  },
  
  // @route GET /user/my/like
  like: async (req, res) => {
    const decoded = token.decode(req, res);

    const routines = await data.user_routine.get('user_no', decoded.no);

    var likeRoutine = [];
    for (const routine of routines) {
      if (routine.type == 'like') {
        const myRoutine = await data.routine.get('id', routine.routine_id);
        const userInfo = await data.user.get('no', myRoutine[0].host);
        myRoutine[0].hostName = userInfo[0].nickname;
        likeRoutine.push(myRoutine[0]);
      }
    }

    res.json({
      success: true,
      routine: likeRoutine,
    });
  },
  
  // @route GET /user/routine/:routineId/auth
  auth: async (req, res) => {
    const decoded = token.decode(req, res);
    const myRoutine = await data.user_routine.getMyRoutine(req.params.routineId, decoded.no);
  
    var routine;
	var authRoutines;
    const authCount = (await data.auth.getTotalCount(decoded.no, myRoutine[0].routine_id))[0].count
    
    if (myRoutine[0]) {
      routine = await data.routine.get('id', req.params.routineId);
      const userInfo = await data.user.get('no', routine[0].host);
      routine[0].hostName = userInfo[0].nickname;
      
      const ParticipationRate = getParticipationRate(routine[0].auth_cycle, routine[0].duration, authCount);;
      routine[0].participationRate = ParticipationRate;
      
      authRoutines = await data.auth.getOrderByDateNoLimit(decoded.no, req.params.routineId)
		
      } else {
        return res.status(400).json({
          success : false,
          err : '루틴이 없습니다'
      })
	  }
    res.json({
      success: true,
      routine: routine[0],
	    authRoutine : authRoutines
    });
  },
	
  // @route GET /user/pointshop
  goods: async (req, res) => {
    const decoded = token.decode(req, res);

    const userInfo = await data.user.get('id', decoded.id);
    const userPoint = userInfo[0].point;

    const goods = await data.goods.getAll();

    res.json({
      success: true,
      userPoint: userPoint,
      goods: goods,
    });
  },
};

const user = {
  // @route POST /user/settings
  setInfo: (req, res) => {
    const decoded = token.decode(req, res);

    if (req.body.name) {
      data.user.update('nickname', req.body.name, decoded.id);
    } else {
      return res.status(400).json({
        success: false,
        err: '닉네임을 입력해주세요!',
      });
    }

    if (req.body.category) {
      const categories = req.body.category;
      data.user_category.delete('user_no', decoded.no);
      for (const category of categories) {
        const param = [decoded.no, category];
        data.user_category.add(param);
      }
    } else {
      return res.satus(400).json({
        success: false,
        err: '카테고리를 선택해주세요!',
      });
    }

    return res.json({
      success: true,
    });
  },

  // @route POST /user/settings/pw
  setPassword: async (req, res) => {
    if (!req.body.pw) {
      return res.status(400).json({
        success: false,
        err: '새로운 비밀번호를 입력해주세요!',
      });
    }
	  
	if (!req.body.rePw){
	  return res.status(400).json({
        success: false,
        err: '새로운 비밀번호를 재입력해주세요!',
      });
	}

    const decoded = token.decode(req, res);
	  
	if(req.body.rePw != req.body.pw){
	  return res.status(400).json({
        success: false,
        err: '입력하신 비밀번호와 재입력된 비밀번호가 다릅니다',
      });
	}

    const originalPw = await createHashedPasswordWithSalt(
      await data.user.get('id', decoded.id)[0].pw,
      await data.user.get('id', decoded.id)[0].salt
    );

    if (req.body.pw != originalPw) {
      const { password, salt } = await createHashedPassword(req.body.pw);

      data.user.update('pw', password, decoded.id);
      data.user.update('salt', salt, decoded.id);

      return res.json({
        success: true,
        msg: '비밀번호 수정 완료!',
      });
    } else {
      return res.status(400).json({
        success: true,
        err: '원래 비밀번호와 같습니다!',
      });
    }
  },
};

const routine = {
  // @route POST /user/routine/:routineId/auth
  auth: (req, res) => {
    const decoded = token.decode(req, res);

    try {
      const user_no = decoded.no;
      const routine_id = Number(req.params.routineId);
      let { week, day, date, img, text } = req.body;

      if (!week) {
        res.status(400).json({
          success: false,
          err: 'week의 정보가 없습니다!',
        });
      } else if (!day) {
        res.status(400).json({
          success: false,
          err: 'day의 정보가 없습니다!',
        });
      } else if (!img) {
        img = null;
      } else if (!text) {
        text = null;
      }

      // const param = [user_no, routine_id, week, day, img, text];
      const param = [user_no, routine_id, week, day, date, text];
      data.auth.add(param);

      res.json({
        success: true,
      });
    } catch (e) {
      res.status(400).json({
        success: false,
        err: String(e),
      });
    }
  },
};

const goods = {
  // @route POST /user/pointshop
  buy: async (req, res) => {
    const decoded = token.decode(req, res);

    const userNo = decoded.id;
    const goodsId = req.body.goods_id;

    if (!goodsId) {
      res.status(400).json({
        success: false,
        err: 'goods_Id의 정보가 없습니다!',
      });
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const dateStr = year + '-' + month + '-' + day;

    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    const seconds = ('0' + date.getSeconds()).slice(-2);
    const timeStr = hours + ':' + minutes + ':' + seconds;

    const dayStr = dateStr + ' ' + timeStr;

    const param = [userNo, goodsId, dayStr];

    data.user_goods.add(param);

    const goods = await data.goods.get('id', goodsId);

    res.json({
      success: true,
      goods: goods[0],
    });
  },
};

module.exports = {
  output,
  user,
  routine,
  goods,
};
